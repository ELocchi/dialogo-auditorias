-- Durable jobs. Only trusted application/worker code can call these RPCs.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('job-inputs','job-inputs',false,33554432,array['application/octet-stream']);
create table dialogo_private.background_jobs (
 id uuid primary key default gen_random_uuid(), actor uuid not null references auth.users(id),
 profile text not null, scope text not null default '', admin text not null default '',
 kind text not null check(kind in ('publish-audit','publish-plan','scheduled-pdf','standalone-pdf','save-audit')),
 target uuid not null, revision integer not null default 0 check(revision>=0),
 payload jsonb not null default '{}' check(octet_length(payload::text)<=2097152),
 status text not null default 'queued' check(status in ('queued','running','succeeded','failed')),
 stage text not null default 'queued', attempts integer not null default 0, attempt_limit integer not null default 3,
 lease_token uuid, lease_until timestamptz, available_at timestamptz not null default now(),
 error_code text, retryable boolean not null default true, result jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(actor,profile,scope,admin,kind,target,revision)
);
alter table dialogo_private.background_jobs enable row level security;
revoke all on dialogo_private.background_jobs from public,anon,authenticated,service_role;
create index background_jobs_pending on dialogo_private.background_jobs(available_at,created_at) where status='queued';
create index background_jobs_leases on dialogo_private.background_jobs(lease_until) where status='running';
create index background_jobs_input on dialogo_private.background_jobs((payload->>'inputPath')) where kind='save-audit';
create index background_jobs_actor on dialogo_private.background_jobs(actor,created_at desc,id desc);

create function dialogo_private.job_source(j dialogo_private.background_jobs) returns jsonb
language plpgsql security definer set search_path='' as $f$
declare v jsonb; visit_id uuid; photos jsonb; file_count integer;
begin
 perform set_config('request.jwt.claim.sub',j.actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',j.actor,'role','authenticated')::text,true);
 perform dialogo_private.require_published_audit_profile(j.profile,nullif(j.scope,''),nullif(j.admin,''));
 if j.kind in ('publish-audit','save-audit','publish-plan') then
  return public.publication_command(j.actor,j.profile,nullif(j.scope,''),nullif(j.admin,''),
   case when j.kind='publish-plan' then 'read-plan' else 'read-audit' end,j.target);
 elsif j.kind='standalone-pdf' then
  v:=public.read_standalone_follow_up_reports(j.profile,nullif(j.scope,''),nullif(j.admin,''),j.target)->'reports'->0;
  if v is null then raise exception using errcode='42501',message='job_access_denied'; end if;
  return v;
 else
  select r.visit_id into visit_id from public.follow_up_reports r where r.id=j.target;
  v:=public.read_follow_up_report_detail(visit_id,j.profile,nullif(j.scope,''),nullif(j.admin,''),j.target);
  if v->'report' is null or v->'report'='null'::jsonb then raise exception using errcode='42501',message='job_access_denied'; end if;
  -- Metadata only, scoped to the already authorized immutable report.
  with files as materialized (select split_part(o.name,'/',3) file from storage.objects o
    where o.bucket_id='follow-up-photos' and o.name like (v->'visit'->>'auditorId')||'/'||visit_id::text||'/%'
      and array_length(string_to_array(o.name,'/'),1)=3 order by o.name limit 1000)
  select count(*),coalesce(jsonb_agg(jsonb_build_object('fileName',x.file,'findingId',lower(split_part(x.file,'_',1)),'scopeId',visit_id))
   filter(where x.file ~* '^[0-9a-f-]{36}_[0-9a-f-]{36}\.(jpg|png)$'
    and exists(select 1 from jsonb_array_elements(v->'report'->'findings') f where f->>'id'=lower(split_part(x.file,'_',1)))),'[]')
  into file_count,photos from files x;
  if file_count>=1000 then raise exception using errcode='54000',message='job_photo_limit'; end if;
  return v||jsonb_build_object('photos',photos||(v->'workPhotos'),'workName',(select nome from public.access_works where id=(v->'visit'->>'workId')::uuid));
 end if;
end;$f$;
revoke all on function dialogo_private.job_source(dialogo_private.background_jobs) from public,anon,authenticated,service_role;

create function dialogo_private.job_status(j dialogo_private.background_jobs) returns jsonb language sql immutable set search_path='' as $f$
 select jsonb_build_object('id',j.id,'kind',j.kind,'target',j.target,'revision',j.revision,'status',j.status,
 'stage',j.stage,'attempts',j.attempts,'retryable',j.retryable and j.attempts<9,'errorCode',j.error_code,
 'createdAt',j.created_at,'updatedAt',j.updated_at,'result',case when j.status='succeeded' then j.result else null end)
$f$;
revoke all on function dialogo_private.job_status(dialogo_private.background_jobs) from public,anon,authenticated,service_role;

create function public.background_job_request(p_actor uuid,p_profile text,p_scope text,p_admin text,p_operation text,
 p_id uuid default null,p_kind text default null,p_target uuid default null,p_revision integer default 0,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $f$
declare j dialogo_private.background_jobs; source jsonb; result jsonb:='[]';
begin
 if p_actor is null then raise exception using errcode='42501',message='actor_required'; end if;
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
 perform dialogo_private.require_published_audit_profile(p_profile,p_scope,p_admin);
 if p_operation='list' then
  select coalesce(jsonb_agg(dialogo_private.job_status(x)-'result' order by x.created_at desc,x.id desc),'[]') into result
   from (select * from dialogo_private.background_jobs where actor=p_actor and profile=p_profile
    and scope=coalesce(p_scope,'') and admin=coalesce(p_admin,'') order by created_at desc,id desc limit 40) x;
  return result;
 elsif p_operation='enqueue' then
  if p_kind not in ('publish-audit','publish-plan','scheduled-pdf','standalone-pdf','save-audit') or p_kind is null
   or p_target is null or p_revision is null or p_revision<0 then raise exception using errcode='22023',message='invalid_job'; end if;
  j.actor:=p_actor;j.profile:=p_profile;j.scope:=coalesce(p_scope,'');j.admin:=coalesce(p_admin,'');j.kind:=p_kind;j.target:=p_target;j.revision:=p_revision;
  source:=dialogo_private.job_source(j);
  -- One pending document/version per actor; repeated requests return the same ID.
  perform pg_advisory_xact_lock(hashtextextended('jobs:'||p_actor::text,0));
  select * into j from dialogo_private.background_jobs where actor=p_actor and profile=p_profile and scope=coalesce(p_scope,'') and admin=coalesce(p_admin,'') and kind=p_kind and target=p_target and revision=p_revision;
  if found then
   if j.payload is distinct from p_payload then raise exception using errcode='40001',message='job_payload_changed'; end if;
   return dialogo_private.job_status(j);
  end if;
  if p_kind in ('publish-audit','save-audit') and source->>'published_at' is null and (source->>'revision')::int<>p_revision
   or p_kind='publish-plan' and source->'publication' is null and coalesce((source->'draft'->>'revision')::int,-1)<>p_revision then
   raise exception using errcode='40001',message='job_revision_changed'; end if;
  if (select count(*) from dialogo_private.background_jobs where actor=p_actor and status in ('queued','running'))>=10 then
   raise exception using errcode='54000',message='job_queue_full'; end if;
  insert into dialogo_private.background_jobs(actor,profile,scope,admin,kind,target,revision,payload)
   values(p_actor,p_profile,coalesce(p_scope,''),coalesce(p_admin,''),p_kind,p_target,p_revision,p_payload) returning * into j;
 else
  select * into j from dialogo_private.background_jobs where id=p_id and actor=p_actor and profile=p_profile
   and scope=coalesce(p_scope,'') and admin=coalesce(p_admin,'') for update;
  if not found then raise exception using errcode='42501',message='job_access_denied'; end if;
  perform dialogo_private.job_source(j);
  if p_operation='retry' then
   if j.status='failed' and j.retryable and j.attempts<9 then
    update dialogo_private.background_jobs set status='queued',stage='queued',attempt_limit=least(9,attempts+3),
     available_at=clock_timestamp(),error_code=null,updated_at=clock_timestamp() where id=j.id returning * into j;
   end if;
  elsif p_operation<>'get' then raise exception using errcode='22023',message='invalid_job_operation'; end if;
 end if;
 return dialogo_private.job_status(j);
end;$f$;

create function public.background_job_worker(p_operation text,p_id uuid default null,p_token uuid default null,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $f$
declare j dialogo_private.background_jobs; v_result jsonb;
begin
 if p_operation='metrics' then
  return (select jsonb_build_object('queued',count(*) filter(where status='queued'),
   'running',count(*) filter(where status='running'),'failed24h',count(*) filter(where status='failed' and updated_at>now()-interval '24 hours'),
   'oldestQueuedSeconds',coalesce(extract(epoch from now()-min(created_at) filter(where status='queued')),0)) from dialogo_private.background_jobs);
 end if;
 if p_operation='cleanup-inputs' then
  -- Only temporary originals; published PDFs and application photos are untouched.
  -- Keep failed inputs for explicit recovery. The path includes the draft revision.
  return coalesce((select jsonb_agg(name) from (select o.name from storage.objects o
   where o.bucket_id='job-inputs' and o.created_at<clock_timestamp()-interval '48 hours'
    and not exists(select 1 from dialogo_private.background_jobs x where x.payload->>'inputPath'=o.name
     and x.status<>'succeeded')
   order by o.created_at,o.name limit 100) files),'[]');
 end if;
 if p_operation='claim' then
  -- An abandoned lease gets bounded retries, including after process/container death.
  update dialogo_private.background_jobs set status=case when attempts>=attempt_limit then 'failed' else 'queued' end,
   stage='queued',error_code='worker_interrupted',lease_token=null,lease_until=null,available_at=clock_timestamp(),updated_at=clock_timestamp()
   where status='running' and lease_until<clock_timestamp();
  select * into j from dialogo_private.background_jobs where status='queued' and available_at<=clock_timestamp()
   order by available_at,created_at for update skip locked limit 1;
  if not found then return null; end if;
  update dialogo_private.background_jobs set status='running',stage='starting',attempts=attempts+1,
   lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '240 seconds',updated_at=clock_timestamp()
   where id=j.id returning * into j;
  return to_jsonb(j);
 end if;
 select * into j from dialogo_private.background_jobs where id=p_id and status='running' and lease_token=p_token
  and lease_until>clock_timestamp() for update;
 if not found then raise exception using errcode='40001',message='job_lease_lost'; end if;
 if p_operation='source' then return dialogo_private.job_source(j);
 elsif p_operation='publication' then
  if j.kind not in ('publish-audit','publish-plan','save-audit') or p_payload->>'operation' not in
   (case when j.kind='publish-plan' then 'read-plan' else 'read-audit' end,j.kind) then
   raise exception using errcode='42501',message='invalid_job_publication'; end if;
  v_result:=public.publication_command(j.actor,j.profile,nullif(j.scope,''),nullif(j.admin,''),p_payload->>'operation',j.target,j.revision,coalesce(p_payload->'payload','{}'));
  if p_payload->>'operation'='save-audit' then
   update dialogo_private.background_jobs set result=jsonb_build_object('revision',(v_result->>'revision')::integer) where id=j.id;
  end if;
  return v_result;
 elsif p_operation='progress' then
  if p_payload->>'stage' not in ('evidence','pdf','storage','finalizing') then raise exception using errcode='22023',message='invalid_job_stage'; end if;
  update dialogo_private.background_jobs set stage=p_payload->>'stage',updated_at=clock_timestamp() where id=j.id;
 elsif p_operation='complete' then
  perform dialogo_private.job_source(j);
  update dialogo_private.background_jobs set status='succeeded',stage='done',result=p_payload,error_code=null,lease_token=null,lease_until=null,updated_at=clock_timestamp() where id=j.id;
 elsif p_operation='fail' then
  update dialogo_private.background_jobs set status=case when coalesce((p_payload->>'retryable')::boolean,false) and attempts<attempt_limit then 'queued' else 'failed' end,
   stage='queued',retryable=coalesce((p_payload->>'retryable')::boolean,false),error_code=left(p_payload->>'code',60),
   available_at=clock_timestamp()+make_interval(secs=>least(300,5*power(2,attempts)::int)),lease_token=null,lease_until=null,updated_at=clock_timestamp() where id=j.id;
 else raise exception using errcode='22023',message='invalid_worker_operation'; end if;
 return jsonb_build_object('ok',true);
end;$f$;
revoke all on function public.background_job_request(uuid,text,text,text,text,uuid,text,uuid,integer,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.background_job_worker(text,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.background_job_request(uuid,text,text,text,text,uuid,text,uuid,integer,jsonb) to service_role;
grant execute on function public.background_job_worker(text,uuid,uuid,jsonb) to service_role;
-- Transactional handoff: saving an immutable orientative report also saves its job.
create function dialogo_private.enqueue_report_pdf() returns trigger language plpgsql security definer set search_path='' as $f$
declare module text;
begin
 if tg_table_name='follow_up_reports' then
  select modulo into module from public.audit_visits where id=new.visit_id;
 else module:=new.modulo; end if;
 perform public.background_job_request(new.auditor_auth_user_id,
  case module when 'QUALIDADE' then 'AUDITOR_QUALIDADE' else 'AUDITOR_SEGURANCA' end,null,null,'enqueue',null,
  case when tg_table_name='follow_up_reports' then 'scheduled-pdf' else 'standalone-pdf' end,new.id);
 return new;
end;$f$;
revoke all on function dialogo_private.enqueue_report_pdf() from public,anon,authenticated,service_role;
create trigger enqueue_report_pdf after insert on public.follow_up_reports for each row execute function dialogo_private.enqueue_report_pdf();
create trigger enqueue_report_pdf after insert on public.standalone_follow_up_reports for each row execute function dialogo_private.enqueue_report_pdf();
notify pgrst,'reload schema';
commit;

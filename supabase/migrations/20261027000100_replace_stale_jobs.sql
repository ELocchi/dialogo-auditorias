-- A failed or not-yet-claimed job no longer pins its revision: new content replaces it.
-- Before, a failed save-audit raised job_payload_changed on every later autosave forever.
begin;
create or replace function public.background_job_request(p_actor uuid,p_profile text,p_scope text,p_admin text,p_operation text,
 p_id uuid default null,p_kind text default null,p_target uuid default null,p_revision integer default 0,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $f$
declare j dialogo_private.background_jobs; source jsonb; result jsonb:='[]'; existing boolean;
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
  select * into j from dialogo_private.background_jobs where actor=p_actor and profile=p_profile and scope=coalesce(p_scope,'') and admin=coalesce(p_admin,'') and kind=p_kind and target=p_target and revision=p_revision for update;
  existing:=found;
  if existing and j.payload is not distinct from p_payload then return dialogo_private.job_status(j); end if;
  -- Running or finished work keeps its content; the caller must reopen the document.
  if existing and j.status not in ('failed','queued') then raise exception using errcode='PT409',message='job_payload_changed'; end if;
  if p_kind in ('publish-audit','save-audit') and source->>'published_at' is null and (source->>'revision')::int<>p_revision
   or p_kind='publish-plan' and source->'publication' is null and coalesce((source->'draft'->>'revision')::int,-1)<>p_revision then
   raise exception using errcode='PT409',message='job_revision_changed'; end if;
  if (select count(*) from dialogo_private.background_jobs where actor=p_actor and status in ('queued','running') and id is distinct from j.id)>=10 then
   raise exception using errcode='54000',message='job_queue_full'; end if;
  if existing then
   -- The superseded staged input becomes unreferenced and is removed by cleanup-inputs.
   update dialogo_private.background_jobs set payload=p_payload,status='queued',stage='queued',attempts=0,attempt_limit=3,
    lease_token=null,lease_until=null,available_at=clock_timestamp(),error_code=null,retryable=true,result=null,updated_at=clock_timestamp()
    where id=j.id returning * into j;
  else
   insert into dialogo_private.background_jobs(actor,profile,scope,admin,kind,target,revision,payload)
    values(p_actor,p_profile,coalesce(p_scope,''),coalesce(p_admin,''),p_kind,p_target,p_revision,p_payload) returning * into j;
  end if;
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
notify pgrst,'reload schema';
commit;

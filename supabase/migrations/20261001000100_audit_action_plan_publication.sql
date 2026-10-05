-- Server-only publication pipeline. User JWTs cannot supply grades, criteria or PDFs.
begin;
create table public.audit_drafts (
 id uuid primary key default gen_random_uuid(),
 visit_id uuid not null unique references public.audit_visits(id) on delete restrict,
 work_id uuid not null references public.access_works(id) on delete restrict,
 work_name text not null,
 modulo text not null check(modulo in ('QUALIDADE','SEGURANCA')),
 model_id text not null,
 audit_date date not null,
 auditor_auth_user_id uuid not null references auth.users(id) on delete restrict,
 auditor_name text not null,
 catalog_revision_id uuid references public.audit_catalog_revisions(id),
 catalog_version integer not null,
 catalog_revision_label text not null,
 criteria jsonb not null check(dialogo_private.valid_catalog_criteria(criteria)),
 fvs_services jsonb not null check(jsonb_typeof(fvs_services)='array'),
 responses jsonb not null default '{}' check(jsonb_typeof(responses)='object' and octet_length(responses::text)<=2097152),
 photos jsonb not null default '{}' check(jsonb_typeof(photos)='object'),
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 published_at timestamptz
);
create index audit_drafts_owner on public.audit_drafts(auditor_auth_user_id) where published_at is null;
create table public.action_plan_drafts (
 audit_id uuid primary key references public.published_audits(id) on delete restrict,
 rows jsonb not null check(jsonb_typeof(rows)='array' and octet_length(rows::text)<=2097152),
 revision integer not null check(revision>0),
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default clock_timestamp()
);
create table public.published_action_plans (
 audit_id uuid primary key references public.published_audits(id) on delete restrict,
 work_id uuid not null references public.access_works(id),
 modulo text not null check(modulo in ('QUALIDADE','SEGURANCA')),
 rows jsonb not null check(jsonb_typeof(rows)='array' and jsonb_array_length(rows)>0),
 revision integer not null,
 author_id uuid not null references auth.users(id),
 author_name text not null,
 report_file_name text not null check(report_file_name ~ '^[a-f0-9]{64}\.pdf$'),
 published_at timestamptz not null default clock_timestamp()
);
create trigger published_action_plans_immutable before update or delete on public.published_action_plans
 for each row execute function dialogo_private.reject_catalog_revision_mutation();
create trigger published_action_plans_no_truncate before truncate on public.published_action_plans
 for each statement execute function dialogo_private.reject_catalog_revision_mutation();
alter table public.audit_drafts enable row level security;
alter table public.action_plan_drafts enable row level security;
alter table public.published_action_plans enable row level security;
revoke all on public.audit_drafts, public.action_plan_drafts, public.published_action_plans from public,anon,authenticated,service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values ('audit-drafts','audit-drafts',false,8388608,array['image/jpeg']),
 ('action-plans','action-plans',false,41943040,array['application/pdf']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- Exact source visit prevents ambiguity when more than one visit shares a day.
create or replace function dialogo_private.complete_matching_visit_after_audit_publication()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare v_ids uuid[]; v_visit public.audit_visits%rowtype; v_before jsonb; v_source uuid;
begin
 select visit_id into v_source from public.audit_drafts where id=new.id;
 select array_agg(v.id order by v.created_at,v.id) into v_ids from public.audit_visits v
 where v.visit_kind='AUDITORIA' and v.cancelled_at is null and v.published_audit_id is null
 and v.obra_id=new.work_id and v.modulo=new.modulo and v.modelo_id=new.model_id
 and v.auditor_auth_user_id=new.auditor_auth_user_id and v.data_prevista=new.audit_date
 and (v_source is null or v.id=v_source);
 if cardinality(v_ids)>1 or (v_source is not null and coalesce(cardinality(v_ids),0)<>1) then
  raise exception using errcode='40001',message='published_audit_visit_conflict'; end if;
 if cardinality(v_ids)=1 then
  select * into v_visit from public.audit_visits where id=v_ids[1] for update;
  if v_visit.cancelled_at is not null or v_visit.published_audit_id is not null then
   raise exception using errcode='40001',message='published_audit_visit_conflict'; end if;
  v_before:=to_jsonb(v_visit);
  update public.audit_visits set published_audit_id=new.id,revision=revision+1,
   updated_by=new.auditor_auth_user_id,updated_at=new.published_at where id=v_visit.id returning * into v_visit;
  insert into public.audit_visit_events(visit_id,revision,event_type,before_snapshot,after_snapshot,actor_auth_user_id,occurred_at)
   values(v_visit.id,v_visit.revision,'published',v_before,to_jsonb(v_visit),new.auditor_auth_user_id,new.published_at);
 end if;
 return new;
end;
$fn$;

create function dialogo_private.publication_can_read(p_profile text,p_scope text,p_admin text,p_work uuid,p_module text)
returns boolean language sql stable security definer set search_path='' as $fn$
 select case when p_profile='ENGENHARIA' then public.has_current_engineering_scope(p_scope,p_work,p_module)
 when p_profile='ADMINISTRATIVO' then public.has_current_administrative_module(p_module)
   and (p_admin='GERAL' or p_admin=p_module) and public.has_current_access_grant(p_profile,p_work,p_module)
 else p_profile=case p_module when 'QUALIDADE' then 'AUDITOR_QUALIDADE' else 'AUDITOR_SEGURANCA' end
   and public.has_current_access_grant(p_profile,p_work,p_module) end;
$fn$;
revoke all on function dialogo_private.publication_can_read(text,text,text,uuid,text) from public,anon,authenticated,service_role;

-- Limit direct Storage reads to files actually committed in the immutable snapshot.
-- Failed or superseded attempts may have staged other hashes under the same prefix.
create function public.can_read_published_audit_file(p_name text)
returns boolean language plpgsql stable security definer set search_path='' as $fn$
declare v_work_id uuid; v_audit_id uuid; file_name text;
begin
 if p_name !~* '^[a-f0-9-]{36}/[a-f0-9-]{36}/[^/]+$' then return false; end if;
 begin v_work_id:=split_part(p_name,'/',1)::uuid; v_audit_id:=split_part(p_name,'/',2)::uuid;
 exception when invalid_text_representation then return false; end;
 file_name:=split_part(p_name,'/',3);
 return public.can_read_published_audit_storage(v_work_id,v_audit_id) and exists(
  select 1 from public.published_audits a where a.id=v_audit_id and a.work_id=v_work_id
   and (a.report_file_name=file_name or a.evidence_files ? file_name));
end;
$fn$;
revoke all on function public.can_read_published_audit_file(text) from public,anon,authenticated,service_role;
grant execute on function public.can_read_published_audit_file(text) to authenticated;
drop policy published_audits_read_authorized on storage.objects;
create policy published_audits_read_authorized on storage.objects for select to authenticated
 using(bucket_id='published-audits' and public.can_read_published_audit_file(name));

create function public.publication_command(p_actor uuid,p_profile text,p_scope text,p_admin text,
 p_operation text,p_id uuid default null,p_revision integer default null,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare d public.audit_drafts%rowtype; v public.audit_visits%rowtype; a public.published_audits%rowtype;
 r public.audit_catalog_revisions%rowtype; plan public.action_plan_drafts%rowtype;
 pub public.published_action_plans%rowtype; result jsonb; file text; v_name text; v_now timestamptz:=clock_timestamp();
begin
 -- Only the trusted server can set p_actor. auth.uid is transaction-local and
 -- used by existing permission predicates, including current email/account state.
 if p_actor is null then raise exception using errcode='42501',message='actor_required'; end if;
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
 perform dialogo_private.lock_agenda_identity(p_actor,p_profile);
 perform dialogo_private.require_published_audit_profile(p_profile,p_scope,p_admin);
 select nome into strict v_name from public.access_requests where auth_user_id=p_actor;
 if p_operation='list' then
  return jsonb_build_object('drafts',coalesce((select jsonb_agg(to_jsonb(x)) from public.audit_drafts x
    join public.audit_visits v on v.id=x.visit_id join public.access_works w on w.id=x.work_id
    where x.auditor_auth_user_id=p_actor and x.published_at is null and w.ativo
      and v.cancelled_at is null and v.published_audit_id is null and v.auditor_auth_user_id=p_actor
      and v.data_prevista=x.audit_date and v.modelo_id=x.model_id and v.obra_id=x.work_id
      and p_profile=case x.modulo when 'QUALIDADE' then 'AUDITOR_QUALIDADE' else 'AUDITOR_SEGURANCA' end),'[]'),
    'plans',coalesce((select jsonb_agg(jsonb_build_object('auditId',x.audit_id,'workId',x.work_id,
      'module',case x.modulo when 'QUALIDADE' then 'quality' else 'safety' end)) from public.published_action_plans x
      where dialogo_private.publication_can_read(p_profile,p_scope,p_admin,x.work_id,x.modulo)),'[]'));
 end if;
 if p_operation='start-audit' then
  select * into v from public.audit_visits where id=p_id for update;
  if not found or v.cancelled_at is not null or v.visit_kind<>'AUDITORIA' or v.published_audit_id is not null
    or v.auditor_auth_user_id<>p_actor or v.confirmation_status<>'confirmed' or p_payload->>'modelId' is distinct from v.modelo_id
    or p_profile<>(case v.modulo when 'QUALIDADE' then 'AUDITOR_QUALIDADE' else 'AUDITOR_SEGURANCA' end) then
   raise exception using errcode='42501',message='audit_assignment_required'; end if;
  perform dialogo_private.lock_audit_nominee(p_actor,v.obra_id,v.modulo);
  select * into d from public.audit_drafts where visit_id=v.id;
  if found then
   if d.audit_date<>v.data_prevista or d.model_id<>v.modelo_id or d.work_id<>v.obra_id or d.auditor_auth_user_id<>p_actor then
    raise exception using errcode='40001',message='audit_schedule_changed'; end if;
   return to_jsonb(d);
  end if;
  if v.data_prevista<>(v_now at time zone 'America/Sao_Paulo')::date then
   raise exception using errcode='42501',message='audit_start_date_required'; end if;
  select * into r from public.audit_catalog_revisions where model_id=v.modelo_id order by version desc limit 1;
  insert into public.audit_drafts(visit_id,work_id,work_name,modulo,model_id,audit_date,auditor_auth_user_id,auditor_name,
   catalog_revision_id,catalog_version,catalog_revision_label,criteria,fvs_services)
   values(v.id,v.obra_id,(select nome from public.access_works where id=v.obra_id),v.modulo,v.modelo_id,v.data_prevista,p_actor,v_name,
    r.id,coalesce(r.version,0),coalesce(r.revision_label,p_payload->>'label'),coalesce(r.criteria,p_payload->'criteria'),p_payload->'fvsServices') returning * into d;
  return to_jsonb(d);
 end if;
 if p_operation in ('read-audit','save-audit','publish-audit') then
  -- All draft mutation paths use the same visit -> draft lock order.
  select av.* into v from public.audit_visits av join public.audit_drafts ad on ad.visit_id=av.id where ad.id=p_id for update of av;
  select * into d from public.audit_drafts where id=p_id for update;
  if not found or d.auditor_auth_user_id<>p_actor
   or p_profile<>(case d.modulo when 'QUALIDADE' then 'AUDITOR_QUALIDADE' else 'AUDITOR_SEGURANCA' end) then
   raise exception using errcode='42501',message='audit_owner_required'; end if;
  perform dialogo_private.lock_audit_nominee(p_actor,d.work_id,d.modulo);
  if d.published_at is not null then
   if p_operation='save-audit' then raise exception using errcode='55000',message='publication_immutable'; end if;
   return to_jsonb(d)||jsonb_build_object('final_score',(select final_score from public.published_audits where id=d.id),'report_file_name',(select report_file_name from public.published_audits where id=d.id));
  end if;
  if v.cancelled_at is not null or v.published_audit_id is not null or v.auditor_auth_user_id<>p_actor
   or v.confirmation_status<>'confirmed' or v.obra_id<>d.work_id or v.modelo_id<>d.model_id or v.data_prevista<>d.audit_date then
   raise exception using errcode='42501',message='audit_assignment_changed'; end if;
  if p_operation='read-audit' then return to_jsonb(d); end if;
  if p_revision is distinct from d.revision then raise exception using errcode='40001',message='draft_revision_conflict'; end if;
  if p_operation='save-audit' then
   if d.responses=p_payload->'responses' and d.photos=p_payload->'photos' then return to_jsonb(d); end if;
   update public.audit_drafts set responses=p_payload->'responses',photos=p_payload->'photos',revision=revision+1,updated_at=v_now
    where id=d.id returning * into d;
   return to_jsonb(d);
  end if;
  for file in select jsonb_array_elements_text(p_payload->'evidenceFiles') union all select p_payload->>'reportFileName' loop
   if not exists(select 1 from storage.objects where bucket_id='published-audits' and name=d.work_id::text||'/'||d.id::text||'/'||file) then
    raise exception using errcode='23514',message='publication_file_missing'; end if;
  end loop;
  insert into public.published_audits(id,work_id,modulo,model_id,audit_date,auditor_auth_user_id,auditor_name,final_score,
   catalog_revision_id,catalog_version,catalog_revision_label,criteria,responses,evidence_files,report_file_name,source_file_name,published_at)
   values(d.id,d.work_id,d.modulo,d.model_id,d.audit_date,p_actor,d.auditor_name,(p_payload->>'score')::numeric,
    d.catalog_revision_id,d.catalog_version,d.catalog_revision_label,d.criteria,p_payload->'responses',p_payload->'evidenceFiles',
    p_payload->>'reportFileName','Publicação pela plataforma',v_now);
  update public.audit_drafts set published_at=v_now,updated_at=v_now where id=d.id returning * into d;
  return to_jsonb(d)||jsonb_build_object('final_score',(p_payload->>'score')::numeric,'report_file_name',p_payload->>'reportFileName');
 end if;
 if p_operation in ('read-plan','save-plan','publish-plan') then
  select * into a from public.published_audits where id=p_id;
  if not found or not dialogo_private.publication_can_read(p_profile,p_scope,p_admin,a.work_id,a.modulo) then
   raise exception using errcode='42501',message='plan_audit_access_required'; end if;
  -- Serialize creation, updates and idempotent publication for this audit.
  perform pg_advisory_xact_lock(hashtextextended('action-plan:'||p_id::text,0));
  select * into pub from public.published_action_plans where audit_id=p_id;
  if found then
   if p_operation='save-plan' then raise exception using errcode='55000',message='publication_immutable'; end if;
   return jsonb_build_object('publication',to_jsonb(pub));
  end if;
  if p_profile<>'ENGENHARIA' or p_scope is distinct from 'EQUIPE_OBRA'
    or not public.has_current_engineering_scope('EQUIPE_OBRA',a.work_id,a.modulo) then
   raise exception using errcode='42501',message='site_team_required'; end if;
  select * into plan from public.action_plan_drafts where audit_id=p_id for update;
  if p_operation='read-plan' then
   -- Raw audit is server-only: the HTTP response exposes findings without weights.
   return jsonb_build_object('audit',to_jsonb(a),'draft',case when plan.audit_id is null then null else to_jsonb(plan) end,
    'workName',(select nome from public.access_works where id=a.work_id),'authorName',v_name);
  end if;
  if p_revision is distinct from coalesce(plan.revision,0) then raise exception using errcode='40001',message='draft_revision_conflict'; end if;
  if p_operation='save-plan' then
   insert into public.action_plan_drafts(audit_id,rows,revision,updated_by) values(p_id,p_payload->'rows',1,p_actor)
    on conflict(audit_id) do update set rows=excluded.rows,revision=action_plan_drafts.revision+1,updated_by=p_actor,updated_at=v_now
    returning * into plan;
   return to_jsonb(plan);
  end if;
  if plan.audit_id is null or jsonb_array_length(plan.rows)=0 or not exists(select 1 from storage.objects where bucket_id='action-plans'
    and name=a.work_id::text||'/'||p_id::text||'/'||(p_payload->>'reportFileName')) then
   raise exception using errcode='23514',message='publication_file_missing'; end if;
  insert into public.published_action_plans(audit_id,work_id,modulo,rows,revision,author_id,author_name,report_file_name)
   values(p_id,a.work_id,a.modulo,plan.rows,plan.revision,p_actor,v_name,p_payload->>'reportFileName') returning * into pub;
  return jsonb_build_object('publication',to_jsonb(pub));
 end if;
 raise exception using errcode='22023',message='unknown_publication_operation';
end;
$fn$;
revoke all on function public.publication_command(uuid,text,text,text,text,uuid,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.publication_command(uuid,text,text,text,text,uuid,integer,jsonb) to service_role;
comment on function public.publication_command(uuid,text,text,text,text,uuid,integer,jsonb) is
 'Server only. Verified user and selected profile are supplied by the HTTP session, never by the body. Validates current access again inside each transaction.';
notify pgrst,'reload schema';
commit;

-- Change requests for published audits (decision of 29/10/2026).
-- The owner auditor asks for a change in one item; the Administrativo of the
-- discipline accepts or refuses; after accepting, the Administrativo edits only
-- the observations of that item and republishes a new PDF. The previous content
-- and PDF stay in published_audit_versions. Scores, answers and photos never change.
-- Reversal: supabase/reversoes/20261030000100_audit_change_requests.sql
begin;

alter table public.published_audits add column content_revision integer not null default 0
  check (content_revision >= 0);
comment on column public.published_audits.content_revision is
  'Number of controlled republications after an accepted change request. 0 = original publication.';

create table public.published_audit_versions (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.published_audits(id) on delete restrict,
  content_revision integer not null check (content_revision >= 0),
  responses jsonb not null check (jsonb_typeof(responses) = 'object'),
  report_file_name text not null check (dialogo_private.valid_catalog_filename(report_file_name,'pdf')),
  change_request_id uuid not null,
  replaced_at timestamptz not null default clock_timestamp(),
  unique (audit_id, content_revision)
);
alter table public.published_audit_versions enable row level security;
revoke all on public.published_audit_versions from public, anon, authenticated, service_role;
create trigger published_audit_versions_immutable before update or delete on public.published_audit_versions
  for each row execute function dialogo_private.reject_catalog_revision_mutation();
create trigger published_audit_versions_no_truncate before truncate on public.published_audit_versions
  for each statement execute function dialogo_private.reject_catalog_revision_mutation();
comment on table public.published_audit_versions is
  'Content and PDF replaced by each republication. Rows are immutable; the original PDF stays readable.';

create table public.audit_change_requests (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.published_audits(id) on delete restrict,
  work_id uuid not null references public.access_works(id) on delete restrict,
  modulo text not null check (modulo in ('SEGURANCA','QUALIDADE')),
  criterion_id text not null check (char_length(criterion_id) between 1 and 200),
  criterion_code text not null check (char_length(criterion_code) between 1 and 80),
  criterion_title text not null check (char_length(criterion_title) between 1 and 1000),
  reason text not null check (reason = btrim(reason) and char_length(reason) between 5 and 2000),
  status text not null default 'pending' check (status in ('pending','accepted','refused','republished')),
  requested_by uuid not null references auth.users(id) on delete restrict,
  requested_by_name text not null,
  requested_at timestamptz not null default clock_timestamp(),
  decided_by uuid references auth.users(id) on delete restrict,
  decided_by_name text,
  decided_at timestamptz,
  refusal_reason text check (refusal_reason is null or (refusal_reason = btrim(refusal_reason) and char_length(refusal_reason) between 5 and 2000)),
  republished_by uuid references auth.users(id) on delete restrict,
  republished_by_name text,
  republished_at timestamptz,
  previous_content_revision integer check (previous_content_revision is null or previous_content_revision >= 0),
  revision integer not null default 1 check (revision >= 1),
  constraint audit_change_requests_state check (
    (status = 'pending' and decided_at is null and decided_by is null and refusal_reason is null and republished_at is null)
    or (status = 'accepted' and decided_at is not null and decided_by is not null and refusal_reason is null and republished_at is null)
    or (status = 'refused' and decided_at is not null and decided_by is not null and refusal_reason is not null and republished_at is null)
    or (status = 'republished' and decided_at is not null and republished_at is not null and republished_by is not null
      and previous_content_revision is not null and refusal_reason is null)
  )
);
-- One open request (pending or accepted, waiting for the new publication) per audit.
create unique index audit_change_requests_one_open on public.audit_change_requests(audit_id)
  where status in ('pending','accepted');
create index audit_change_requests_by_auditor on public.audit_change_requests(requested_by, requested_at desc);
create index audit_change_requests_open_by_module on public.audit_change_requests(modulo, status)
  where status in ('pending','accepted');
alter table public.published_audit_versions add constraint published_audit_versions_request
  foreign key (change_request_id) references public.audit_change_requests(id) on delete restrict;
alter table public.audit_change_requests enable row level security;
revoke all on public.audit_change_requests from public, anon, authenticated, service_role;
create trigger audit_change_requests_no_delete before delete or truncate on public.audit_change_requests
  for each statement execute function dialogo_private.reject_catalog_revision_mutation();

-- Published snapshots stay immutable. The only accepted UPDATE is the republication
-- below: same audit flagged in this transaction, next content revision, and only
-- responses/report_file_name changed (findings_summary is regenerated by PostgreSQL).
create function dialogo_private.guard_published_audit_mutation()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  if tg_op = 'UPDATE'
    and current_setting('dialogo.audit_republication', true) = old.id::text
    and new.content_revision = old.content_revision + 1
    and (to_jsonb(new) - 'responses' - 'report_file_name' - 'content_revision' - 'findings_summary')
      = (to_jsonb(old) - 'responses' - 'report_file_name' - 'content_revision' - 'findings_summary') then
    return new;
  end if;
  raise exception using errcode = '55000', message = 'catalog_history_is_immutable';
end;
$fn$;
revoke all on function dialogo_private.guard_published_audit_mutation() from public, anon, authenticated, service_role;
drop trigger published_audits_immutable on public.published_audits;
create trigger published_audits_immutable before update or delete on public.published_audits
  for each row execute function dialogo_private.guard_published_audit_mutation();

-- While an accepted request waits for the new publication, the action plan
-- cannot be published with the old findings.
create function dialogo_private.reject_plan_during_audit_change()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  if exists (select 1 from public.audit_change_requests r where r.audit_id = new.audit_id and r.status = 'accepted') then
    raise exception using errcode = '55000', message = 'audit_change_in_progress';
  end if;
  return new;
end;
$fn$;
revoke all on function dialogo_private.reject_plan_during_audit_change() from public, anon, authenticated, service_role;
create trigger published_action_plans_audit_change before insert on public.published_action_plans
  for each row execute function dialogo_private.reject_plan_during_audit_change();

create function dialogo_private.audit_change_request_json(r public.audit_change_requests)
returns jsonb language sql stable security definer set search_path = '' as $fn$
  select jsonb_build_object('id',r.id,'auditId',r.audit_id,'workId',r.work_id,
    'workName',(select w.nome from public.access_works w where w.id = r.work_id),
    'auditDate',a.audit_date,'module',case r.modulo when 'SEGURANCA' then 'safety' else 'quality' end,
    'criterionId',r.criterion_id,'criterionCode',r.criterion_code,'criterionTitle',r.criterion_title,
    'reason',r.reason,'status',r.status,'requestedBy',r.requested_by_name,'requestedAt',r.requested_at,
    'decidedBy',r.decided_by_name,'decidedAt',r.decided_at,'refusalReason',r.refusal_reason,
    'republishedBy',r.republished_by_name,'republishedAt',r.republished_at,
    'previousContentRevision',r.previous_content_revision,'revision',r.revision)
  from public.published_audits a where a.id = r.audit_id;
$fn$;
revoke all on function dialogo_private.audit_change_request_json(public.audit_change_requests) from public, anon, authenticated, service_role;

-- Administrativo of the audit discipline (GERAL covers both) in the selected scope.
create function dialogo_private.require_audit_change_administrator(p_administrative_scope text, p_modulo text)
returns void language plpgsql security definer set search_path = '' as $fn$
begin
  perform dialogo_private.lock_agenda_identity(auth.uid(),'ADMINISTRATIVO');
  perform dialogo_private.require_published_audit_profile('ADMINISTRATIVO',null,p_administrative_scope);
  if not public.has_current_administrative_module(p_modulo)
    or not (p_administrative_scope = 'GERAL' or p_administrative_scope = p_modulo) then
    raise exception using errcode = '42501', message = 'administrative_module_required';
  end if;
end;
$fn$;
revoke all on function dialogo_private.require_audit_change_administrator(text,text) from public, anon, authenticated, service_role;

create function public.request_audit_change(p_profile text,p_audit_id uuid,p_criterion_id text,p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid := auth.uid(); a public.published_audits%rowtype; v_item jsonb; r public.audit_change_requests%rowtype;
begin
  perform dialogo_private.lock_agenda_identity(v_actor,p_profile);
  select * into a from public.published_audits where id = p_audit_id;
  if not found or a.auditor_auth_user_id <> v_actor
    or p_profile <> (case a.modulo when 'QUALIDADE' then 'AUDITOR_QUALIDADE' else 'AUDITOR_SEGURANCA' end)
    or not exists (select 1 from public.access_grants g join public.access_works w on w.id = g.obra_id
      where g.auth_user_id = v_actor and g.perfil = p_profile and g.obra_id = a.work_id and g.modulo = a.modulo and w.ativo) then
    raise exception using errcode = '42501', message = 'audit_owner_required';
  end if;
  select value into v_item from jsonb_array_elements(a.criteria) where value->>'id' = p_criterion_id;
  if v_item is null then raise exception using errcode = '22023', message = 'audit_change_item_required'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 5 and 2000 then
    raise exception using errcode = '22023', message = 'audit_change_reason_required';
  end if;
  -- A request could never be accepted once the action plan is published.
  if exists (select 1 from public.published_action_plans p where p.audit_id = a.id) then
    raise exception using errcode = '55000', message = 'action_plan_already_published';
  end if;
  if exists (select 1 from public.audit_change_requests x where x.audit_id = a.id and x.status in ('pending','accepted')) then
    raise exception using errcode = 'PT409', message = 'audit_change_already_open';
  end if;
  insert into public.audit_change_requests(audit_id,work_id,modulo,criterion_id,criterion_code,criterion_title,reason,requested_by,requested_by_name)
    values(a.id,a.work_id,a.modulo,p_criterion_id,left(coalesce(nullif(v_item->>'code',''),p_criterion_id),80),
      left(coalesce(nullif(v_item->>'title',''),nullif(v_item->>'text',''),'Item'),1000),btrim(p_reason),v_actor,
      coalesce((select nome from public.access_requests where auth_user_id = v_actor),'Auditor'))
    returning * into r;
  return dialogo_private.audit_change_request_json(r);
end;
$fn$;

create function public.decide_audit_change(p_administrative_scope text,p_request_id uuid,p_expected_revision integer,
  p_accept boolean,p_refusal_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid := auth.uid(); r public.audit_change_requests%rowtype;
begin
  select * into r from public.audit_change_requests where id = p_request_id for update;
  if not found then raise exception using errcode = '42501', message = 'administrative_module_required'; end if;
  perform dialogo_private.require_audit_change_administrator(p_administrative_scope,r.modulo);
  if r.status <> 'pending' or r.revision is distinct from p_expected_revision then
    raise exception using errcode = 'PT409', message = 'audit_change_revision_conflict';
  end if;
  if p_accept is null then raise exception using errcode = '22023', message = 'audit_change_decision_required'; end if;
  if p_accept then
    if exists (select 1 from public.published_action_plans p where p.audit_id = r.audit_id) then
      raise exception using errcode = '55000', message = 'action_plan_already_published';
    end if;
    update public.audit_change_requests set status = 'accepted', decided_by = v_actor, decided_at = clock_timestamp(),
      decided_by_name = coalesce((select nome from public.access_requests where auth_user_id = v_actor),'Administrativo'),
      revision = revision + 1 where id = r.id returning * into r;
  else
    if p_refusal_reason is null or char_length(btrim(p_refusal_reason)) not between 5 and 2000 then
      raise exception using errcode = '22023', message = 'audit_change_refusal_reason_required';
    end if;
    update public.audit_change_requests set status = 'refused', decided_by = v_actor, decided_at = clock_timestamp(),
      decided_by_name = coalesce((select nome from public.access_requests where auth_user_id = v_actor),'Administrativo'),
      refusal_reason = btrim(p_refusal_reason), revision = revision + 1 where id = r.id returning * into r;
  end if;
  return dialogo_private.audit_change_request_json(r);
end;
$fn$;

-- Cards (p_audit_ids) or bell (null): the auditor sees only own requests; the
-- Administrativo sees requests of the disciplines in the selected scope.
create function public.read_audit_change_requests(p_profile text,p_engineering_scope text default null,
  p_administrative_scope text default null,p_audit_ids uuid[] default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
declare v_result jsonb;
begin
  perform dialogo_private.require_published_audit_profile(p_profile,p_engineering_scope,p_administrative_scope);
  if p_audit_ids is not null and cardinality(p_audit_ids) > 50 then
    raise exception using errcode = '22023', message = 'invalid_audit_change_window';
  end if;
  select coalesce(jsonb_agg(dialogo_private.audit_change_request_json(r) order by r.requested_at desc, r.id), '[]'::jsonb)
    into v_result
  from public.audit_change_requests r join public.access_works w on w.id = r.work_id
  where w.ativo
    and ((p_profile in ('AUDITOR_SEGURANCA','AUDITOR_QUALIDADE') and r.requested_by = auth.uid()
          and p_profile = (case r.modulo when 'QUALIDADE' then 'AUDITOR_QUALIDADE' else 'AUDITOR_SEGURANCA' end))
      or (p_profile = 'ADMINISTRATIVO' and public.has_current_administrative_module(r.modulo)
          and (p_administrative_scope = 'GERAL' or p_administrative_scope = r.modulo)))
    and case when p_audit_ids is not null then r.audit_id = any(p_audit_ids)
      when p_profile = 'ADMINISTRATIVO' then r.status in ('pending','accepted')
      else r.status <> 'pending' and coalesce(r.republished_at, r.decided_at) >= clock_timestamp() - interval '30 days' end;
  return v_result;
end;
$fn$;

-- Items the owner auditor can choose in the request dialog.
create function public.read_audit_change_items(p_profile text,p_audit_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
declare v_result jsonb;
begin
  perform dialogo_private.require_published_audit_profile(p_profile,null,null);
  select coalesce(jsonb_agg(jsonb_build_object('id',c.value->>'id','code',c.value->>'code',
      'title',coalesce(nullif(c.value->>'title',''),c.value->>'text')) order by c.ordinality), '[]'::jsonb)
    into v_result
  from public.published_audits a join public.access_works w on w.id = a.work_id
  cross join lateral jsonb_array_elements(a.criteria) with ordinality c(value,ordinality)
  where a.id = p_audit_id and w.ativo and a.auditor_auth_user_id = auth.uid()
    and p_profile = (case a.modulo when 'QUALIDADE' then 'AUDITOR_QUALIDADE' else 'AUDITOR_SEGURANCA' end);
  return v_result;
end;
$fn$;

-- Everything the server needs to rebuild the PDF of an accepted request.
create function public.read_audit_change_source(p_administrative_scope text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare r public.audit_change_requests%rowtype; a public.published_audits%rowtype; plan public.action_plan_drafts%rowtype;
begin
  select * into r from public.audit_change_requests where id = p_request_id;
  if not found then raise exception using errcode = '42501', message = 'administrative_module_required'; end if;
  perform dialogo_private.require_audit_change_administrator(p_administrative_scope,r.modulo);
  select * into a from public.published_audits where id = r.audit_id;
  select * into plan from public.action_plan_drafts where audit_id = r.audit_id;
  return jsonb_build_object('request',dialogo_private.audit_change_request_json(r),
    'audit',jsonb_build_object('id',a.id,'workId',a.work_id,'workName',(select nome from public.access_works where id = a.work_id),
      'modelId',a.model_id,'date',a.audit_date,'auditor',a.auditor_name,'criteria',a.criteria,'responses',a.responses,
      'evidenceFiles',a.evidence_files,'safetyClosure',a.safety_closure,'reportFileName',a.report_file_name,
      'contentRevision',a.content_revision),
    'planPublished',exists(select 1 from public.published_action_plans p where p.audit_id = a.id),
    'planDraft',case when plan.audit_id is null then null else jsonb_build_object('rows',plan.rows,'revision',plan.revision) end);
end;
$fn$;

-- Only the observation (note) of the requested item and of its verified checks may change.
create function dialogo_private.only_item_notes_changed(p_old jsonb,p_new jsonb,p_criterion_id text)
returns boolean language plpgsql immutable set search_path = '' as $fn$
declare v_old jsonb := p_old->p_criterion_id; v_new jsonb := p_new->p_criterion_id; i integer;
begin
  if jsonb_typeof(p_new) is distinct from 'object' or (p_old - p_criterion_id) <> (p_new - p_criterion_id) then return false; end if;
  if v_old is null then return v_new is null; end if;
  if jsonb_typeof(v_new) is distinct from 'object' or (v_old - 'note' - 'checks') <> (v_new - 'note' - 'checks')
    or (v_new ? 'note' and (jsonb_typeof(v_new->'note') <> 'string' or char_length(v_new->>'note') > 2000)) then return false; end if;
  if (v_old ? 'checks') <> (v_new ? 'checks') then return false; end if;
  if v_old ? 'checks' then
    if jsonb_typeof(v_new->'checks') <> 'array' or jsonb_array_length(v_old->'checks') <> jsonb_array_length(v_new->'checks') then return false; end if;
    for i in 0 .. jsonb_array_length(v_old->'checks') - 1 loop
      if ((v_old->'checks'->i) - 'note') <> ((v_new->'checks'->i) - 'note')
        or (v_new->'checks'->i ? 'note' and (jsonb_typeof(v_new->'checks'->i->'note') <> 'string'
          or char_length(v_new->'checks'->i->>'note') > 2000)) then return false; end if;
    end loop;
  end if;
  return true;
end;
$fn$;
revoke all on function dialogo_private.only_item_notes_changed(jsonb,jsonb,text) from public, anon, authenticated, service_role;

create function public.republish_audit_change(p_administrative_scope text,p_request_id uuid,p_expected_revision integer,
  p_responses jsonb,p_report_file_name text,p_plan_rows jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_actor uuid := auth.uid(); r public.audit_change_requests%rowtype; a public.published_audits%rowtype;
  plan public.action_plan_drafts%rowtype; v_now timestamptz := clock_timestamp();
begin
  select * into r from public.audit_change_requests where id = p_request_id for update;
  if not found then raise exception using errcode = '42501', message = 'administrative_module_required'; end if;
  perform dialogo_private.require_audit_change_administrator(p_administrative_scope,r.modulo);
  select * into a from public.published_audits where id = r.audit_id for update;
  -- A retry after a lost response returns the same republication.
  if r.status = 'republished' and a.report_file_name = p_report_file_name then
    return dialogo_private.audit_change_request_json(r);
  end if;
  if r.status <> 'accepted' or r.revision is distinct from p_expected_revision then
    raise exception using errcode = 'PT409', message = 'audit_change_revision_conflict';
  end if;
  if exists (select 1 from public.published_action_plans p where p.audit_id = a.id) then
    raise exception using errcode = '55000', message = 'action_plan_already_published';
  end if;
  if not dialogo_private.only_item_notes_changed(a.responses,p_responses,r.criterion_id) then
    raise exception using errcode = '22023', message = 'audit_change_only_item_notes';
  end if;
  if p_report_file_name is null or p_report_file_name = a.report_file_name
    or not dialogo_private.valid_catalog_filename(p_report_file_name,'pdf')
    or not exists (select 1 from storage.objects o where o.bucket_id = 'published-audits'
      and o.name = a.work_id::text||'/'||a.id::text||'/'||p_report_file_name) then
    raise exception using errcode = '23514', message = 'publication_file_missing';
  end if;
  select * into plan from public.action_plan_drafts where audit_id = a.id for update;
  if found and (p_plan_rows is null or jsonb_typeof(p_plan_rows) <> 'array') then
    raise exception using errcode = '22023', message = 'audit_change_plan_rows_required';
  end if;
  insert into public.published_audit_versions(audit_id,content_revision,responses,report_file_name,change_request_id,replaced_at)
    values(a.id,a.content_revision,a.responses,a.report_file_name,r.id,v_now);
  perform set_config('dialogo.audit_republication',a.id::text,true);
  update public.published_audits set responses = p_responses, report_file_name = p_report_file_name,
    content_revision = content_revision + 1 where id = a.id;
  perform set_config('dialogo.audit_republication','',true);
  if plan.audit_id is not null then
    update public.action_plan_drafts set rows = p_plan_rows, revision = revision + 1, updated_by = v_actor, updated_at = v_now
      where audit_id = a.id;
  end if;
  update public.audit_change_requests set status = 'republished', republished_by = v_actor, republished_at = v_now,
    republished_by_name = coalesce((select nome from public.access_requests where auth_user_id = v_actor),'Administrativo'),
    previous_content_revision = a.content_revision, revision = revision + 1
    where id = r.id returning * into r;
  return dialogo_private.audit_change_request_json(r);
end;
$fn$;

-- Previous PDFs stay readable to everyone who can read the audit.
create function public.read_published_audit_version_report(
  p_audit_id uuid,p_content_revision integer,p_profile text,p_engineering_scope text default null,p_administrative_scope text default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
declare v_current jsonb;
begin
  v_current := public.read_published_audit_report(p_audit_id,p_profile,p_engineering_scope,p_administrative_scope);
  if v_current is null then return null; end if;
  return (select jsonb_build_object('id',a.id,'workId',a.work_id,'modelId',a.model_id,'reportFileName',v.report_file_name)
    from public.published_audit_versions v join public.published_audits a on a.id = v.audit_id
    where v.audit_id = p_audit_id and v.content_revision = p_content_revision);
end;
$fn$;

create or replace function public.can_read_published_audit_file(p_name text)
returns boolean language plpgsql stable security definer set search_path='' as $fn$
declare v_work_id uuid; v_audit_id uuid; file_name text;
begin
 if p_name !~* '^[a-f0-9-]{36}/[a-f0-9-]{36}/[^/]+$' then return false; end if;
 begin v_work_id:=split_part(p_name,'/',1)::uuid; v_audit_id:=split_part(p_name,'/',2)::uuid;
 exception when invalid_text_representation then return false; end;
 file_name:=split_part(p_name,'/',3);
 return public.can_read_published_audit_storage(v_work_id,v_audit_id) and exists(
  select 1 from public.published_audits a where a.id=v_audit_id and a.work_id=v_work_id
   and (a.report_file_name=file_name or a.evidence_files ? file_name
     or exists(select 1 from public.published_audit_versions v where v.audit_id=a.id and v.report_file_name=file_name)));
end;
$fn$;

revoke all on function public.request_audit_change(text,uuid,text,text),
  public.decide_audit_change(text,uuid,integer,boolean,text),
  public.read_audit_change_requests(text,text,text,uuid[]),
  public.read_audit_change_items(text,uuid),
  public.read_audit_change_source(text,uuid),
  public.republish_audit_change(text,uuid,integer,jsonb,text,jsonb),
  public.read_published_audit_version_report(uuid,integer,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.request_audit_change(text,uuid,text,text),
  public.decide_audit_change(text,uuid,integer,boolean,text),
  public.read_audit_change_requests(text,text,text,uuid[]),
  public.read_audit_change_items(text,uuid),
  public.read_audit_change_source(text,uuid),
  public.republish_audit_change(text,uuid,integer,jsonb,text,jsonb),
  public.read_published_audit_version_report(uuid,integer,text,text,text)
  to authenticated;

-- Republication changes findings without changing the set of IDs: the dashboard
-- fingerprint now includes content_revision.
create or replace function public.read_published_audit_overview_if_changed(
  p_profile text,p_engineering_scope text default null,p_administrative_scope text default null,p_known_revision text default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare v_result jsonb;
begin
  perform dialogo_private.require_published_audit_profile(p_profile,p_engineering_scope,p_administrative_scope);
  with authorized_work_modules as materialized (
    select w.id as work_id,m.modulo
    from public.access_works w cross join (values ('SEGURANCA'),('QUALIDADE')) m(modulo)
    where w.ativo and (
      (p_profile='ADMINISTRATIVO' and public.has_current_administrative_module(m.modulo)
        and (p_administrative_scope='GERAL' or p_administrative_scope=m.modulo))
      or (p_profile='ENGENHARIA' and public.has_current_engineering_scope(p_engineering_scope,w.id,m.modulo))
      or (p_profile in ('AUDITOR_SEGURANCA','AUDITOR_QUALIDADE') and exists (
        select 1 from public.access_grants g where g.auth_user_id=auth.uid()
          and g.perfil=p_profile and g.obra_id=w.id and g.modulo=m.modulo))
    )
  ), visible as materialized (
    select a.id,a.content_revision from public.published_audits a
    join authorized_work_modules allowed on allowed.work_id=a.work_id and allowed.modulo=a.modulo
  ), serious_work_findings as materialized (
    select f.id,f.work_id,f.modulo,f.description,f.correction,f.created_at,
      coalesce((select ar.nome from public.access_requests ar
        where ar.auth_user_id=f.auditor_auth_user_id order by ar.created_at desc limit 1),'Responsável') as responsible
    from public.follow_up_work_findings f
    join authorized_work_modules allowed on allowed.work_id=f.work_id and allowed.modulo=f.modulo
    where f.serious and f.completed_at is null
  ), revision as (
    select md5(jsonb_build_array('audit-overview-v3',auth.uid(),p_profile,p_engineering_scope,p_administrative_scope,
      coalesce((select string_agg(id::text||':'||content_revision,'' order by id) from visible),''),
      coalesce((select string_agg(id::text,'' order by id) from serious_work_findings),''))::text) as value
  )
  select case when revision.value=p_known_revision then
    jsonb_build_object('revision',revision.value,'unchanged',true)
  else jsonb_build_object('revision',revision.value,'unchanged',false,
    'audits',coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'workId',a.work_id,'modelId',a.model_id,'date',a.audit_date,
      'auditorId',a.auditor_auth_user_id,'auditor',a.auditor_name,'finalScore',a.final_score,
      'catalogRevisionId',a.catalog_revision_id,'catalogVersion',a.catalog_version,
      'catalogRevisionLabel',a.catalog_revision_label) order by a.audit_date desc,a.id)
      from public.published_audits a join visible v on v.id=a.id),'[]'::jsonb),
    'findings',coalesce((select jsonb_agg(f.value || jsonb_build_object(
      'auditId',a.id,'workId',a.work_id,'auditDate',a.audit_date,'auditor',a.auditor_name,
      'modelId',a.model_id,'module',case when a.modulo='SEGURANCA' then 'safety' else 'quality' end)
      order by a.audit_date desc,a.id,f.ordinality)
      from public.published_audits a join visible v on v.id=a.id
      cross join lateral jsonb_array_elements(a.findings_summary) with ordinality f(value,ordinality)),'[]'::jsonb),
    'workFindings',coalesce((select jsonb_agg(jsonb_build_object(
      'id',f.id,'workId',f.work_id,
      'module',case when f.modulo='SEGURANCA' then 'safety' else 'quality' end,
      'createdDate',to_char(f.created_at at time zone 'America/Sao_Paulo','YYYY-MM-DD'),
      'responsible',f.responsible,'description',f.description,'correction',f.correction)
      order by f.created_at desc,f.id) from serious_work_findings f),'[]'::jsonb)
  ) end into v_result from revision;
  return v_result;
end;
$function$;

comment on function public.read_published_audit_overview_if_changed(text,text,text,text) is
  'Scoped dashboard snapshot combining audit summaries with active serious follow-up findings. Revision v3 changes when either visible source set changes or an audit is republished (content_revision).';
notify pgrst, 'reload schema';
commit;

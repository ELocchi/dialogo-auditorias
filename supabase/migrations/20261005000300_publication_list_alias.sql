-- The list query must not reuse the PL/pgSQL visit variable as a table alias.
-- Preserve all authorization, publication, scoring and storage behavior.
begin;
create or replace function public.publication_command(p_actor uuid,p_profile text,p_scope text,p_admin text,
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
    join public.audit_visits listed_visit on listed_visit.id=x.visit_id join public.access_works w on w.id=x.work_id
    where x.auditor_auth_user_id=p_actor and x.published_at is null and w.ativo
      and listed_visit.cancelled_at is null and listed_visit.published_audit_id is null and listed_visit.auditor_auth_user_id=p_actor
      and listed_visit.data_prevista=x.audit_date and listed_visit.modelo_id=x.model_id and listed_visit.obra_id=x.work_id
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
   if d.responses=p_payload->'responses' and d.photos=p_payload->'photos' and d.safety_closure is not distinct from nullif(p_payload->'safetyClosure','null'::jsonb) then return to_jsonb(d); end if;
   update public.audit_drafts set responses=p_payload->'responses',photos=p_payload->'photos',safety_closure=nullif(p_payload->'safetyClosure','null'::jsonb),revision=revision+1,updated_at=v_now
    where id=d.id returning * into d;
   return to_jsonb(d);
  end if;
  for file in select jsonb_array_elements_text(p_payload->'evidenceFiles') union all select p_payload->>'reportFileName' loop
   if not exists(select 1 from storage.objects where bucket_id='published-audits' and name=d.work_id::text||'/'||d.id::text||'/'||file) then
    raise exception using errcode='23514',message='publication_file_missing'; end if;
  end loop;
  insert into public.published_audits(id,work_id,modulo,model_id,audit_date,auditor_auth_user_id,auditor_name,final_score,
   catalog_revision_id,catalog_version,catalog_revision_label,criteria,responses,evidence_files,report_file_name,source_file_name,published_at,safety_closure,raw_score,accident_penalty)
   values(d.id,d.work_id,d.modulo,d.model_id,d.audit_date,p_actor,d.auditor_name,(p_payload->>'score')::numeric,
    d.catalog_revision_id,d.catalog_version,d.catalog_revision_label,d.criteria,p_payload->'responses',p_payload->'evidenceFiles',
    p_payload->>'reportFileName','Publicação pela plataforma',v_now,d.safety_closure,(p_payload->>'rawScore')::numeric,coalesce((p_payload->>'penalty')::integer,0));
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

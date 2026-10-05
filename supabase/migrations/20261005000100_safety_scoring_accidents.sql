-- Local preparation only: deploy after approval of the LAN review.
begin;
alter table public.audit_drafts add column safety_closure jsonb;
alter table public.published_audits add column safety_closure jsonb;
alter table public.published_audits add column raw_score numeric;
alter table public.published_audits add column accident_penalty integer not null default 0 check (accident_penalty >= 0);
alter table public.published_audits alter column final_score drop not null;
alter table public.published_audits add constraint audit_null_score_safety_only check (final_score is not null or model_id='security-it07-r02');

-- Defense in depth: derive scores again from the frozen criteria/responses, never client totals.
create function dialogo_private.validate_safety_publication() returns trigger
language plpgsql set search_path='' as $fn$
declare a jsonb; c jsonb; answer text; raw numeric; penalty integer:=0; accident_date date;
begin
 if new.model_id<>'security-it07-r02' then return new; end if;
 if new.safety_closure is null or jsonb_typeof(new.safety_closure->'hadAccidents') is distinct from 'boolean'
   or jsonb_typeof(new.safety_closure->'accidents') is distinct from 'array' then
   raise exception using errcode='23514',message='accident_declaration_required'; end if;
 if jsonb_array_length(new.safety_closure->'accidents')>100
   or ((new.safety_closure->>'hadAccidents')::boolean is distinct from (jsonb_array_length(new.safety_closure->'accidents')>0)) then
   raise exception using errcode='23514',message='invalid_accident_declaration'; end if;
 for a in select jsonb_array_elements(new.safety_closure->'accidents') loop
  accident_date:=(a->>'date')::date;
  if accident_date is null or to_char(accident_date,'YYYY-MM-DD') is distinct from a->>'date'
    or date_trunc('month',accident_date)<>date_trunc('month',new.audit_date)
    or coalesce(a->>'type','') not in ('common','leave')
    or coalesce(btrim(a->>'event'),'')='' or coalesce(btrim(a->>'justification'),'')='' then
    raise exception using errcode='23514',message='invalid_accident'; end if;
  penalty:=penalty+case a->>'type' when 'leave' then 2 else 1 end;
 end loop;
 for c in select jsonb_array_elements(new.criteria) loop
  answer:=new.responses->(c->>'id')->>'answer';
  if answer is null or answer not in ('0','5','10','N/A') then
   raise exception using errcode='23514',message='all_safety_answers_required'; end if;
 end loop;
 with items as (
  select entry->>'group' as grp,(entry->>'groupWeight')::numeric as gw,
    coalesce((entry->>'configuredWeight')::numeric,(entry->>'documentedWeight')::numeric) as iw,
    (new.responses->(entry->>'id')->>'answer')::numeric as value
  from jsonb_array_elements(new.criteria) as items_source(entry) where new.responses->(entry->>'id')->>'answer'<>'N/A'
 ), groups as (select grp,max(gw) gw,sum(value*iw)/nullif(sum(iw),0) score from items group by grp)
 select sum(gw*score)/nullif(sum(gw),0) into raw from groups;
 if new.final_score is distinct from (case when raw is null then null else round(greatest(0,raw-penalty),2) end)
   or new.accident_penalty<>penalty then raise exception using errcode='23514',message='safety_score_mismatch'; end if;
 new.raw_score:=raw;
 return new;
end;
$fn$;
revoke all on function dialogo_private.validate_safety_publication() from public,anon,authenticated,service_role;
create trigger safety_publication_validate before insert on public.published_audits for each row execute function dialogo_private.validate_safety_publication();

-- Create a NEW catalog revision only if one exists, preserving every documentary field.
-- Fresh installations use the identical bundled weights. Existing drafts keep their frozen revision.
do $weights$
declare r public.audit_catalog_revisions%rowtype; mapped jsonb; new_revision uuid; previous_actor text := current_setting('request.jwt.claim.sub',true);
 weights jsonb := '{"01.01.01": 5, "01.01.02": 5, "01.01.03": 10, "01.02.01": 10, "01.02.02": 10, "01.02.03": 10, "01.02.04": 10, "01.02.05": 10, "01.02.06": 10, "01.02.07": 10, "01.03.01": 10, "01.03.02": 10, "01.03.03": 5, "01.03.04": 10, "01.04.01": 10, "01.04.02": 5, "01.04.03": 10, "01.04.04": 10, "01.04.05": 5, "01.04.06": 10, "01.05.01": 10, "01.05.02": 10, "01.05.03": 10, "01.05.04": 10, "01.06.01": 10, "01.06.02": 10, "01.06.03": 10, "01.06.04": 10, "01.06.05": 10, "01.06.06": 10, "01.06.07": 10, "01.06.08": 10, "01.07.01": 10, "01.07.02": 10, "01.07.03": 10, "01.07.04": 10, "01.07.05": 10, "01.07.06": 10, "01.07.07": 10, "01.08.01": 10, "01.08.02": 10, "01.08.03": 10, "01.08.04": 10, "01.08.05": 10, "01.08.06": 10, "01.08.07": 10, "01.08.08": 10, "01.08.09": 10, "01.08.10": 10, "01.08.11": 10, "01.08.12": 10, "01.08.13": 10, "02.01.01": 10, "02.01.02": 10, "02.01.03": 10, "03.01.01": 5, "03.01.02": 5, "03.01.03": 15, "04.01.01": 50, "04.01.02": 20, "04.01.03": 10, "05.01.01": 10, "05.01.02": 10, "05.01.03": 10, "05.01.04": 20, "05.01.05": 10, "05.01.06": 15, "06.01.01": 10, "06.01.02": 5, "06.01.03": 15, "06.01.04": 10, "06.01.05": 5, "06.01.06": 10, "06.01.07": 10, "06.01.08": 15, "06.01.09": 15, "06.01.10": 15, "07.01.01": 5, "07.01.02": 2, "07.01.03": 15, "08.01.01": 5, "08.01.02": 5, "08.01.03": 15, "09.01.01": 5, "09.01.02": 10, "09.02.01": 15, "09.02.02": 15, "09.02.03": 5, "09.03.01": 5, "10.01.01": 50, "10.01.02": 30, "10.01.03": 50, "10.01.04": 50, "10.01.05": 50, "10.01.06": 30, "10.01.07": 30, "10.01.08": 30, "10.01.09": 10, "11.01.01": 10, "11.01.02": 10, "11.01.03": 10, "11.01.04": 10, "11.01.05": 6, "11.01.06": 6, "11.01.07": 10, "12.01.01": 6, "12.01.02": 6, "12.01.03": 5, "12.01.04": 10, "12.01.05": 10, "13.01.01": 15, "13.01.02": 10, "13.01.03": 10, "13.01.04": 20, "13.01.05": 20, "13.01.06": 25, "13.01.07": 25, "13.01.08": 10, "13.01.09": 10, "14.01.01": 75, "14.01.02": 75, "14.01.03": 75, "14.01.04": 75, "14.01.05": 75, "14.01.06": 75, "14.02.01": 75, "14.02.02": 75, "14.02.03": 75, "14.02.04": 75, "14.02.05": 50, "14.02.06": 75, "14.02.07": 75, "14.02.08": 20, "14.02.09": 30, "14.02.10": 30, "14.02.11": 75, "15.01.01": 75, "15.01.02": 75, "15.01.03": 75, "15.01.04": 75, "15.01.05": 75, "15.01.06": 75, "15.01.07": 50, "16.01.01": 25, "16.01.02": 15, "17.01.01": 25, "17.01.02": 25, "17.01.03": 25, "17.01.04": 15, "17.01.05": 15, "18.01.01": 40, "18.01.02": 40, "18.01.03": 15, "18.01.04": 15, "19.01.01": 30, "19.01.02": 20, "19.01.03": 20, "19.01.04": 30, "19.01.05": 30, "19.01.06": 20, "19.01.07": 30, "19.01.08": 30, "19.01.09": 20, "20.01.01": 50, "20.01.02": 50, "20.01.03": 50, "20.01.04": 50, "20.01.05": 50, "20.01.06": 60, "20.01.07": 30, "20.01.08": 50, "21.01.01": 75, "21.01.02": 75, "21.01.03": 75, "21.01.04": 75, "21.01.05": 50, "21.01.06": 50, "21.01.07": 75, "21.01.08": 30, "21.01.09": 30, "22.01.01": 30, "22.01.02": 30, "22.01.03": 30, "22.01.04": 20, "22.01.05": 20, "22.01.06": 10, "23.01.01": 20, "23.01.02": 20, "23.01.03": 15, "23.01.04": 15, "23.01.05": 15, "23.01.06": 10, "23.01.07": 20, "23.01.08": 20, "23.01.09": 10, "23.01.10": 10, "23.01.11": 15, "24.01.01": 10, "25.01.01": 20, "25.01.02": 10, "26.01.01": 50, "26.01.02": 8, "26.01.03": 15, "26.01.04": 25, "27.01.01": 5}'::jsonb;
 group_weights jsonb := '{"01": 2, "02": 2, "03": 2, "04": 4, "05": 2, "06": 3, "07": 1, "08": 2, "09": 1, "10": 10, "11": 2, "12": 2, "13": 5, "14": 10, "15": 10, "16": 3, "17": 5, "18": 5, "19": 4, "20": 5, "21": 6, "22": 5, "23": 4, "24": 1, "25": 2, "26": 4, "27": 1}'::jsonb;
begin
 lock table public.audit_catalog_revisions in share row exclusive mode;
 select * into r from public.audit_catalog_revisions where model_id='security-it07-r02' order by version desc limit 1;
 if found then
  -- Preserve the catalog authorization guard; use its administrator for this approved revision.
  perform set_config('request.jwt.claim.sub',r.created_by::text,true);
  perform dialogo_private.lock_agenda_identity(r.created_by,'ADMINISTRATIVO');
  if exists(select 1 from jsonb_array_elements(r.criteria) c where not (weights ? (c->>'code'))) then
   raise exception 'Unmapped safety code: review weights before deployment'; end if;
  select jsonb_agg(c || jsonb_build_object('configuredWeight',weights->(c->>'code'),'groupWeight',group_weights->split_part(c->>'code','.',1),'weightConfigurationId','IT07-R02-PESOS-2026-10-05') order by ord)
   into mapped from jsonb_array_elements(r.criteria) with ordinality as entries(c,ord);
  insert into public.audit_catalog_revisions(model_id,version,revision_label,change_note,criteria,created_by,request_id)
  values(r.model_id,r.version+1,r.revision_label,'Pesos aprovados da planilha Checklist Diálogo_2026; textos preservados.',mapped,r.created_by,gen_random_uuid()) returning id into new_revision;
  insert into dialogo_private.audit_catalog_documents(revision_id,pdf,pdf_name,original,original_name)
   select new_revision,pdf,pdf_name,original,original_name from dialogo_private.audit_catalog_documents where revision_id=r.id;
  perform set_config('request.jwt.claim.sub',coalesce(previous_actor,''),true);
 end if;
end;
$weights$;

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

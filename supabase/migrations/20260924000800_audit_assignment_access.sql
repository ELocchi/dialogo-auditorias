-- An audit assignment authorizes only that audit. Work grants continue to
-- authorize day-to-day follow-up, work details, reports, findings and rankings.
-- No account, grant, work-team membership or existing visit is changed here.
begin;

create function dialogo_private.is_eligible_audit_nominee(p_user_id uuid, p_modulo text)
returns boolean language sql stable security definer set search_path = '' as $function$
  select exists (
    select 1 from public.access_accounts a
    join public.access_requests r on r.auth_user_id = a.auth_user_id
    join auth.users u on u.id = a.auth_user_id
    where a.auth_user_id = p_user_id and a.ativo
      and case p_modulo when 'SEGURANCA' then 'AUDITOR_SEGURANCA'
        when 'QUALIDADE' then 'AUDITOR_QUALIDADE' end = any(a.perfis)
      and r.status_acesso = 'APROVADO' and r.email = u.email
      and u.email_confirmed_at is not null and public.is_dialogo_corporate_email(u.email)
      and u.deleted_at is null and (u.banned_until is null or u.banned_until <= statement_timestamp())
  );
$function$;

create function dialogo_private.lock_audit_nominee(p_user_id uuid, p_obra_id uuid, p_modulo text)
returns void language plpgsql security definer set search_path = '' as $function$
begin
  perform dialogo_private.lock_agenda_identity(p_user_id,
    case p_modulo when 'SEGURANCA' then 'AUDITOR_SEGURANCA' when 'QUALIDADE' then 'AUDITOR_QUALIDADE' end);
  perform 1 from public.access_works w where w.id = p_obra_id and w.ativo for share of w;
  if not found then
    raise exception using errcode = '42501', message = 'authorized_visit_auditor_required';
  end if;
end;
$function$;
revoke all on function dialogo_private.is_eligible_audit_nominee(uuid,text),
  dialogo_private.lock_audit_nominee(uuid,uuid,text) from public,anon,authenticated,service_role;

-- The definer predicate reads only the caller's active audit assignment, so it
-- can be used by visit RLS without recursively invoking that same policy.
create function public.has_current_assigned_audit_visit(p_visit_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select exists (select 1 from public.audit_visits v
    join public.access_works w on w.id = v.obra_id
    where v.id = p_visit_id and v.visit_kind = 'AUDITORIA' and w.ativo
      and v.auditor_auth_user_id = auth.uid() and v.cancelled_at is null and v.published_audit_id is null
      and dialogo_private.is_eligible_audit_nominee(auth.uid(),v.modulo));
$function$;
revoke all on function public.has_current_assigned_audit_visit(uuid) from public,anon,authenticated,service_role;
grant execute on function public.has_current_assigned_audit_visit(uuid) to authenticated;

drop policy audit_visits_select_authorized on public.audit_visits;
create policy audit_visits_select_authorized on public.audit_visits for select to authenticated using (
  public.has_current_administrative_module(modulo)
  or public.has_current_assigned_audit_visit(id)
  or (visit_kind = 'ACOMPANHAMENTO' and cancelled_at is null
    and auditor_auth_user_id = (select auth.uid()) and public.has_current_access_grant(
      case modulo when 'SEGURANCA' then 'AUDITOR_SEGURANCA' else 'AUDITOR_QUALIDADE' end,obra_id,modulo))
  or public.has_current_engineering_scope('EQUIPE_OBRA',obra_id,modulo)
);
-- audit_visit_events remains constrained by the visible parent visit.

-- Keep the outer discipline-scoped entrypoint and durable operation replay.
-- Only audit creation uses the profile-based nomination lock. The original
-- lock_visit_auditor remains grant-based for every follow-up/report mutation.
create or replace function dialogo_private.create_audit_visit_unscoped(
  p_request_id uuid,p_obra_id uuid,p_modulo text,p_modelo_id text,
  p_auditor_auth_user_id uuid,p_data_prevista date,p_observacao text
) returns uuid language plpgsql security definer set search_path = '' as $function$
declare v_actor uuid := auth.uid(); v_payload jsonb; v_id uuid; v_visit public.audit_visits%rowtype;
begin
  perform dialogo_private.lock_agenda_identity(v_actor,'ADMINISTRATIVO');
  perform dialogo_private.validate_visit_schedule(p_data_prevista,p_observacao);
  if p_obra_id is null or p_auditor_auth_user_id is null or p_modulo is null or p_modelo_id is null
    or not ((p_modulo = 'SEGURANCA' and p_modelo_id = 'security-it07-r02')
      or (p_modulo = 'QUALIDADE' and p_modelo_id in ('quality-f175','quality-f176'))) then
    raise exception using errcode = '22023', message = 'invalid_visit_scope';
  end if;
  perform dialogo_private.lock_audit_nominee(p_auditor_auth_user_id,p_obra_id,p_modulo);
  v_payload := jsonb_build_object('operation','create','obra_id',p_obra_id,'modulo',p_modulo,'modelo_id',p_modelo_id,
    'auditor_id',p_auditor_auth_user_id,'date',p_data_prevista,'note',p_observacao);
  v_id := dialogo_private.replay_visit_operation(v_actor,p_request_id,v_payload);
  if v_id is not null then return v_id; end if;
  insert into public.audit_visits(obra_id,modulo,modelo_id,auditor_auth_user_id,data_prevista,observacao,created_by,updated_by)
    values(p_obra_id,p_modulo,p_modelo_id,p_auditor_auth_user_id,p_data_prevista,p_observacao,v_actor,v_actor)
    returning * into v_visit;
  insert into public.audit_visit_events(visit_id,revision,event_type,after_snapshot,actor_auth_user_id,occurred_at)
    values(v_visit.id,v_visit.revision,'created',to_jsonb(v_visit),v_actor,v_visit.created_at);
  insert into dialogo_private.audit_visit_operations(actor_auth_user_id,request_id,payload,visit_id)
    values(v_actor,p_request_id,v_payload,v_visit.id);
  return v_visit.id;
end;
$function$;

create or replace function public.confirm_audit_visit(p_request_id uuid,p_visit_id uuid,p_expected_revision integer)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare v_actor uuid := auth.uid(); v_visit public.audit_visits%rowtype; v_before jsonb; v_payload jsonb; v_replay uuid;
begin
  if not public.is_current_access_active() then
    raise exception using errcode = '42501', message = 'active_agenda_profile_required';
  end if;
  if p_visit_id is null or p_expected_revision is null or p_expected_revision < 1 then
    raise exception using errcode = '22023', message = 'invalid_visit_revision';
  end if;
  select * into v_visit from public.audit_visits where id = p_visit_id
    and auditor_auth_user_id = v_actor and cancelled_at is null and published_audit_id is null for update;
  if not found then raise exception using errcode = '42501', message = 'assigned_visit_auditor_required'; end if;
  if v_visit.visit_kind = 'AUDITORIA' then
    perform dialogo_private.lock_audit_nominee(v_actor,v_visit.obra_id,v_visit.modulo);
  else
    perform dialogo_private.lock_visit_auditor(v_actor,v_visit.obra_id,v_visit.modulo);
  end if;
  v_payload := jsonb_build_object('operation','confirm','visit_id',p_visit_id,'expected_revision',p_expected_revision);
  if v_visit.revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'visit_revision_conflict';
  end if;
  v_replay := dialogo_private.replay_visit_operation(v_actor,p_request_id,v_payload);
  if v_replay is not null then return v_replay; end if;
  if v_visit.confirmation_status <> 'confirmed' then
    v_before := to_jsonb(v_visit);
    update public.audit_visits set confirmation_status = 'confirmed',confirmed_by = v_actor,
      confirmed_at = clock_timestamp(),updated_by = v_actor,updated_at = clock_timestamp()
      where id = p_visit_id returning * into v_visit;
    insert into public.audit_visit_events(visit_id,revision,event_type,before_snapshot,after_snapshot,actor_auth_user_id,occurred_at)
      values(v_visit.id,v_visit.revision,'confirmed',v_before,to_jsonb(v_visit),v_actor,v_visit.confirmed_at);
  end if;
  insert into dialogo_private.audit_visit_operations(actor_auth_user_id,request_id,payload,visit_id)
    values(v_actor,p_request_id,v_payload,v_visit.id);
  return v_visit.id;
end;
$function$;

create or replace function public.list_authorized_visit_auditors(p_obra_id uuid,p_modulo text)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
begin
  if not public.has_current_administrative_module(p_modulo) then
    raise exception using errcode = '42501', message = 'administrative_module_required';
  end if;
  if p_obra_id is null then
    raise exception using errcode = '22023', message = 'invalid_visit_scope';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',r.auth_user_id,'name',r.nome)
    order by r.nome,r.auth_user_id),'[]'::jsonb) from public.access_requests r
    where dialogo_private.is_eligible_audit_nominee(r.auth_user_id,p_modulo)
      and exists (select 1 from public.access_works w where w.id = p_obra_id and w.ativo));
end;
$function$;

-- Preserve the public wrapper that filters administrative disciplines and
-- completed visits. Project the work name only, never broaden the work list.
create or replace function dialogo_private.read_audit_agenda_unscoped(
  p_profile text,p_engineering_scope text default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare v_visits jsonb; v_auditors jsonb := '[]'::jsonb;
begin
  if p_profile is null or p_profile not in ('ADMINISTRATIVO','AUDITOR_SEGURANCA','AUDITOR_QUALIDADE','ENGENHARIA')
    or not public.is_current_access_active()
    or not exists (select 1 from public.access_accounts a where a.auth_user_id = auth.uid() and p_profile = any(a.perfis)) then
    raise exception using errcode = '42501', message = 'active_agenda_profile_required';
  end if;
  if (p_profile <> 'ENGENHARIA' and p_engineering_scope is not null)
    or (p_profile = 'ENGENHARIA' and (p_engineering_scope is null
      or p_engineering_scope not in ('EQUIPE_OBRA','COORDENACAO')
      or not exists (select 1 from public.access_accounts a where a.auth_user_id = auth.uid()
        and p_engineering_scope = any(a.atuacoes_engenharia)))) then
    raise exception using errcode = '42501', message = 'active_agenda_profile_required';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',v.id,'workId',v.obra_id,'workName',w.nome,
    'module',case v.modulo when 'SEGURANCA' then 'safety' else 'quality' end,
    'kind',case v.visit_kind when 'ACOMPANHAMENTO' then 'follow_up' else 'audit' end,
    'modelId',v.modelo_id,'auditorId',v.auditor_auth_user_id,'date',to_char(v.data_prevista,'YYYY-MM-DD'),
    'note',v.observacao,'createdBy',v.created_by,'createdAt',v.created_at,'revision',v.revision,
    'confirmationStatus',v.confirmation_status,'confirmedAt',v.confirmed_at,
    'auditorName',ar.nome,'createdByName',cr.nome,
    'history',(select coalesce(jsonb_agg(jsonb_build_object(
      'previousDate',e.before_snapshot->>'data_prevista','date',e.after_snapshot->>'data_prevista',
      'note',e.after_snapshot->>'observacao','changedBy',e.actor_auth_user_id,'changedAt',e.occurred_at)
      order by e.revision,e.occurred_at,e.id),'[]'::jsonb)
      from public.audit_visit_events e where e.visit_id = v.id and e.event_type = 'rescheduled')
  ) order by v.data_prevista,v.created_at,v.id),'[]'::jsonb) into v_visits
    from public.audit_visits v join public.access_works w on w.id = v.obra_id
    join public.access_requests ar on ar.auth_user_id = v.auditor_auth_user_id
    join public.access_requests cr on cr.auth_user_id = v.created_by
    where v.cancelled_at is null and v.published_audit_id is null and w.ativo and (
      p_profile = 'ADMINISTRATIVO'
      or (p_profile = case v.modulo when 'SEGURANCA' then 'AUDITOR_SEGURANCA' else 'AUDITOR_QUALIDADE' end
        and v.auditor_auth_user_id = auth.uid()
        and ((v.visit_kind = 'AUDITORIA' and dialogo_private.is_eligible_audit_nominee(auth.uid(),v.modulo))
          or (v.visit_kind = 'ACOMPANHAMENTO' and public.has_current_access_grant(p_profile,v.obra_id,v.modulo))))
      or (p_profile = 'ENGENHARIA' and p_engineering_scope = 'EQUIPE_OBRA'
        and public.has_current_engineering_scope('EQUIPE_OBRA',v.obra_id,v.modulo))
    );
  if p_profile = 'ADMINISTRATIVO' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',a.auth_user_id,'name',r.nome,
      'role',case p.perfil when 'AUDITOR_SEGURANCA' then 'safety-auditor' else 'quality-auditor' end,
      'modules',jsonb_build_array(case p.perfil when 'AUDITOR_SEGURANCA' then 'safety' else 'quality' end),
      'workIds',g.work_ids,'agendaWorkIds',g.work_ids,'documentWorkIds','[]'::jsonb,'workModuleScopes',g.scopes
    ) order by r.nome,a.auth_user_id,p.perfil),'[]'::jsonb) into v_auditors
    from public.access_accounts a join public.access_requests r on r.auth_user_id = a.auth_user_id
    cross join lateral unnest(a.perfis) as p(perfil)
    cross join lateral (
      select coalesce(jsonb_agg(ag.obra_id order by ag.obra_id),'[]'::jsonb) as work_ids,
        coalesce(jsonb_agg(jsonb_build_object('workId',ag.obra_id,
          'module',case ag.modulo when 'SEGURANCA' then 'safety' else 'quality' end)
          order by ag.obra_id),'[]'::jsonb) as scopes
      from public.access_grants ag join public.access_works aw on aw.id = ag.obra_id
      where ag.auth_user_id = a.auth_user_id and ag.perfil = p.perfil and aw.ativo
        and ag.modulo = case p.perfil when 'AUDITOR_SEGURANCA' then 'SEGURANCA' else 'QUALIDADE' end
    ) g
    where p.perfil in ('AUDITOR_SEGURANCA','AUDITOR_QUALIDADE')
      and dialogo_private.is_eligible_audit_nominee(a.auth_user_id,
        case p.perfil when 'AUDITOR_SEGURANCA' then 'SEGURANCA' else 'QUALIDADE' end);
  end if;
  return jsonb_build_object('visits',v_visits,'auditors',v_auditors);
end;
$function$;

-- Auditors with a live assignment also need the current template for that exact
-- model, even if all day-to-day work grants have been removed in the meantime.
create or replace function dialogo_private.read_audit_catalogs_unscoped(
  p_profile text,p_engineering_scope text default null
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_result jsonb;
begin
  perform dialogo_private.lock_agenda_identity(auth.uid(),p_profile);
  if p_profile not in ('ADMINISTRATIVO','AUDITOR_SEGURANCA','AUDITOR_QUALIDADE','ENGENHARIA')
    or (p_profile = 'ENGENHARIA' and (p_engineering_scope is null or not exists (
      select 1 from public.access_accounts a where a.auth_user_id = auth.uid()
        and p_engineering_scope = any(a.atuacoes_engenharia))))
    or (p_profile <> 'ENGENHARIA' and p_engineering_scope is not null) then
    raise exception using errcode = '42501', message = 'active_catalog_profile_required';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'modelId',r.model_id,'version',r.version,
    'label',r.revision_label,'changeNote',r.change_note,'createdAt',r.created_at,
    'criteria',case when p_profile = 'ENGENHARIA' then (
      select jsonb_agg((c.value - array['configuredWeight','weightConfigurationId']) || '{"documentedWeight":null}'::jsonb order by c.ordinality)
        from jsonb_array_elements(r.criteria) with ordinality c(value,ordinality)
    ) else r.criteria end) order by r.model_id),'[]'::jsonb) into v_result
  from (select distinct on (model_id) * from public.audit_catalog_revisions order by model_id,version desc) r
  where p_profile = 'ADMINISTRATIVO' or exists (
    select 1 from public.access_grants g join public.access_works w on w.id = g.obra_id
    where g.auth_user_id = auth.uid() and g.perfil = p_profile and w.ativo
      and g.modulo = case r.model_id when 'security-it07-r02' then 'SEGURANCA' else 'QUALIDADE' end
      and ((p_profile = 'AUDITOR_SEGURANCA' and g.modulo = 'SEGURANCA')
        or (p_profile = 'AUDITOR_QUALIDADE' and g.modulo = 'QUALIDADE')
        or (p_profile = 'ENGENHARIA' and p_engineering_scope in ('EQUIPE_OBRA','COORDENACAO')))
  ) or exists (
    select 1 from public.audit_visits v where v.modelo_id = r.model_id
      and p_profile = case v.modulo when 'SEGURANCA' then 'AUDITOR_SEGURANCA' else 'AUDITOR_QUALIDADE' end
      and public.has_current_assigned_audit_visit(v.id)
  );
  return v_result;
end;
$function$;
revoke all on function dialogo_private.read_audit_catalogs_unscoped(text,text)
  from public,anon,authenticated,service_role;

create or replace function public.read_fvs_services(p_profile text)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
begin
  if p_profile is null or p_profile not in ('ADMINISTRATIVO','AUDITOR_QUALIDADE')
    or not public.is_current_access_active()
    or not exists (select 1 from public.access_accounts a where a.auth_user_id = auth.uid() and p_profile = any(a.perfis))
    or (p_profile = 'ADMINISTRATIVO' and not public.has_current_administrative_module('QUALIDADE'))
    or (p_profile = 'AUDITOR_QUALIDADE' and not (
      exists (select 1 from public.access_grants g join public.access_works w on w.id = g.obra_id
        where g.auth_user_id = auth.uid() and g.perfil = p_profile and g.modulo = 'QUALIDADE' and w.ativo)
      or exists (select 1 from public.audit_visits v where v.modulo = 'QUALIDADE'
        and public.has_current_assigned_audit_visit(v.id)))) then
    raise exception using errcode = '42501', message = 'quality_weight_reader_required';
  end if;
  return (select jsonb_build_object('id',id,'version',version,'label',revision_label,'services',services,'createdAt',created_at)
    from public.audit_fvs_weight_revisions order by version desc limit 1);
end;
$function$;
revoke all on function public.read_fvs_services(text) from public,anon,authenticated,service_role;
grant execute on function public.read_fvs_services(text) to authenticated;

revoke all on function dialogo_private.create_audit_visit_unscoped(uuid,uuid,text,text,uuid,date,text),
  dialogo_private.read_audit_agenda_unscoped(text,text) from public,anon,authenticated,service_role;
revoke all on function public.confirm_audit_visit(uuid,uuid,integer),
  public.list_authorized_visit_auditors(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.confirm_audit_visit(uuid,uuid,integer),
  public.list_authorized_visit_auditors(uuid,text) to authenticated;
comment on function public.has_current_assigned_audit_visit(uuid) is
  'Only a live audit assigned to the active caller in their approved discipline; no work or follow-up grant is implied.';
comment on function public.list_authorized_visit_auditors(uuid,text) is
  'Eligible audit nominees by approved discipline. Work-follow-up nomination remains subject to actual work grants.';

notify pgrst, 'reload schema';
commit;

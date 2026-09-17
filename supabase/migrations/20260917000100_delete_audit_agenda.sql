-- B.13: remove a schedule from operational views while preserving its audit trail.
-- No existing visit, event or operation is deleted by this migration.
begin;

alter table public.audit_visits
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references auth.users(id) on delete restrict,
  add constraint audit_visits_cancellation_pair check ((cancelled_at is null) = (cancelled_by is null));
comment on column public.audit_visits.cancelled_at is
  'An administratively deleted schedule remains only for immutable operational history.';

alter table public.audit_visit_events drop constraint audit_visit_events_event_type_check;
alter table public.audit_visit_events add constraint audit_visit_events_event_type_check
  check (event_type in ('created', 'rescheduled', 'confirmed', 'cancelled'));

create function dialogo_private.reject_cancelled_visit_mutation()
returns trigger language plpgsql set search_path = '' as $function$
begin
  if old.cancelled_at is not null then
    raise exception using errcode = '55000', message = 'deleted_visit_is_immutable';
  end if;
  return new;
end;
$function$;
revoke all on function dialogo_private.reject_cancelled_visit_mutation()
  from public, anon, authenticated, service_role;
create trigger audit_visits_deleted_immutable before update or delete on public.audit_visits
  for each row execute function dialogo_private.reject_cancelled_visit_mutation();

create or replace function public.read_audit_agenda(p_profile text, p_engineering_scope text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
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
    'id',v.id,'workId',v.obra_id,'module',case v.modulo when 'SEGURANCA' then 'safety' else 'quality' end,
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
    where v.cancelled_at is null and w.ativo and (
      p_profile = 'ADMINISTRATIVO'
      or (p_profile in ('AUDITOR_SEGURANCA','AUDITOR_QUALIDADE') and v.auditor_auth_user_id = auth.uid()
        and public.has_current_access_grant(p_profile,v.obra_id,v.modulo))
      or (p_profile = 'ENGENHARIA' and p_engineering_scope = 'EQUIPE_OBRA'
        and public.has_current_engineering_scope('EQUIPE_OBRA',v.obra_id,v.modulo))
    );
  if p_profile = 'ADMINISTRATIVO' then
    select coalesce(jsonb_agg(s.auditor order by s.nome,s.auth_user_id,s.perfil),'[]'::jsonb) into v_auditors
      from (select r.nome,g.auth_user_id,g.perfil,jsonb_build_object(
        'id',g.auth_user_id,'name',r.nome,'role',case g.perfil when 'AUDITOR_SEGURANCA' then 'safety-auditor' else 'quality-auditor' end,
        'modules',jsonb_build_array(case g.perfil when 'AUDITOR_SEGURANCA' then 'safety' else 'quality' end),
        'workIds',jsonb_agg(g.obra_id order by g.obra_id),'agendaWorkIds',jsonb_agg(g.obra_id order by g.obra_id),
        'documentWorkIds','[]'::jsonb,'workModuleScopes',jsonb_agg(jsonb_build_object('workId',g.obra_id,
          'module',case g.modulo when 'SEGURANCA' then 'safety' else 'quality' end) order by g.obra_id)
      ) auditor from public.access_grants g join public.access_requests r on r.auth_user_id = g.auth_user_id
      where g.perfil in ('AUDITOR_SEGURANCA','AUDITOR_QUALIDADE')
        and dialogo_private.is_authorized_visit_auditor(g.auth_user_id,g.obra_id,g.modulo)
      group by r.nome,g.auth_user_id,g.perfil) s;
  end if;
  return jsonb_build_object('visits',v_visits,'auditors',v_auditors);
end;
$function$;

create function public.delete_audit_visit(p_request_id uuid, p_visit_id uuid, p_expected_revision integer)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare v_actor uuid := auth.uid(); v_visit public.audit_visits%rowtype;
  v_before jsonb; v_payload jsonb; v_replay uuid; v_cancelled_at timestamptz;
begin
  perform dialogo_private.lock_agenda_identity(v_actor,'ADMINISTRATIVO');
  if p_request_id is null or p_visit_id is null or p_expected_revision is null or p_expected_revision < 1 then
    raise exception using errcode = '22023', message = 'invalid_visit_revision';
  end if;
  select * into v_visit from public.audit_visits where id = p_visit_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'visit_not_found'; end if;
  v_payload := jsonb_build_object('operation','delete','visit_id',p_visit_id,'expected_revision',p_expected_revision);
  v_replay := dialogo_private.replay_visit_operation(v_actor,p_request_id,v_payload);
  if v_replay is not null then return v_replay; end if;
  if v_visit.cancelled_at is not null or v_visit.revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'visit_revision_conflict';
  end if;
  v_before := to_jsonb(v_visit);
  v_cancelled_at := clock_timestamp();
  update public.audit_visits set revision = revision + 1, cancelled_at = v_cancelled_at,
    cancelled_by = v_actor, updated_by = v_actor, updated_at = v_cancelled_at
    where id = p_visit_id returning * into v_visit;
  insert into public.audit_visit_events(visit_id,revision,event_type,before_snapshot,after_snapshot,actor_auth_user_id,occurred_at)
    values(v_visit.id,v_visit.revision,'cancelled',v_before,to_jsonb(v_visit),v_actor,v_cancelled_at);
  insert into dialogo_private.audit_visit_operations(actor_auth_user_id,request_id,payload,visit_id)
    values(v_actor,p_request_id,v_payload,v_visit.id);
  return v_visit.id;
end;
$function$;

revoke all on function public.reschedule_audit_visit(uuid,uuid,integer,date,text)
  from public, anon, authenticated, service_role;
revoke all on function public.delete_audit_visit(uuid,uuid,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.delete_audit_visit(uuid,uuid,integer) to authenticated;
comment on function public.delete_audit_visit(uuid,uuid,integer) is
  'Administrative-only, idempotent removal of a schedule from active views; the visit and immutable events remain for audit history.';
comment on function public.read_audit_agenda(text,text) is
  'Authorized agenda excludes administratively deleted schedules from all profiles and notifications.';
commit;

-- B.12: a work follow-up is a scheduled visit, never a scored audit.
-- Existing visits remain AUDITORIA. The date, professional and confirmation flow
-- are shared; a follow-up has no model and cannot produce an audit score.
begin;

alter table public.audit_visits add column visit_kind text not null default 'AUDITORIA'
  check (visit_kind in ('AUDITORIA', 'ACOMPANHAMENTO'));
alter table public.audit_visits alter column modelo_id drop not null;
alter table public.audit_visits add constraint audit_visits_kind_model_check check (
  (visit_kind = 'AUDITORIA' and modelo_id is not null and
    ((modulo = 'SEGURANCA' and modelo_id = 'security-it07-r02')
      or (modulo = 'QUALIDADE' and modelo_id in ('quality-f175', 'quality-f176'))))
  or (visit_kind = 'ACOMPANHAMENTO' and modelo_id is null)
);
comment on column public.audit_visits.visit_kind is
  'ACOMPANHAMENTO is a confirmed work visit without audit model, answers or monthly score.';

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
    'kind',case v.visit_kind when 'ACOMPANHAMENTO' then 'follow_up' else 'audit' end,'modelId',v.modelo_id,'auditorId',v.auditor_auth_user_id,'date',to_char(v.data_prevista,'YYYY-MM-DD'),
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
    where w.ativo and (
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

create function public.create_work_follow_up_visit(p_request_id uuid, p_obra_id uuid, p_modulo text,
  p_auditor_auth_user_id uuid, p_data_prevista date, p_observacao text)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare v_actor uuid := auth.uid(); v_payload jsonb; v_id uuid; v_visit public.audit_visits%rowtype;
begin
  perform dialogo_private.lock_agenda_identity(v_actor, 'ADMINISTRATIVO');
  perform dialogo_private.validate_visit_schedule(p_data_prevista, p_observacao);
  if p_obra_id is null or p_auditor_auth_user_id is null
    or p_modulo not in ('SEGURANCA', 'QUALIDADE') or p_modulo is null then
    raise exception using errcode = '22023', message = 'invalid_visit_scope';
  end if;
  perform dialogo_private.lock_visit_auditor(p_auditor_auth_user_id, p_obra_id, p_modulo);
  v_payload := jsonb_build_object('operation', 'follow_up', 'obra_id', p_obra_id,
    'modulo', p_modulo, 'auditor_id', p_auditor_auth_user_id, 'date', p_data_prevista,
    'note', p_observacao);
  v_id := dialogo_private.replay_visit_operation(v_actor, p_request_id, v_payload);
  if v_id is not null then return v_id; end if;
  insert into public.audit_visits(obra_id, modulo, visit_kind, modelo_id,
    auditor_auth_user_id, data_prevista, observacao, created_by, updated_by)
    values(p_obra_id, p_modulo, 'ACOMPANHAMENTO', null, p_auditor_auth_user_id,
      p_data_prevista, p_observacao, v_actor, v_actor)
    returning * into v_visit;
  insert into public.audit_visit_events(visit_id, revision, event_type, after_snapshot,
    actor_auth_user_id, occurred_at)
    values(v_visit.id, v_visit.revision, 'created', to_jsonb(v_visit), v_actor, v_visit.created_at);
  insert into dialogo_private.audit_visit_operations(actor_auth_user_id, request_id, payload, visit_id)
    values(v_actor, p_request_id, v_payload, v_visit.id);
  return v_visit.id;
end;
$function$;
revoke all on function public.create_work_follow_up_visit(uuid, uuid, text, uuid, date, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_work_follow_up_visit(uuid, uuid, text, uuid, date, text)
  to authenticated;

commit;

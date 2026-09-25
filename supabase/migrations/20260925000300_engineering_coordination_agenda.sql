-- Engineering coordination consults the same read-only agenda scope already
-- granted for its works and disciplines. Agenda mutations remain Administrative.
begin;

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
      or (p_profile = 'ENGENHARIA' and p_engineering_scope in ('EQUIPE_OBRA','COORDENACAO')
        and public.has_current_engineering_scope(p_engineering_scope,v.obra_id,v.modulo))
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

revoke all on function dialogo_private.read_audit_agenda_unscoped(text,text)
  from public,anon,authenticated,service_role;

comment on function dialogo_private.read_audit_agenda_unscoped(text,text) is
  'Read-only agenda projection by active profile, exact Engineering activity, work and discipline.';

notify pgrst, 'reload schema';
commit;

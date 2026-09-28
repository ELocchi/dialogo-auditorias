-- Compact active agenda with on-demand visit details. Legacy read RPCs remain
-- compatible while the application is deployed; no write paths are changed.
begin;

create function dialogo_private.require_selected_agenda_profile(
  p_profile text,p_engineering_scope text,p_administrative_scope text
) returns void language plpgsql stable security definer set search_path = '' as $function$
begin
  perform dialogo_private.require_published_audit_profile(p_profile,p_engineering_scope,p_administrative_scope);
  -- The shared profile guard validates administrative scope syntax. Membership
  -- in the currently selected administrative discipline is checked separately.
  if p_profile = 'ADMINISTRATIVO' and not exists (
    select 1 from public.access_accounts a where a.auth_user_id = auth.uid()
      and a.atuacao_administrativa in ('GERAL',p_administrative_scope)
  ) then raise exception using errcode = '42501', message = 'active_agenda_profile_required'; end if;
end;
$function$;

-- Both new reads use this one visibility predicate, including assignment-only
-- auditors and Engineering coordination. Filter before constructing any prose.
create function dialogo_private.project_selected_agenda_visits(
  p_profile text,p_engineering_scope text,p_administrative_scope text,p_visit_id uuid,p_compact boolean
) returns jsonb language sql stable security definer set search_path = '' as $function$
  with visible as materialized (
    select v.*,w.nome as work_name,ar.nome as auditor_name,cr.nome as creator_name
    from public.audit_visits v join public.access_works w on w.id = v.obra_id
      join public.access_requests ar on ar.auth_user_id = v.auditor_auth_user_id
      join public.access_requests cr on cr.auth_user_id = v.created_by
    where (p_visit_id is null or v.id = p_visit_id)
      and v.cancelled_at is null and v.published_audit_id is null and w.ativo and (
        (p_profile = 'ADMINISTRATIVO' and public.has_current_administrative_module(v.modulo)
          and (p_administrative_scope = 'GERAL' or p_administrative_scope = v.modulo))
        or (p_profile = case v.modulo when 'SEGURANCA' then 'AUDITOR_SEGURANCA' else 'AUDITOR_QUALIDADE' end
          and v.auditor_auth_user_id = auth.uid()
          and ((v.visit_kind = 'AUDITORIA' and dialogo_private.is_eligible_audit_nominee(auth.uid(),v.modulo))
            or (v.visit_kind = 'ACOMPANHAMENTO' and public.has_current_access_grant(p_profile,v.obra_id,v.modulo))))
        or (p_profile = 'ENGENHARIA' and p_engineering_scope in ('EQUIPE_OBRA','COORDENACAO')
          and public.has_current_engineering_scope(p_engineering_scope,v.obra_id,v.modulo))
      )
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',v.id,'workId',v.obra_id,'workName',v.work_name,
    'module',case v.modulo when 'SEGURANCA' then 'safety' else 'quality' end,
    'kind',case v.visit_kind when 'ACOMPANHAMENTO' then 'follow_up' else 'audit' end,
    'modelId',v.modelo_id,'auditorId',v.auditor_auth_user_id,'date',to_char(v.data_prevista,'YYYY-MM-DD'),
    'createdBy',v.created_by,'createdAt',v.created_at,'revision',v.revision,
    'confirmationStatus',v.confirmation_status,'confirmedAt',v.confirmed_at,
    'auditorName',v.auditor_name,'createdByName',v.creator_name,
    -- Detail freshness is separate from schedule revision and notification time:
    -- note-only corrections and earlier imported immutable events must also
    -- invalidate an already-open card without reloading unrelated visits.
    'detailVersion',md5(jsonb_build_array(v.revision,v.observacao,
      (select coalesce(string_agg(e.id::text,'' order by e.revision,e.occurred_at,e.id),'')
       from public.audit_visit_events e where e.visit_id = v.id and e.event_type = 'rescheduled'))::text),
    -- Match history.at(-1).changedAt exactly; max(occurred_at) would differ for
    -- imported events whose revision order and timestamp order are different.
    'lastChangedAt',coalesce((select e.occurred_at from public.audit_visit_events e
      where e.visit_id = v.id and e.event_type = 'rescheduled'
      order by e.revision desc,e.occurred_at desc,e.id desc limit 1),v.created_at)
  ) || case when p_compact then '{}'::jsonb else jsonb_build_object(
    'note',v.observacao,
    'history',(select coalesce(jsonb_agg(jsonb_build_object(
      'previousDate',e.before_snapshot->>'data_prevista','date',e.after_snapshot->>'data_prevista',
      'note',e.after_snapshot->>'observacao','changedBy',e.actor_auth_user_id,'changedAt',e.occurred_at)
      order by e.revision,e.occurred_at,e.id),'[]'::jsonb)
      from public.audit_visit_events e where e.visit_id = v.id and e.event_type = 'rescheduled')
  ) end order by v.data_prevista,v.created_at,v.id),'[]'::jsonb) from visible v;
$function$;

create function public.read_compact_audit_agenda_if_changed(
  p_profile text,p_engineering_scope text default null,p_administrative_scope text default null,p_known_revision text default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare v_revision text; v_auth text; v_metadata text; v_visits jsonb; v_auditors jsonb := '[]'::jsonb;
begin
  perform dialogo_private.require_selected_agenda_profile(p_profile,p_engineering_scope,p_administrative_scope);
  -- Evaluate ban eligibility at statement time: expiry changes the fingerprint
  -- even without a write. No tokens, passwords or unrelated auth fields are read.
  select coalesce(string_agg(jsonb_build_array(u.id,u.email,u.email_confirmed_at is not null,
    u.deleted_at is not null,coalesce(u.banned_until > statement_timestamp(),false))::text,
    ',' order by u.id),'') into v_auth
  from auth.users u join public.access_accounts a on a.auth_user_id = u.id;
  -- Hash fixed-size row digests in a deterministic order. This avoids building
  -- nested visit history and each auditor's full work/grant JSON on every poll.
  -- All sources share this STABLE statement snapshot, so concurrent commits
  -- cannot associate a new token with an older projection.
  -- An auditor's projection never includes another auditor's visits, even for
  -- a shared work. Keep its visit/history fingerprint inside that same boundary.
  with relevant_visits as materialized (
    select v.* from public.audit_visits v
    where v.cancelled_at is null and v.published_audit_id is null
      and (p_profile not in ('AUDITOR_SEGURANCA','AUDITOR_QUALIDADE')
        or (v.auditor_auth_user_id=auth.uid()
          and v.modulo=case p_profile when 'AUDITOR_SEGURANCA' then 'SEGURANCA' else 'QUALIDADE' end))
  ) select concat_ws('|',
    (select md5(coalesce(string_agg(md5(row(v.id,v.obra_id,v.modulo,v.modelo_id,v.auditor_auth_user_id,
      v.data_prevista,v.observacao,v.revision,v.confirmation_status,v.confirmed_at,v.created_by,
      v.created_at,v.visit_kind)::text),'' order by v.id),''))
      from relevant_visits v),
    (select md5(coalesce(string_agg(e.id::text,'' order by e.id),''))
      from public.audit_visit_events e join relevant_visits v on v.id=e.visit_id
      where e.event_type='rescheduled'),
    (select md5(coalesce(string_agg(md5(row(a.auth_user_id,a.ativo,a.perfis,a.atuacoes_engenharia,
      a.atuacao_administrativa)::text),'' order by a.auth_user_id),'')) from public.access_accounts a),
    (select md5(coalesce(string_agg(md5(row(r.auth_user_id,r.nome,r.email,r.status_acesso)::text),''
      order by r.auth_user_id),'')) from public.access_requests r),
    (select md5(coalesce(string_agg(md5(row(g.auth_user_id,g.perfil,g.obra_id,g.modulo)::text),''
      order by g.auth_user_id,g.perfil,g.obra_id,g.modulo),'')) from public.access_grants g),
    (select md5(coalesce(string_agg(md5(row(w.id,w.nome,w.ativo)::text),'' order by w.id),'')) from public.access_works w),
    (select md5(coalesce(string_agg(md5(row(t.obra_id,t.auth_user_id)::text),'' order by t.obra_id,t.auth_user_id),''))
      from public.work_team_links t)
  ) into v_metadata;
  select md5(jsonb_build_array('agenda-compact-v1',v_metadata,auth.uid(),p_profile,p_engineering_scope,
    p_administrative_scope,current_date,v_auth)::text) into v_revision;
  if v_revision = p_known_revision then
    return jsonb_build_object('unchanged',true,'revision',v_revision);
  end if;
  v_visits := dialogo_private.project_selected_agenda_visits(p_profile,p_engineering_scope,p_administrative_scope,null,true);
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
      and public.has_current_administrative_module(case p.perfil when 'AUDITOR_SEGURANCA' then 'SEGURANCA' else 'QUALIDADE' end)
      and (p_administrative_scope = 'GERAL' or p_administrative_scope =
        case p.perfil when 'AUDITOR_SEGURANCA' then 'SEGURANCA' else 'QUALIDADE' end)
      and dialogo_private.is_eligible_audit_nominee(a.auth_user_id,
        case p.perfil when 'AUDITOR_SEGURANCA' then 'SEGURANCA' else 'QUALIDADE' end);
  end if;
  return jsonb_build_object('unchanged',false,'revision',v_revision,
    'snapshot',jsonb_build_object('visits',v_visits,'auditors',v_auditors));
end;
$function$;

create function public.read_audit_agenda_visit_detail(
  p_profile text,p_visit_id uuid,p_engineering_scope text default null,p_administrative_scope text default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
begin
  perform dialogo_private.require_selected_agenda_profile(p_profile,p_engineering_scope,p_administrative_scope);
  if p_visit_id is null then return null; end if;
  return dialogo_private.project_selected_agenda_visits(p_profile,p_engineering_scope,p_administrative_scope,p_visit_id,false)->0;
end;
$function$;

revoke all on function dialogo_private.require_selected_agenda_profile(text,text,text),
  dialogo_private.project_selected_agenda_visits(text,text,text,uuid,boolean),
  public.read_compact_audit_agenda_if_changed(text,text,text,text),
  public.read_audit_agenda_visit_detail(text,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.read_compact_audit_agenda_if_changed(text,text,text,text),
  public.read_audit_agenda_visit_detail(text,uuid,text,text) to authenticated;
comment on function public.read_compact_audit_agenda_if_changed(text,text,text,text) is
  'Authorizes each poll; unchanged skips projection, changed returns complete active calendar metadata without visit prose/history.';
comment on function public.read_audit_agenda_visit_detail(text,uuid,text,text) is
  'Authorizes selected profile and exact active visit before constructing its note and immutable reschedule history.';
notify pgrst, 'reload schema';
commit;

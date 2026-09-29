begin;

create or replace function dialogo_private.display_name_from_email(p_email text)
returns text language sql immutable set search_path = '' as $function$
  with parts as (
    select regexp_split_to_array(
      lower(split_part(split_part(coalesce(p_email,''),'@',1),'+',1)),
      '[._ -]+'
    ) as value
  )
  select nullif(concat_ws(' ',
    initcap(value[1]),
    case when cardinality(value) > 1 then initcap(value[cardinality(value)]) end
  ),'') from parts;
$function$;

create or replace function public.read_compact_audit_agenda_if_changed(
  p_profile text,p_engineering_scope text default null,p_administrative_scope text default null,p_known_revision text default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare v_revision text; v_auth text; v_metadata text; v_visits jsonb; v_auditors jsonb := '[]'::jsonb;
begin
  perform dialogo_private.require_selected_agenda_profile(p_profile,p_engineering_scope,p_administrative_scope);
  select coalesce(string_agg(jsonb_build_array(u.id,u.email,u.email_confirmed_at is not null,
    u.deleted_at is not null,coalesce(u.banned_until > statement_timestamp(),false))::text,
    ',' order by u.id),'') into v_auth
  from auth.users u join public.access_accounts a on a.auth_user_id = u.id;
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
  select md5(jsonb_build_array('agenda-compact-v2',v_metadata,auth.uid(),p_profile,p_engineering_scope,
    p_administrative_scope,current_date,v_auth)::text) into v_revision;
  if v_revision = p_known_revision then
    return jsonb_build_object('unchanged',true,'revision',v_revision);
  end if;
  v_visits := dialogo_private.project_selected_agenda_visits(p_profile,p_engineering_scope,p_administrative_scope,null,true);
  if p_profile = 'ADMINISTRATIVO' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',a.auth_user_id,'name',coalesce(dialogo_private.display_name_from_email(r.email),r.nome),
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

comment on function public.read_compact_audit_agenda_if_changed(text,text,text,text) is
  'Authorizes each poll and returns the canonical auditor display name derived from the registered email without exposing that email.';
revoke all on function dialogo_private.display_name_from_email(text) from public,anon,authenticated,service_role;
notify pgrst, 'reload schema';
commit;

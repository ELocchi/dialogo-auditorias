-- Conditional agenda reads fingerprint only compact metadata. No write-side
-- triggers, shared revision row, global locks, or changes to managed auth tables.
begin;

create function public.read_audit_agenda_if_changed(
  p_profile text,p_engineering_scope text default null,p_administrative_scope text default null,p_known_revision text default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare v_revision text; v_data jsonb; v_auth text; v_metadata text;
begin
  perform dialogo_private.require_published_audit_profile(p_profile,p_engineering_scope,p_administrative_scope);
  -- General administrators may select a discipline; limited administrators must
  -- retain their actual scope. This check runs even when the revision matches.
  if p_profile = 'ADMINISTRATIVO' and not exists (
    select 1 from public.access_accounts a where a.auth_user_id = auth.uid()
      and a.atuacao_administrativa in ('GERAL',p_administrative_scope)
  ) then raise exception using errcode = '42501', message = 'active_agenda_profile_required'; end if;

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
  select md5(jsonb_build_array('agenda-v1',v_metadata,auth.uid(),p_profile,p_engineering_scope,
    p_administrative_scope,current_date,v_auth)::text) into v_revision;
  if v_revision = p_known_revision then
    return jsonb_build_object('unchanged',true,'revision',v_revision);
  end if;

  v_data := public.read_audit_agenda(p_profile,p_engineering_scope);
  if p_profile = 'ADMINISTRATIVO' and p_administrative_scope <> 'GERAL' then
    v_data := jsonb_build_object(
      'visits',(select coalesce(jsonb_agg(value),'[]'::jsonb) from jsonb_array_elements(v_data->'visits') value
        where value->>'module' = case p_administrative_scope when 'SEGURANCA' then 'safety' else 'quality' end),
      'auditors',(select coalesce(jsonb_agg(value),'[]'::jsonb) from jsonb_array_elements(v_data->'auditors') value
        where value->>'role' = case p_administrative_scope when 'SEGURANCA' then 'safety-auditor' else 'quality-auditor' end));
  end if;
  return jsonb_build_object('unchanged',false,'revision',v_revision,'snapshot',v_data);
end;
$function$;
revoke all on function public.read_audit_agenda_if_changed(text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.read_audit_agenda_if_changed(text,text,text,text) to authenticated;
comment on function public.read_audit_agenda_if_changed(text,text,text,text) is
  'Always authorizes the selected profile. Unchanged requests skip agenda/history JSON construction within the same database snapshot.';
notify pgrst, 'reload schema';
commit;

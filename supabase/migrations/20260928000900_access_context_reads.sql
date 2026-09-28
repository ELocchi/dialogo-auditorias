-- Read the current account and selected workspace without repeated REST reads.
-- Both snapshots use the caller's session and live database authorization.
begin;

create function public.read_current_access_account()
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
begin
  if not public.is_current_access_active() then return null; end if;
  return (
    select jsonb_build_object(
      'account',jsonb_build_object('auth_user_id',a.auth_user_id,'perfil',a.perfil,'perfis',a.perfis,
        'atuacao_engenharia',a.atuacao_engenharia,'atuacoes_engenharia',a.atuacoes_engenharia,
        'atuacao_administrativa',a.atuacao_administrativa,'ativo',a.ativo,'approved_at',a.approved_at),
      'request',jsonb_build_object('auth_user_id',r.auth_user_id,'status_acesso',r.status_acesso,
        'email',r.email,'email_confirmado_em',r.email_confirmado_em))
    from public.access_accounts a join public.access_requests r on r.auth_user_id=a.auth_user_id
    where a.auth_user_id=auth.uid() and r.email_confirmado_em is not null
  );
end;
$function$;

create function public.read_current_access_workspace(
  p_profile text,p_engineering_scope text default null,p_administrative_scope text default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare v_actor uuid := auth.uid(); v_identity jsonb; v_general_administrator boolean := false;
begin
  perform dialogo_private.require_published_audit_profile(p_profile,p_engineering_scope,p_administrative_scope);
  -- The selected administrative discipline must still belong to this account.
  -- General administrators may select either discipline, as in agenda reads.
  if p_profile='ADMINISTRATIVO' and not exists (
    select 1 from public.access_accounts a where a.auth_user_id=v_actor
      and a.atuacao_administrativa in ('GERAL',p_administrative_scope)
  ) then raise exception using errcode='42501',message='active_workspace_profile_required'; end if;
  if p_profile='ADMINISTRATIVO' then
    select a.atuacao_administrativa='GERAL' into v_general_administrator
      from public.access_accounts a where a.auth_user_id=v_actor;
  end if;

  select jsonb_build_object('id',r.auth_user_id,'name',r.nome,'email',r.email) into v_identity
    from public.access_requests r where r.auth_user_id=v_actor and r.email_confirmado_em is not null;
  if v_identity is null then
    raise exception using errcode='42501',message='active_workspace_profile_required';
  end if;

  return (
    -- Profile/account validity has already been checked against the same
    -- statement snapshot. Joining active works exactly mirrors grant RLS,
    -- without repeating the full authorization helper for every grant.
    with selected_grants as materialized (
      select g.perfil,g.obra_id,g.modulo from public.access_grants g
      join public.access_works w on w.id=g.obra_id and w.ativo
      where g.auth_user_id=v_actor and g.perfil=p_profile
    ), selected_works as (
      select w.id,w.nome,w.ativo,w.cidade,w.uf,w.logradouro,w.numero,w.responsavel_tecnico,w.coordenacao
      from public.access_works w where w.ativo and (
        (p_profile<>'ADMINISTRATIVO' and exists(select 1 from selected_grants g where g.obra_id=w.id))
        or (p_profile='ADMINISTRATIVO' and (v_general_administrator or exists (
          -- Preserve access_works RLS for limited administrators: only their
          -- existing technical grants make works visible. No implicit grants.
          select 1 from public.access_grants g join public.access_accounts a on a.auth_user_id=g.auth_user_id
          where g.auth_user_id=v_actor and g.obra_id=w.id and g.perfil=any(a.perfis)
        )))
      )
    )
    select jsonb_build_object('identity',v_identity,
      'works',coalesce((select jsonb_agg(to_jsonb(w) order by w.nome,w.id) from selected_works w),'[]'::jsonb),
      'grants',coalesce((select jsonb_agg(to_jsonb(g) order by g.perfil,g.obra_id,g.modulo) from selected_grants g),'[]'::jsonb))
  );
end;
$function$;

revoke all on function public.read_current_access_account(),public.read_current_access_workspace(text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.read_current_access_account(),public.read_current_access_workspace(text,text,text)
  to authenticated;
notify pgrst,'reload schema';
commit;

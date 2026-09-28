-- Read only the administrative view requested, and expand history only after
-- selecting its account page. Authorization stays current on every call.
begin;

create index access_decisions_user_recent
  on public.access_decisions (auth_user_id, decided_at desc, id desc);
create index access_requests_pending_created
  on public.access_requests (created_at, auth_user_id)
  where status_acesso = 'PENDENTE_APROVACAO' and email_confirmado_em is not null;

create function public.read_access_administration_page(p_view text, p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare v_actor uuid := auth.uid(); v_works jsonb;
begin
  if v_actor is null or not public.is_current_access_administrator() then
    raise exception using errcode = '42501', message = 'general_administrator_required';
  end if;
  if p_view is null or p_view not in ('summary','pending','history')
    or p_page is null or p_page not between 1 and 999999 then
    raise exception using errcode = '22023', message = 'invalid_administration_page';
  end if;

  if p_view = 'summary' then
    return jsonb_build_object('view',p_view,
      'pendingCount',(select count(*) from public.access_requests r
        join auth.users u on u.id=r.auth_user_id
        where r.status_acesso='PENDENTE_APROVACAO' and r.email_confirmado_em is not null
          and u.email_confirmed_at is not null and r.email=u.email and u.deleted_at is null
          and (u.banned_until is null or u.banned_until<=statement_timestamp())),
      'activeCount',(select count(*) from public.access_accounts a where a.ativo));
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'nome',w.nome,'ativo',w.ativo)
    order by w.nome,w.id),'[]'::jsonb) into v_works
    from public.access_works w where w.ativo;

  if p_view = 'pending' then
    return (
      -- Match the old confirmed-pending SELECT and its Auth/RLS eligibility.
      -- Administrative authority was checked once above for this snapshot.
      with eligible as materialized (
        select r.auth_user_id,r.nome,r.email,r.cargo_area_informado,r.obra_referencia_informada,
          r.email_confirmado_em,r.created_at
        from public.access_requests r join auth.users u on u.id=r.auth_user_id
        where r.status_acesso='PENDENTE_APROVACAO' and r.email_confirmado_em is not null
          and u.email_confirmed_at is not null and r.email=u.email and u.deleted_at is null
          and (u.banned_until is null or u.banned_until<=statement_timestamp())
      ), page as (
        select * from eligible order by created_at,auth_user_id limit 20 offset (p_page-1)*20
      )
      select jsonb_build_object('view',p_view,'page',p_page,'pageSize',20,
        'total',(select count(*) from eligible),'works',v_works,
        'requests',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at,r.auth_user_id)
          from page r),'[]'::jsonb))
    );
  end if;

  return (
    -- The index supplies one latest date per account. Large JSON snapshots and
    -- grant collections are never loaded for accounts outside the selected page.
    with page as materialized (
      select a.auth_user_id,a.perfis,a.atuacao_engenharia,a.atuacoes_engenharia,
        a.atuacao_administrativa,a.ativo,a.approved_at,d.decided_at as latest_decided_at
      from public.access_accounts a
      left join lateral (
        select h.decided_at from public.access_decisions h where h.auth_user_id=a.auth_user_id
        order by h.decided_at desc,h.id desc limit 1
      ) d on true
      order by d.decided_at desc nulls last,a.approved_at desc,a.auth_user_id
      limit 20 offset (p_page-1)*20
    )
    select jsonb_build_object('view',p_view,'page',p_page,'pageSize',20,
      'total',(select count(*) from public.access_accounts),'works',v_works,
      'users',coalesce((select jsonb_agg(jsonb_build_object(
        'account',jsonb_build_object('auth_user_id',a.auth_user_id,'perfis',a.perfis,
          'atuacao_engenharia',a.atuacao_engenharia,'atuacoes_engenharia',a.atuacoes_engenharia,
          'atuacao_administrativa',a.atuacao_administrativa,'ativo',a.ativo),
        'decisions',coalesce((select jsonb_agg(jsonb_build_object(
          'id',h.id,'auth_user_id',h.auth_user_id,'decision_type',h.decision_type,
          'perfil',h.perfil,'perfis',h.perfis,'atuacao_engenharia',h.atuacao_engenharia,
          'atuacoes_engenharia',h.atuacoes_engenharia,'atuacao_administrativa',s.atuacao_administrativa,
          'request_snapshot',h.request_snapshot,'grants_snapshot',h.grants_snapshot,
          'before_access_snapshot',h.before_access_snapshot,'actor_snapshot',h.actor_snapshot,
          'reason',h.reason,'actor_auth_user_id',h.actor_auth_user_id,
          'actor_database_role',h.actor_database_role,'decided_at',h.decided_at)
          order by h.decided_at desc,h.id desc)
          from public.access_decisions h
          left join dialogo_private.administrative_scope_decisions s on s.decision_id=h.id
          where h.auth_user_id=a.auth_user_id),'[]'::jsonb),
        'grants',coalesce((select jsonb_agg(jsonb_build_object('auth_user_id',g.auth_user_id,
          'perfil',g.perfil,'obra_id',g.obra_id,'modulo',g.modulo) order by g.perfil,g.obra_id,g.modulo)
          from public.access_grants g where g.auth_user_id=a.auth_user_id
            -- Preserve the own-grant branch of access_grants RLS. Other users'
            -- grants stay visible to General administration, including inactive works.
            and (g.auth_user_id<>v_actor or (g.perfil=any(a.perfis) and exists (
              select 1 from public.access_works w where w.id=g.obra_id and w.ativo)))),'[]'::jsonb))
        order by a.latest_decided_at desc nulls last,a.approved_at desc,a.auth_user_id)
        from page a),'[]'::jsonb))
  );
end;
$function$;

revoke all on function public.read_access_administration_page(text,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.read_access_administration_page(text,integer) to authenticated;
comment on function public.read_access_administration_page(text,integer) is
  'Current General administrators only. Summary counts, a confirmed pending page, or complete histories for 20 accounts; no cross-request authorization cache.';
notify pgrst,'reload schema';
commit;

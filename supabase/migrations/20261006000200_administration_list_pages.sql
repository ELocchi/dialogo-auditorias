-- Keep one account snapshot on the list; history is loaded when requested.
begin;
create or replace function public.read_access_administration_page(p_view text, p_page integer default 1)
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
          from (select * from public.access_decisions where auth_user_id=a.auth_user_id
            order by decided_at desc,id desc limit 1) h
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

create function public.read_access_decision_page(p_user_id uuid,p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path='' as $f$
begin
 if not public.is_current_access_administrator() then raise exception using errcode='42501',message='administrator_required';end if;
 if p_user_id is null or p_page is null or p_page not between 1 and 999999 then raise exception using errcode='22023',message='invalid_history_page';end if;
 return (with page as (select h.* from public.access_decisions h where h.auth_user_id=p_user_id
   order by h.decided_at desc,h.id desc limit 20 offset (p_page-1)*20)
 select jsonb_build_object('available',true,'page',p_page,'size',20,'total',(select count(*) from public.access_decisions where auth_user_id=p_user_id),
   'decisions',coalesce((select jsonb_agg(to_jsonb(h)||jsonb_build_object('atuacao_administrativa',s.atuacao_administrativa)
   order by h.decided_at desc,h.id desc) from page h left join dialogo_private.administrative_scope_decisions s on s.decision_id=h.id),'[]'::jsonb)));
end;
$f$;
create function public.read_team_profile_page(p_search text default '',p_page integer default 1,p_ids uuid[] default null)
returns jsonb language plpgsql stable security definer set search_path='' as $f$
begin
 if not public.is_current_access_administrator() then raise exception using errcode='42501',message='administrator_required';end if;
 if p_search is null or char_length(p_search)>120 or p_page is null or p_page not between 1 and 999999
   or (p_ids is not null and cardinality(p_ids)>30) then raise exception using errcode='22023',message='invalid_team_page';end if;
 return (with eligible as (
  select a.auth_user_id as id,r.nome,r.email,a.perfis from public.access_accounts a join public.access_requests r on r.auth_user_id=a.auth_user_id
  where a.ativo and r.status_acesso='APROVADO' and (p_ids is null or a.auth_user_id=any(p_ids))
    and (p_search='' or strpos(lower(r.nome||' '||r.email),lower(p_search))>0)
 ), page as materialized (select * from eligible order by nome,id limit case when p_ids is null then 20 else 30 end offset (p_page-1)*20)
 select jsonb_build_object('available',true,'page',p_page,'size',20,'total',(select count(*) from eligible),
 'profiles',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('modulos',coalesce((select jsonb_agg(m.label order by m.label)
  from (select distinct g.perfil||': '||g.modulo as label from public.access_grants g where g.auth_user_id=p.id) m),'[]'::jsonb)) order by p.nome,p.id)
  from page p),'[]'::jsonb)));
end;
$f$;
revoke all on function public.read_access_decision_page(uuid,integer),public.read_team_profile_page(text,integer,uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.read_access_decision_page(uuid,integer),public.read_team_profile_page(text,integer,uuid[]) to authenticated;
notify pgrst,'reload schema';
commit;

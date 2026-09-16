-- B.10: link active accounts to works using their existing technical profile/module scopes.
-- Grant and revoke only the tuples created by a work-team link. Historical decisions stay immutable.
begin;

create table public.work_team_links (
  obra_id uuid not null references public.access_works(id) on delete restrict,
  auth_user_id uuid not null references public.access_accounts(auth_user_id) on delete restrict,
  linked_at timestamptz not null,
  linked_by uuid not null references auth.users(id) on delete restrict,
  primary key (obra_id, auth_user_id)
);
alter table public.work_team_links enable row level security;
revoke all on table public.work_team_links from public, anon, authenticated, service_role;
grant select on table public.work_team_links to authenticated;
create policy work_team_links_select_admin on public.work_team_links
  for select to authenticated using ((select public.is_current_access_administrator()));

alter table public.access_decisions drop constraint access_decisions_decision_type_check;
alter table public.access_decisions add constraint access_decisions_decision_type_check
  check (decision_type in ('BOOTSTRAP', 'APROVACAO', 'AJUSTE_PERFIS_INICIAL',
    'AJUSTE_ATUACAO_INICIAL', 'AJUSTE_ACESSOS_GERAIS', 'VINCULO_OBRA', 'DESVINCULO_OBRA'));
alter table public.access_decisions drop constraint access_decisions_actor_check;
alter table public.access_decisions add constraint access_decisions_actor_check check (
  (decision_type = 'BOOTSTRAP' and actor_auth_user_id is null
    and actor_database_role is not distinct from 'postgres' and perfil = 'ADMINISTRATIVO'
    and atuacao_engenharia is null and grants_snapshot = '[]'::jsonb
    and before_access_snapshot is null
    and (perfis is null or perfis = array['ADMINISTRATIVO']::text[]))
  or (decision_type = 'APROVACAO' and actor_auth_user_id is not null
    and actor_auth_user_id <> auth_user_id and actor_database_role is null
    and before_access_snapshot is null)
  or (decision_type = 'AJUSTE_PERFIS_INICIAL' and actor_auth_user_id is null
    and actor_database_role is not distinct from 'postgres' and perfil = 'ADMINISTRATIVO'
    and perfis is not null and perfis = array['ADMINISTRATIVO', 'AUDITOR_SEGURANCA',
      'AUDITOR_QUALIDADE', 'ENGENHARIA']::text[]
    and atuacao_engenharia is not distinct from 'COORDENACAO' and before_access_snapshot is not null)
  or (decision_type = 'AJUSTE_ATUACAO_INICIAL' and actor_auth_user_id is null
    and auth_user_id = '13044e3f-e8d2-4b4b-9981-22a8de22c610'::uuid
    and actor_database_role is not distinct from 'postgres' and perfil = 'ADMINISTRATIVO'
    and perfis is not null and perfis = array['ADMINISTRATIVO', 'AUDITOR_SEGURANCA',
      'AUDITOR_QUALIDADE', 'ENGENHARIA']::text[]
    and atuacao_engenharia is not distinct from 'COORDENACAO'
    and atuacoes_engenharia is not null
    and atuacoes_engenharia = array['EQUIPE_OBRA', 'COORDENACAO']::text[]
    and before_access_snapshot is not null and jsonb_array_length(grants_snapshot) = 84)
  or (decision_type = 'AJUSTE_ACESSOS_GERAIS' and actor_auth_user_id is null
    and auth_user_id = '1f60b2cc-8028-453e-a6de-9312aa5a67cb'::uuid
    and actor_database_role is not distinct from 'postgres' and perfil = 'ADMINISTRATIVO'
    and perfis is not null and perfis = array['ADMINISTRATIVO', 'AUDITOR_SEGURANCA',
      'AUDITOR_QUALIDADE', 'ENGENHARIA']::text[]
    and atuacao_engenharia is not distinct from 'COORDENACAO'
    and atuacoes_engenharia is not null
    and atuacoes_engenharia = array['EQUIPE_OBRA', 'COORDENACAO']::text[]
    and before_access_snapshot is not null and jsonb_array_length(grants_snapshot) = 84)
  or (decision_type in ('VINCULO_OBRA', 'DESVINCULO_OBRA')
    and actor_auth_user_id is not null and actor_database_role is null
    and before_access_snapshot is null)
);

create function dialogo_private.sync_work_team_links(p_work_id uuid, p_user_ids uuid[])
returns boolean language plpgsql security definer set search_path = '' as $function$
declare
  v_actor uuid := auth.uid();
  v_actor_snapshot jsonb;
  v_work_name text;
  v_target uuid;
  v_account public.access_accounts%rowtype;
  v_request public.access_requests%rowtype;
  v_snapshot jsonb;
  v_decision uuid;
  v_now timestamptz;
  v_changed boolean := false;
begin
  if not public.is_current_access_administrator() then
    raise exception using errcode = '42501', message = 'active_administrator_required';
  end if;
  if p_work_id is null or p_user_ids is null or cardinality(p_user_ids) > 30
    or exists (select 1 from unnest(p_user_ids) u(id) where u.id is null)
    or (select count(distinct u.id) from unnest(p_user_ids) u(id)) <> cardinality(p_user_ids) then
    raise exception using errcode = '22023', message = 'invalid_work_team_links';
  end if;
  select w.nome into v_work_name from public.access_works w
    where w.id = p_work_id and w.ativo for update;
  if not found then raise exception using errcode = '22023', message = 'active_work_required'; end if;
  select jsonb_build_object('auth_user_id', r.auth_user_id, 'nome', r.nome, 'email', r.email)
    into v_actor_snapshot from public.access_requests r where r.auth_user_id = v_actor;

  for v_target in select u.id from unnest(p_user_ids) u(id)
    where not exists (select 1 from public.work_team_links l
      where l.obra_id = p_work_id and l.auth_user_id = u.id) order by u.id loop
    select a.* into v_account from public.access_accounts a join auth.users u on u.id = a.auth_user_id
      join public.access_requests r on r.auth_user_id = a.auth_user_id
      where a.auth_user_id = v_target and a.ativo and r.status_acesso = 'APROVADO'
        and r.email = u.email and u.email_confirmed_at is not null and u.deleted_at is null
        and (u.banned_until is null or u.banned_until <= statement_timestamp())
        and public.is_dialogo_corporate_email(u.email)
      for share of a, u, r;
    if not found then raise exception using errcode = '22023', message = 'active_profile_required'; end if;
    select * into v_request from public.access_requests where auth_user_id = v_target;
    select coalesce(jsonb_agg(jsonb_build_object('perfil', g.perfil, 'obra_id', p_work_id,
      'modulo', g.modulo, 'obra_nome', v_work_name) order by g.perfil, g.modulo), '[]'::jsonb)
      into v_snapshot from (
        select distinct existing.perfil, existing.modulo from public.access_grants existing
        where existing.auth_user_id = v_target and existing.perfil = any(v_account.perfis)
          and not exists (select 1 from public.access_grants current_grant
            where current_grant.auth_user_id = v_target and current_grant.obra_id = p_work_id
              and current_grant.perfil = existing.perfil and current_grant.modulo = existing.modulo)
      ) g;
    v_now := clock_timestamp();
    v_decision := gen_random_uuid();
    insert into public.access_decisions (
      id, auth_user_id, decision_type, perfil, perfis, atuacao_engenharia,
      atuacoes_engenharia, request_snapshot, grants_snapshot, reason,
      actor_auth_user_id, actor_snapshot, decided_at
    ) values (
      v_decision, v_target, 'VINCULO_OBRA', v_account.perfil, v_account.perfis,
      v_account.atuacao_engenharia, v_account.atuacoes_engenharia,
      to_jsonb(v_request), v_snapshot, 'Vínculo de equipe à obra ' || v_work_name,
      v_actor, v_actor_snapshot, v_now
    );
    insert into public.access_grants (auth_user_id, perfil, obra_id, modulo, granted_at, granted_by, decision_id)
      select v_target, item.value ->> 'perfil', p_work_id, item.value ->> 'modulo', v_now, v_actor, v_decision
      from jsonb_array_elements(v_snapshot) item;
    insert into public.work_team_links (obra_id, auth_user_id, linked_at, linked_by)
      values (p_work_id, v_target, v_now, v_actor);
    v_changed := true;
  end loop;

  for v_target in select l.auth_user_id from public.work_team_links l
    where l.obra_id = p_work_id and not (l.auth_user_id = any(p_user_ids))
    order by l.auth_user_id loop
    select * into v_account from public.access_accounts where auth_user_id = v_target;
    select * into v_request from public.access_requests where auth_user_id = v_target;
    select coalesce(jsonb_agg(jsonb_build_object('perfil', g.perfil, 'obra_id', p_work_id,
      'modulo', g.modulo, 'obra_nome', v_work_name) order by g.perfil, g.modulo), '[]'::jsonb)
      into v_snapshot from public.access_grants g join public.access_decisions d on d.id = g.decision_id
      where g.auth_user_id = v_target and g.obra_id = p_work_id and d.decision_type = 'VINCULO_OBRA';
    v_now := clock_timestamp();
    insert into public.access_decisions (
      id, auth_user_id, decision_type, perfil, perfis, atuacao_engenharia,
      atuacoes_engenharia, request_snapshot, grants_snapshot, reason,
      actor_auth_user_id, actor_snapshot, decided_at
    ) values (
      gen_random_uuid(), v_target, 'DESVINCULO_OBRA', v_account.perfil, v_account.perfis,
      v_account.atuacao_engenharia, v_account.atuacoes_engenharia,
      to_jsonb(v_request), v_snapshot, 'Desvínculo de equipe da obra ' || v_work_name,
      v_actor, v_actor_snapshot, v_now
    );
    delete from public.access_grants g using public.access_decisions d
      where g.decision_id = d.id and d.decision_type = 'VINCULO_OBRA'
        and g.auth_user_id = v_target and g.obra_id = p_work_id;
    delete from public.work_team_links l where l.obra_id = p_work_id and l.auth_user_id = v_target;
    v_changed := true;
  end loop;
  return v_changed;
end;
$function$;
revoke all on function dialogo_private.sync_work_team_links(uuid, uuid[])
  from public, anon, authenticated, service_role;

create function public.create_access_work_with_team(p_data jsonb, p_user_ids uuid[])
returns uuid language plpgsql security definer set search_path = '' as $function$
declare v_id uuid;
begin
  v_id := public.create_access_work_full(p_data);
  perform dialogo_private.sync_work_team_links(v_id, p_user_ids);
  return v_id;
end;
$function$;
revoke all on function public.create_access_work_with_team(jsonb, uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.create_access_work_with_team(jsonb, uuid[]) to authenticated;

create function public.update_access_work_with_team(
  p_work_id uuid, p_expected_revision integer, p_data jsonb, p_user_ids uuid[]
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_result jsonb; v_team_changed boolean;
begin
  v_result := public.update_access_work(p_work_id, p_expected_revision, p_data);
  v_team_changed := dialogo_private.sync_work_team_links(p_work_id, p_user_ids);
  return v_result || jsonb_build_object('team_changed', v_team_changed);
end;
$function$;
revoke all on function public.update_access_work_with_team(uuid, integer, jsonb, uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.update_access_work_with_team(uuid, integer, jsonb, uuid[]) to authenticated;

comment on table public.work_team_links is 'Active-account membership of a work. Access tuples added by membership are tracked in immutable access decisions and removed when membership ends.';
commit;

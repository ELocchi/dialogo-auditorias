-- B.3: profiles compose, but each technical permission retains its own exact
-- profile/work/module scope. This migration never expands existing access.
begin;

create function dialogo_private.canonical_access_profiles(p_perfis text[])
returns text[] language sql immutable strict set search_path = '' as $function$
  select coalesce(array_agg(p.perfil order by p.position), array[]::text[])
  from (values ('ADMINISTRATIVO', 1), ('AUDITOR_SEGURANCA', 2),
    ('AUDITOR_QUALIDADE', 3), ('ENGENHARIA', 4)) as p(perfil, position)
  where p.perfil = any(p_perfis);
$function$;
revoke all on function dialogo_private.canonical_access_profiles(text[])
  from public, anon, authenticated, service_role;

alter table public.access_accounts add column perfis text[];
update public.access_accounts set perfis = array[perfil];
alter table public.access_accounts alter column perfis set not null;
alter table public.access_accounts drop constraint access_accounts_engineering_check;
alter table public.access_accounts add constraint access_accounts_profiles_check check (
  cardinality(perfis) between 1 and 4
  and perfis = dialogo_private.canonical_access_profiles(perfis)
  and perfil = perfis[1]
);
alter table public.access_accounts add constraint access_accounts_engineering_check check (
  ('ENGENHARIA' = any(perfis) and atuacao_engenharia is not null
    and atuacao_engenharia in ('EQUIPE_OBRA', 'COORDENACAO'))
  or (not ('ENGENHARIA' = any(perfis)) and atuacao_engenharia is null)
);

-- Existing history is never updated: NULL perfis in legacy decisions means
-- ARRAY[perfil], and a legacy grant snapshot inherits that decision's perfil.
alter table public.access_decisions add column perfis text[];
alter table public.access_decisions add column before_access_snapshot jsonb;
alter table public.access_decisions drop constraint access_decisions_decision_type_check;
alter table public.access_decisions add constraint access_decisions_decision_type_check
  check (decision_type in ('BOOTSTRAP', 'APROVACAO', 'AJUSTE_PERFIS_INICIAL'));
alter table public.access_decisions add constraint access_decisions_profiles_check check (
  perfis is null or (cardinality(perfis) between 1 and 4
    and perfis = dialogo_private.canonical_access_profiles(perfis) and perfil = perfis[1])
);
alter table public.access_decisions add constraint access_decisions_before_snapshot_check
  check (before_access_snapshot is null or jsonb_typeof(before_access_snapshot) = 'object');
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
);
drop index public.access_decisions_one_initial_approval;
create unique index access_decisions_one_initial_approval
  on public.access_decisions (auth_user_id) where decision_type in ('BOOTSTRAP', 'APROVACAO');
create unique index access_decisions_one_initial_profiles_adjustment
  on public.access_decisions ((decision_type)) where decision_type = 'AJUSTE_PERFIS_INICIAL';

alter table public.access_grants add column perfil text;
alter table public.access_grants add column decision_id uuid
  references public.access_decisions(id) on delete restrict;
update public.access_grants g set perfil = a.perfil, decision_id = d.id
  from public.access_accounts a join public.access_decisions d
    on d.auth_user_id = a.auth_user_id and d.decision_type in ('BOOTSTRAP', 'APROVACAO')
  where g.auth_user_id = a.auth_user_id;
alter table public.access_grants alter column perfil set not null;
alter table public.access_grants alter column decision_id set not null;
alter table public.access_grants alter column granted_by drop not null;
alter table public.access_grants add constraint access_grants_profile_module_check check (
  (perfil = 'AUDITOR_SEGURANCA' and modulo = 'SEGURANCA')
  or (perfil = 'AUDITOR_QUALIDADE' and modulo = 'QUALIDADE')
  or (perfil = 'ENGENHARIA' and modulo in ('SEGURANCA', 'QUALIDADE'))
);
alter table public.access_grants drop constraint access_grants_pkey;
alter table public.access_grants add primary key (auth_user_id, perfil, obra_id, modulo);

create or replace function public.is_current_access_administrator()
returns boolean language sql stable security definer set search_path = '' as $function$
  select exists (
    select 1 from public.access_accounts a
    join auth.users u on u.id = a.auth_user_id
    join public.access_requests r on r.auth_user_id = a.auth_user_id
    where a.auth_user_id = (select auth.uid()) and a.ativo
      and 'ADMINISTRATIVO' = any(a.perfis) and u.email_confirmed_at is not null
      and r.status_acesso = 'APROVADO' and r.email = u.email
      and public.is_dialogo_corporate_email(u.email)
      and u.deleted_at is null and (u.banned_until is null or u.banned_until <= statement_timestamp())
  );
$function$;

create or replace function public.is_current_access_active()
returns boolean language sql stable security definer set search_path = '' as $function$
  select exists (
    select 1 from public.access_accounts a
    join auth.users u on u.id = a.auth_user_id
    join public.access_requests r on r.auth_user_id = a.auth_user_id
    where a.auth_user_id = (select auth.uid()) and a.ativo and cardinality(a.perfis) > 0
      and u.email_confirmed_at is not null and r.status_acesso = 'APROVADO' and r.email = u.email
      and public.is_dialogo_corporate_email(u.email)
      and u.deleted_at is null and (u.banned_until is null or u.banned_until <= statement_timestamp())
  );
$function$;

create function public.has_current_access_grant(p_perfil text, p_obra_id uuid, p_modulo text)
returns boolean language sql stable security definer set search_path = '' as $function$
  select exists (
    select 1 from public.access_grants g
    join public.access_accounts a on a.auth_user_id = g.auth_user_id
    join public.access_works w on w.id = g.obra_id
    join public.access_requests r on r.auth_user_id = a.auth_user_id
    join auth.users u on u.id = a.auth_user_id
    where a.auth_user_id = (select auth.uid()) and a.ativo and w.ativo
      and g.perfil = p_perfil and g.perfil = any(a.perfis)
      and g.obra_id = p_obra_id and g.modulo = p_modulo
      and u.email_confirmed_at is not null and r.status_acesso = 'APROVADO' and r.email = u.email
      and public.is_dialogo_corporate_email(u.email)
      and u.deleted_at is null and (u.banned_until is null or u.banned_until <= statement_timestamp())
  );
$function$;
revoke all on function public.has_current_access_grant(text, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.has_current_access_grant(text, uuid, text) to authenticated;

drop policy access_grants_select_own_or_admin on public.access_grants;
create policy access_grants_select_own_or_admin on public.access_grants
  for select to authenticated using (
    ((select auth.uid()) = auth_user_id and public.has_current_access_grant(perfil, obra_id, modulo))
    or (auth_user_id <> (select auth.uid()) and (select public.is_current_access_administrator()))
  );

create or replace function public.create_access_work(p_nome text)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  perform 1 from public.access_accounts a join auth.users u on u.id = a.auth_user_id
    join public.access_requests r on r.auth_user_id = a.auth_user_id
  where a.auth_user_id = v_actor and a.ativo and 'ADMINISTRATIVO' = any(a.perfis)
    and u.email_confirmed_at is not null and r.status_acesso = 'APROVADO' and r.email = u.email
    and public.is_dialogo_corporate_email(u.email)
    and u.deleted_at is null and (u.banned_until is null or u.banned_until <= statement_timestamp())
    for share of a, u, r;
  if not found then
    raise exception using errcode = '42501', message = 'active_administrator_required';
  end if;
  if p_nome is null or char_length(btrim(p_nome)) not between 2 and 160 then
    raise exception using errcode = '22023', message = 'invalid_work_name';
  end if;
  insert into public.access_works(nome, created_by) values (btrim(p_nome), v_actor)
  returning id into v_id;
  return v_id;
end;
$function$;

-- Remove the single-profile write path, including its authenticated grant.
drop function public.approve_access_request(uuid, text, text, jsonb, text);
create function public.approve_access_request_v2(
  p_auth_user_id uuid, p_perfis text[], p_atuacao_engenharia text,
  p_grants jsonb, p_reason text
)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  v_actor uuid := auth.uid();
  v_request public.access_requests%rowtype;
  v_target_email text;
  v_actor_snapshot jsonb;
  v_grants_snapshot jsonb := '[]'::jsonb;
  v_perfis text[] := dialogo_private.canonical_access_profiles(p_perfis);
  v_item jsonb;
  v_work uuid;
  v_work_name text;
  v_module text;
  v_profile text;
  v_seen text[] := array[]::text[];
  v_granted_profiles text[] := array[]::text[];
  v_tuple text;
  v_decision uuid := gen_random_uuid();
  v_now timestamptz;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'active_administrator_required';
  end if;
  if p_auth_user_id = v_actor then
    raise exception using errcode = '42501', message = 'self_approval_forbidden';
  end if;
  perform pg_advisory_xact_lock(704209130002::bigint);
  perform 1 from public.access_accounts a join auth.users u on u.id = a.auth_user_id
    join public.access_requests r on r.auth_user_id = a.auth_user_id
  where a.auth_user_id = v_actor and a.ativo and 'ADMINISTRATIVO' = any(a.perfis)
    and u.email_confirmed_at is not null and r.status_acesso = 'APROVADO' and r.email = u.email
    and public.is_dialogo_corporate_email(u.email)
    and u.deleted_at is null and (u.banned_until is null or u.banned_until <= statement_timestamp())
    for share of a, u, r;
  if not found then
    raise exception using errcode = '42501', message = 'active_administrator_required';
  end if;
  select jsonb_build_object('auth_user_id', r.auth_user_id, 'nome', r.nome, 'email', r.email)
    into v_actor_snapshot from public.access_requests r where r.auth_user_id = v_actor;

  if p_perfis is null or array_ndims(p_perfis) is distinct from 1
    or cardinality(v_perfis) not between 1 and 4
    or cardinality(p_perfis) <> cardinality(v_perfis) then
    raise exception using errcode = '22023', message = 'invalid_access_profiles';
  end if;
  if ('ENGENHARIA' = any(v_perfis) and
      (p_atuacao_engenharia is null or p_atuacao_engenharia not in ('EQUIPE_OBRA', 'COORDENACAO')))
    or (not ('ENGENHARIA' = any(v_perfis)) and p_atuacao_engenharia is not null) then
    raise exception using errcode = '22023', message = 'invalid_engineering_scope';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 10 and 1000 then
    raise exception using errcode = '22023', message = 'decision_reason_required';
  end if;
  if p_grants is null or jsonb_typeof(p_grants) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_access_grants';
  end if;
  if jsonb_array_length(p_grants) > 400
    or (v_perfis = array['ADMINISTRATIVO']::text[] and jsonb_array_length(p_grants) <> 0) then
    raise exception using errcode = '22023', message = 'invalid_access_grants';
  end if;

  select u.email into v_target_email from auth.users u where u.id = p_auth_user_id
    and u.email_confirmed_at is not null and u.deleted_at is null
    and public.is_dialogo_corporate_email(u.email)
    and (u.banned_until is null or u.banned_until <= statement_timestamp()) for share of u;
  if not found then
    raise exception using errcode = '22023', message = 'confirmed_pending_request_required';
  end if;
  select * into v_request from public.access_requests r
    where r.auth_user_id = p_auth_user_id for update;
  if not found or v_request.email is distinct from v_target_email
    or v_request.status_acesso <> 'PENDENTE_APROVACAO'
    or exists (select 1 from public.access_accounts a where a.auth_user_id = p_auth_user_id)
    or exists (select 1 from public.access_decisions d where d.auth_user_id = p_auth_user_id) then
    raise exception using errcode = '22023', message = 'confirmed_pending_request_required';
  end if;

  for v_item in select value from jsonb_array_elements(p_grants) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception using errcode = '22023', message = 'invalid_access_grants';
    end if;
    if (select count(*) from jsonb_object_keys(v_item)) <> 3
      or jsonb_typeof(v_item -> 'perfil') is distinct from 'string'
      or jsonb_typeof(v_item -> 'obra_id') is distinct from 'string'
      or jsonb_typeof(v_item -> 'modulo') is distinct from 'string' then
      raise exception using errcode = '22023', message = 'invalid_access_grants';
    end if;
    begin
      v_work := (v_item ->> 'obra_id')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'invalid_access_grants';
    end;
    v_profile := v_item ->> 'perfil';
    v_module := v_item ->> 'modulo';
    if not (v_profile = any(v_perfis)) or v_profile = 'ADMINISTRATIVO'
      or v_module not in ('SEGURANCA', 'QUALIDADE')
      or (v_profile = 'AUDITOR_SEGURANCA' and v_module <> 'SEGURANCA')
      or (v_profile = 'AUDITOR_QUALIDADE' and v_module <> 'QUALIDADE') then
      raise exception using errcode = '22023', message = 'profile_module_mismatch';
    end if;
    v_tuple := v_profile || '/' || v_work::text || '/' || v_module;
    if v_tuple = any(v_seen) then
      raise exception using errcode = '22023', message = 'duplicate_access_grant';
    end if;
    v_seen := array_append(v_seen, v_tuple);
    v_granted_profiles := array_append(v_granted_profiles, v_profile);
    select w.nome into v_work_name from public.access_works w
      where w.id = v_work and w.ativo for share of w;
    if not found then
      raise exception using errcode = '22023', message = 'active_work_required';
    end if;
    v_grants_snapshot := v_grants_snapshot || jsonb_build_array(jsonb_build_object(
      'perfil', v_profile, 'obra_id', v_work, 'modulo', v_module, 'obra_nome', v_work_name));
  end loop;
  if exists (select 1 from unnest(v_perfis) p(perfil)
    where p.perfil <> 'ADMINISTRATIVO' and not (p.perfil = any(v_granted_profiles))) then
    raise exception using errcode = '22023', message = 'technical_profile_grant_required';
  end if;

  v_now := clock_timestamp();
  insert into public.access_decisions (
    id, auth_user_id, decision_type, perfil, perfis, atuacao_engenharia, request_snapshot,
    grants_snapshot, reason, actor_auth_user_id, actor_snapshot, decided_at
  ) values (
    v_decision, p_auth_user_id, 'APROVACAO', v_perfis[1], v_perfis, p_atuacao_engenharia,
    to_jsonb(v_request), v_grants_snapshot, btrim(p_reason), v_actor, v_actor_snapshot, v_now
  );
  insert into public.access_accounts (
    auth_user_id, perfil, perfis, atuacao_engenharia, approved_at, approved_by
  ) values (p_auth_user_id, v_perfis[1], v_perfis, p_atuacao_engenharia, v_now, v_actor);
  insert into public.access_grants (auth_user_id, perfil, obra_id, modulo, granted_at, granted_by, decision_id)
    select p_auth_user_id, g.value ->> 'perfil', (g.value ->> 'obra_id')::uuid,
      g.value ->> 'modulo', v_now, v_actor, v_decision
    from jsonb_array_elements(v_grants_snapshot) g;
  update public.access_requests set status_acesso = 'APROVADO', updated_at = v_now
    where auth_user_id = p_auth_user_id;
  return v_decision;
end;
$function$;
revoke all on function public.approve_access_request_v2(uuid, text[], text, jsonb, text)
  from public, anon, authenticated, service_role;
grant execute on function public.approve_access_request_v2(uuid, text[], text, jsonb, text)
  to authenticated;

create function dialogo_private.configure_initial_account_profiles(
  p_expected_user_id uuid, p_expected_email text, p_work_ids uuid[], p_reason text
)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  v_request public.access_requests%rowtype;
  v_account public.access_accounts%rowtype;
  v_decision uuid := gen_random_uuid();
  v_now timestamptz;
  v_session_role text := current_setting('role', true);
  v_perfis text[] := array['ADMINISTRATIVO', 'AUDITOR_SEGURANCA', 'AUDITOR_QUALIDADE', 'ENGENHARIA'];
  v_before jsonb;
  v_grants_snapshot jsonb;
begin
  if session_user <> 'postgres' or coalesce(v_session_role, '') not in ('none', 'postgres') then
    raise exception using errcode = '42501', message = 'database_administrator_session_required';
  end if;
  if p_expected_user_id is distinct from '13044e3f-e8d2-4b4b-9981-22a8de22c610'::uuid
    or p_expected_email is distinct from 'emanuel.locchi@dialogo.com.br' then
    raise exception using errcode = '22023', message = 'designated_initial_identity_required';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 10 and 1000 then
    raise exception using errcode = '22023', message = 'deployment_reason_required';
  end if;
  if p_work_ids is null or array_ndims(p_work_ids) is distinct from 1
    or cardinality(p_work_ids) <> 21 or array_position(p_work_ids, null) is not null
    or (select count(distinct w) from unnest(p_work_ids) as t(w)) <> 21 then
    raise exception using errcode = '22023', message = 'exactly_21_explicit_works_required';
  end if;
  perform pg_advisory_xact_lock(704209130002::bigint);
  if exists (select 1 from public.access_decisions where decision_type = 'AJUSTE_PERFIS_INICIAL') then
    raise exception using errcode = '55000', message = 'initial_profiles_adjustment_already_closed';
  end if;
  perform 1 from auth.users u where u.id = p_expected_user_id
    and u.email = p_expected_email and u.email_confirmed_at is not null
    and u.deleted_at is null and (u.banned_until is null or u.banned_until <= statement_timestamp())
    for share of u;
  if not found then
    raise exception using errcode = '22023', message = 'confirmed_designated_identity_required';
  end if;
  select * into v_request from public.access_requests r
    where r.auth_user_id = p_expected_user_id for update;
  if not found or v_request.email is distinct from p_expected_email
    or v_request.status_acesso <> 'APROVADO' then
    raise exception using errcode = '22023', message = 'existing_bootstrap_account_required';
  end if;
  select * into v_account from public.access_accounts a
    where a.auth_user_id = p_expected_user_id for update;
  if not found or not v_account.ativo or v_account.perfis <> array['ADMINISTRATIVO']::text[]
    or v_account.atuacao_engenharia is not null
    or v_account.approved_by is not null
    or exists (select 1 from public.access_grants g where g.auth_user_id = p_expected_user_id)
    or not exists (select 1 from public.access_decisions d
      where d.auth_user_id = p_expected_user_id and d.decision_type = 'BOOTSTRAP'
        and d.decided_at = v_account.approved_at and d.actor_database_role = 'postgres'
        and d.perfil = 'ADMINISTRATIVO' and d.grants_snapshot = '[]'::jsonb) then
    raise exception using errcode = '22023', message = 'unchanged_initial_administrator_required';
  end if;
  -- The caller supplies the reviewed IDs. No future or unselected work is
  -- included; all selected rows are locked through the atomic decision.
  perform 1 from public.access_works w where w.id = any(p_work_ids) and w.ativo
    order by w.id for share of w;
  if (select count(*) from public.access_works w where w.id = any(p_work_ids) and w.ativo) <> 21 then
    raise exception using errcode = '22023', message = 'active_work_required';
  end if;
  select jsonb_build_object('account', to_jsonb(v_account), 'grants',
    coalesce((select jsonb_agg(to_jsonb(g) order by g.perfil, g.obra_id, g.modulo)
      from public.access_grants g where g.auth_user_id = p_expected_user_id), '[]'::jsonb))
    into v_before;
  select jsonb_agg(jsonb_build_object('perfil', p.perfil, 'obra_id', w.id,
    'modulo', p.modulo, 'obra_nome', w.nome) order by p.position, w.id)
    into v_grants_snapshot
    from public.access_works w cross join (values
      ('AUDITOR_SEGURANCA', 'SEGURANCA', 1), ('AUDITOR_QUALIDADE', 'QUALIDADE', 2),
      ('ENGENHARIA', 'SEGURANCA', 3), ('ENGENHARIA', 'QUALIDADE', 4)) p(perfil, modulo, position)
    where w.id = any(p_work_ids) and w.ativo;
  v_now := clock_timestamp();
  insert into public.access_decisions (
    id, auth_user_id, decision_type, perfil, perfis, atuacao_engenharia,
    request_snapshot, grants_snapshot, before_access_snapshot, reason,
    actor_database_role, actor_snapshot, decided_at
  ) values (
    v_decision, p_expected_user_id, 'AJUSTE_PERFIS_INICIAL', v_perfis[1], v_perfis,
    'COORDENACAO', to_jsonb(v_request), v_grants_snapshot, v_before, btrim(p_reason),
    session_user, jsonb_build_object('database_session_user', session_user,
      'database_role', v_session_role, 'application_name', current_setting('application_name', true)), v_now
  );
  update public.access_accounts set perfil = v_perfis[1], perfis = v_perfis,
    atuacao_engenharia = 'COORDENACAO' where auth_user_id = p_expected_user_id;
  insert into public.access_grants (auth_user_id, perfil, obra_id, modulo, granted_at, granted_by, decision_id)
    select p_expected_user_id, g.value ->> 'perfil', (g.value ->> 'obra_id')::uuid,
      g.value ->> 'modulo', v_now, null, v_decision from jsonb_array_elements(v_grants_snapshot) g;
  -- Original approved_at/by, request fields, Auth data and BOOTSTRAP are intact.
  return v_decision;
end;
$function$;
revoke all on function dialogo_private.configure_initial_account_profiles(uuid, text, uuid[], text)
  from public, anon, authenticated, service_role;
grant execute on function dialogo_private.configure_initial_account_profiles(uuid, text, uuid[], text)
  to postgres;

-- Keep the original controlled bootstrap compatible with a fresh database.
-- An existing BOOTSTRAP marker still closes it permanently, even after this
-- migration or after subsequent changes to administrative profiles.
create or replace function dialogo_private.bootstrap_first_administrator(
  p_expected_user_id uuid, p_expected_email text, p_reason text
)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  v_request public.access_requests%rowtype;
  v_decision uuid := gen_random_uuid();
  v_now timestamptz;
  v_session_role text := current_setting('role', true);
begin
  if session_user <> 'postgres' or coalesce(v_session_role, '') not in ('none', 'postgres') then
    raise exception using errcode = '42501', message = 'database_administrator_session_required';
  end if;
  if p_expected_user_id is distinct from '13044e3f-e8d2-4b4b-9981-22a8de22c610'::uuid
    or p_expected_email is distinct from 'emanuel.locchi@dialogo.com.br' then
    raise exception using errcode = '22023', message = 'designated_bootstrap_identity_required';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 10 and 1000 then
    raise exception using errcode = '22023', message = 'deployment_reason_required';
  end if;
  perform pg_advisory_xact_lock(704209130002::bigint);
  if exists (select 1 from public.access_decisions where decision_type = 'BOOTSTRAP')
    or exists (select 1 from public.access_accounts where 'ADMINISTRATIVO' = any(perfis)) then
    raise exception using errcode = '55000', message = 'bootstrap_already_closed';
  end if;
  perform 1 from auth.users u where u.id = p_expected_user_id
    and u.email = p_expected_email and u.email_confirmed_at is not null
    and u.deleted_at is null and (u.banned_until is null or u.banned_until <= statement_timestamp())
    for share of u;
  if not found then
    raise exception using errcode = '22023', message = 'confirmed_designated_identity_required';
  end if;
  select * into v_request from public.access_requests r
    where r.auth_user_id = p_expected_user_id for update;
  if not found or v_request.email is distinct from p_expected_email
    or v_request.status_acesso <> 'PENDENTE_APROVACAO'
    or exists (select 1 from public.access_accounts a where a.auth_user_id = p_expected_user_id)
    or exists (select 1 from public.access_decisions d where d.auth_user_id = p_expected_user_id) then
    raise exception using errcode = '22023', message = 'existing_pending_request_required';
  end if;
  v_now := clock_timestamp();
  insert into public.access_decisions (
    id, auth_user_id, decision_type, perfil, perfis, request_snapshot, grants_snapshot,
    reason, actor_database_role, actor_snapshot, decided_at
  ) values (
    v_decision, p_expected_user_id, 'BOOTSTRAP', 'ADMINISTRATIVO', array['ADMINISTRATIVO']::text[],
    to_jsonb(v_request), '[]', btrim(p_reason), session_user, jsonb_build_object(
      'database_session_user', session_user, 'database_role', v_session_role,
      'application_name', current_setting('application_name', true)), v_now
  );
  insert into public.access_accounts (auth_user_id, perfil, perfis, approved_at, approved_by)
    values (p_expected_user_id, 'ADMINISTRATIVO', array['ADMINISTRATIVO']::text[], v_now, null);
  update public.access_requests set status_acesso = 'APROVADO', updated_at = v_now
    where auth_user_id = p_expected_user_id;
  return v_decision;
end;
$function$;
revoke all on function dialogo_private.bootstrap_first_administrator(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function dialogo_private.bootstrap_first_administrator(uuid, text, text) to postgres;

create or replace function public.access_administration_schema_version()
returns integer language sql stable security invoker set search_path = '' as $function$
  select 2;
$function$;

comment on column public.access_accounts.perfil is 'Legacy primary display profile only; authorization uses perfis and exact access_grants tuples.';
comment on column public.access_accounts.perfis is 'Canonical selected profiles; administrative authority never supplies technical scope.';
comment on table public.access_grants is 'Exact profile/work/module permission tuples, each linked to the immutable decision that created it.';
comment on table public.access_decisions is 'Append-only access decisions; legacy NULL perfis inherits ARRAY[perfil]. Existing snapshots must never be rewritten.';
comment on column public.access_decisions.before_access_snapshot is 'Account and grants before the separately authorized initial profile adjustment; NULL for original decisions.';
comment on function public.has_current_access_grant(text, uuid, text) is 'Exact technical authorization predicate for server checks and operational RLS; no implied admin, module, profile or work permissions.';
comment on function dialogo_private.configure_initial_account_profiles(uuid, text, uuid[], text) is 'One-time postgres session operation for the existing designated bootstrap identity and 21 explicit authorized work IDs; never an API RPC.';

commit;

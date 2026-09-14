-- B.2: approval is an explicit, atomic server decision. No existing account is
-- promoted by this migration. Execute the separate controlled bootstrap only
-- after checking the existing Auth UUID and confirmed designated email.
begin;

create schema if not exists dialogo_private authorization postgres;
revoke all on schema dialogo_private from public, anon, authenticated, service_role;

alter table public.access_requests
  drop constraint access_requests_status_acesso_check;
alter table public.access_requests
  add constraint access_requests_status_acesso_check
  check (status_acesso in ('PENDENTE_APROVACAO', 'APROVADO'));
comment on column public.access_requests.status_acesso is
  'Sign-up always starts pending. Only a protected decision creates approved access.';

create table public.access_accounts (
  auth_user_id uuid primary key references public.access_requests(auth_user_id) on delete restrict,
  perfil text not null check (perfil in ('ADMINISTRATIVO', 'AUDITOR_SEGURANCA', 'AUDITOR_QUALIDADE', 'ENGENHARIA')),
  atuacao_engenharia text,
  ativo boolean not null default true,
  approved_at timestamptz not null,
  approved_by uuid references auth.users(id) on delete restrict,
  constraint access_accounts_engineering_check check (
    (perfil = 'ENGENHARIA' and atuacao_engenharia is not null and atuacao_engenharia in ('EQUIPE_OBRA', 'COORDENACAO'))
    or (perfil <> 'ENGENHARIA' and atuacao_engenharia is null)
  )
);

create table public.access_works (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (nome = btrim(nome) and char_length(nome) between 2 and 160),
  ativo boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid not null references auth.users(id) on delete restrict
);
create unique index access_works_name_unique on public.access_works (lower(nome));

create table public.access_grants (
  auth_user_id uuid not null references public.access_accounts(auth_user_id) on delete restrict,
  obra_id uuid not null references public.access_works(id) on delete restrict,
  modulo text not null check (modulo in ('SEGURANCA', 'QUALIDADE')),
  granted_at timestamptz not null,
  granted_by uuid not null references auth.users(id) on delete restrict,
  primary key (auth_user_id, obra_id, modulo)
);

create table public.access_decisions (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references public.access_requests(auth_user_id) on delete restrict,
  decision_type text not null check (decision_type in ('BOOTSTRAP', 'APROVACAO')),
  perfil text not null,
  atuacao_engenharia text,
  request_snapshot jsonb not null check (jsonb_typeof(request_snapshot) = 'object'),
  grants_snapshot jsonb not null check (jsonb_typeof(grants_snapshot) = 'array'),
  reason text not null check (char_length(btrim(reason)) between 10 and 1000),
  actor_auth_user_id uuid references auth.users(id) on delete restrict,
  actor_database_role text,
  actor_snapshot jsonb not null check (jsonb_typeof(actor_snapshot) = 'object'),
  decided_at timestamptz not null,
  constraint access_decisions_actor_check check (
    (decision_type = 'BOOTSTRAP' and actor_auth_user_id is null
      and actor_database_role = 'postgres' and perfil = 'ADMINISTRATIVO'
      and atuacao_engenharia is null and grants_snapshot = '[]'::jsonb)
    or (decision_type = 'APROVACAO' and actor_auth_user_id is not null
      and actor_auth_user_id <> auth_user_id and actor_database_role is null)
  )
);
-- This marker survives subsequent revocation. Zero currently active admins
-- never makes the one-time deployment exception available again.
create unique index access_decisions_one_bootstrap
  on public.access_decisions ((decision_type)) where decision_type = 'BOOTSTRAP';
create unique index access_decisions_one_initial_approval
  on public.access_decisions (auth_user_id);
create index access_decisions_recent on public.access_decisions (decided_at desc);

create function dialogo_private.reject_access_decision_mutation()
returns trigger language plpgsql set search_path = '' as $function$
begin
  raise exception using errcode = '55000', message = 'access_history_is_immutable';
end;
$function$;
revoke all on function dialogo_private.reject_access_decision_mutation()
  from public, anon, authenticated, service_role;
create trigger access_decisions_immutable
before update or delete on public.access_decisions
for each row execute function dialogo_private.reject_access_decision_mutation();
create trigger access_decisions_no_truncate
before truncate on public.access_decisions
for each statement execute function dialogo_private.reject_access_decision_mutation();

alter table public.access_accounts enable row level security;
alter table public.access_works enable row level security;
alter table public.access_grants enable row level security;
alter table public.access_decisions enable row level security;
revoke all on table public.access_requests, public.access_accounts,
  public.access_works, public.access_grants, public.access_decisions
  from public, anon, authenticated, service_role;
grant select on table public.access_requests, public.access_accounts,
  public.access_works, public.access_grants, public.access_decisions to authenticated;

create function public.is_current_access_administrator()
returns boolean language sql stable security definer set search_path = '' as $function$
  select exists (
    select 1 from public.access_accounts a
    join auth.users u on u.id = a.auth_user_id
    join public.access_requests r on r.auth_user_id = a.auth_user_id
    where a.auth_user_id = (select auth.uid()) and a.ativo
      and a.perfil = 'ADMINISTRATIVO' and u.email_confirmed_at is not null
      and r.status_acesso = 'APROVADO' and r.email = u.email
      and public.is_dialogo_corporate_email(u.email)
      and u.deleted_at is null and (u.banned_until is null or u.banned_until <= statement_timestamp())
  );
$function$;

create function public.is_current_access_active()
returns boolean language sql stable security definer set search_path = '' as $function$
  select exists (
    select 1 from public.access_accounts a
    join auth.users u on u.id = a.auth_user_id
    join public.access_requests r on r.auth_user_id = a.auth_user_id
    where a.auth_user_id = (select auth.uid()) and a.ativo
      and u.email_confirmed_at is not null and r.status_acesso = 'APROVADO' and r.email = u.email
      and public.is_dialogo_corporate_email(u.email)
      and u.deleted_at is null and (u.banned_until is null or u.banned_until <= statement_timestamp())
  );
$function$;

create function public.can_read_pending_access_request(p_auth_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select public.is_current_access_administrator() and exists (
    select 1 from public.access_requests r join auth.users u on u.id = r.auth_user_id
    where r.auth_user_id = p_auth_user_id
      and r.status_acesso = 'PENDENTE_APROVACAO' and u.email_confirmed_at is not null
      and r.email = u.email and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= statement_timestamp())
  );
$function$;

revoke all on function public.is_current_access_administrator(),
  public.is_current_access_active(), public.can_read_pending_access_request(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.is_current_access_administrator(),
  public.is_current_access_active(), public.can_read_pending_access_request(uuid)
  to authenticated;

create policy access_requests_select_admin_pending on public.access_requests
  for select to authenticated using (public.can_read_pending_access_request(auth_user_id));
create policy access_accounts_select_own_or_admin on public.access_accounts
  for select to authenticated using (
    (select auth.uid()) = auth_user_id or (select public.is_current_access_administrator())
  );
create policy access_grants_select_own_or_admin on public.access_grants
  for select to authenticated using (
    ((select auth.uid()) = auth_user_id and (select public.is_current_access_active()))
    or (select public.is_current_access_administrator())
  );
create policy access_works_select_authorized on public.access_works
  for select to authenticated using (
    (select public.is_current_access_administrator()) or (
      ativo and (select public.is_current_access_active()) and exists (
        select 1 from public.access_grants g
        where g.obra_id = access_works.id and g.auth_user_id = (select auth.uid())
      )
    )
  );
create policy access_decisions_select_admin on public.access_decisions
  for select to authenticated using ((select public.is_current_access_administrator()));

create function public.create_access_work(p_nome text)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  -- A row lock makes a concurrent account deactivation/confirmation change
  -- serialize with this decision; JWT metadata never supplies authority.
  perform 1 from public.access_accounts a join auth.users u on u.id = a.auth_user_id
    join public.access_requests r on r.auth_user_id = a.auth_user_id
  where a.auth_user_id = v_actor and a.ativo and a.perfil = 'ADMINISTRATIVO'
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

create function public.approve_access_request(
  p_auth_user_id uuid, p_perfil text, p_atuacao_engenharia text,
  p_grants jsonb, p_reason text
)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  v_actor uuid := auth.uid();
  v_request public.access_requests%rowtype;
  v_target_email text;
  v_actor_snapshot jsonb;
  v_grants_snapshot jsonb := '[]'::jsonb;
  v_item jsonb;
  v_work uuid;
  v_work_name text;
  v_module text;
  v_seen text[] := array[]::text[];
  v_pair text;
  v_decision uuid := gen_random_uuid();
  v_now timestamptz;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'active_administrator_required';
  end if;
  if p_auth_user_id = v_actor then
    raise exception using errcode = '42501', message = 'self_approval_forbidden';
  end if;
  -- A single lock orders bootstrap/approvals; row locks also synchronize with
  -- database-authorized revocation. All locks last through transaction commit.
  perform pg_advisory_xact_lock(704209130002::bigint);
  perform 1 from public.access_accounts a join auth.users u on u.id = a.auth_user_id
    join public.access_requests r on r.auth_user_id = a.auth_user_id
  where a.auth_user_id = v_actor and a.ativo and a.perfil = 'ADMINISTRATIVO'
    and u.email_confirmed_at is not null and r.status_acesso = 'APROVADO' and r.email = u.email
    and public.is_dialogo_corporate_email(u.email)
    and u.deleted_at is null and (u.banned_until is null or u.banned_until <= statement_timestamp())
    for share of a, u, r;
  if not found then
    raise exception using errcode = '42501', message = 'active_administrator_required';
  end if;
  select jsonb_build_object('auth_user_id', r.auth_user_id, 'nome', r.nome, 'email', r.email)
    into v_actor_snapshot from public.access_requests r where r.auth_user_id = v_actor;

  if p_perfil is null or p_perfil not in
    ('ADMINISTRATIVO', 'AUDITOR_SEGURANCA', 'AUDITOR_QUALIDADE', 'ENGENHARIA') then
    raise exception using errcode = '22023', message = 'invalid_access_profile';
  end if;
  if (p_perfil = 'ENGENHARIA' and
      (p_atuacao_engenharia is null or p_atuacao_engenharia not in ('EQUIPE_OBRA', 'COORDENACAO')))
    or (p_perfil <> 'ENGENHARIA' and p_atuacao_engenharia is not null) then
    raise exception using errcode = '22023', message = 'invalid_engineering_scope';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 10 and 1000 then
    raise exception using errcode = '22023', message = 'decision_reason_required';
  end if;
  if p_grants is null or jsonb_typeof(p_grants) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_access_grants';
  end if;
  if jsonb_array_length(p_grants) > 100
    or (p_perfil = 'ADMINISTRATIVO' and jsonb_array_length(p_grants) <> 0)
    or (p_perfil <> 'ADMINISTRATIVO' and jsonb_array_length(p_grants) = 0) then
    raise exception using errcode = '22023', message = 'invalid_access_grants';
  end if;

  -- Lock the verified Auth identity before the request, matching the Auth
  -- confirmation trigger's lock order and preventing a confirmation race.
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
    if (select count(*) from jsonb_object_keys(v_item)) <> 2
      or jsonb_typeof(v_item -> 'obra_id') is distinct from 'string'
      or jsonb_typeof(v_item -> 'modulo') is distinct from 'string' then
      raise exception using errcode = '22023', message = 'invalid_access_grants';
    end if;
    begin
      v_work := (v_item ->> 'obra_id')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'invalid_access_grants';
    end;
    v_module := v_item ->> 'modulo';
    if v_module not in ('SEGURANCA', 'QUALIDADE')
      or (p_perfil = 'AUDITOR_SEGURANCA' and v_module <> 'SEGURANCA')
      or (p_perfil = 'AUDITOR_QUALIDADE' and v_module <> 'QUALIDADE') then
      raise exception using errcode = '22023', message = 'profile_module_mismatch';
    end if;
    v_pair := v_work::text || '/' || v_module;
    if v_pair = any(v_seen) then
      raise exception using errcode = '22023', message = 'duplicate_access_grant';
    end if;
    v_seen := array_append(v_seen, v_pair);
    select w.nome into v_work_name from public.access_works w
      where w.id = v_work and w.ativo for share of w;
    if not found then
      raise exception using errcode = '22023', message = 'active_work_required';
    end if;
    v_grants_snapshot := v_grants_snapshot || jsonb_build_array(jsonb_build_object(
      'obra_id', v_work, 'modulo', v_module, 'obra_nome', v_work_name));
  end loop;

  v_now := clock_timestamp();
  insert into public.access_decisions (
    id, auth_user_id, decision_type, perfil, atuacao_engenharia, request_snapshot,
    grants_snapshot, reason, actor_auth_user_id, actor_snapshot, decided_at
  ) values (
    v_decision, p_auth_user_id, 'APROVACAO', p_perfil, p_atuacao_engenharia,
    to_jsonb(v_request), v_grants_snapshot, btrim(p_reason), v_actor, v_actor_snapshot, v_now
  );
  insert into public.access_accounts (
    auth_user_id, perfil, atuacao_engenharia, approved_at, approved_by
  ) values (p_auth_user_id, p_perfil, p_atuacao_engenharia, v_now, v_actor);
  insert into public.access_grants (auth_user_id, obra_id, modulo, granted_at, granted_by)
    select p_auth_user_id, (g.value ->> 'obra_id')::uuid, g.value ->> 'modulo', v_now, v_actor
    from jsonb_array_elements(v_grants_snapshot) g;
  update public.access_requests set status_acesso = 'APROVADO', updated_at = v_now
    where auth_user_id = p_auth_user_id;
  return v_decision;
end;
$function$;

create function dialogo_private.bootstrap_first_administrator(
  p_expected_user_id uuid, p_expected_email text, p_reason text
)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  v_request public.access_requests%rowtype;
  v_decision uuid := gen_random_uuid();
  v_now timestamptz;
  v_session_role text := current_setting('role', true);
begin
  -- current_user alone is unsafe in SECURITY DEFINER: it identifies the
  -- function owner, not the caller. PostgREST sessions are authenticator and
  -- SET ROLE API calls are refused even if initiated by a postgres session.
  if session_user <> 'postgres' or coalesce(v_session_role, '') not in ('none', 'postgres') then
    raise exception using errcode = '42501', message = 'database_administrator_session_required';
  end if;
  if p_expected_user_id is null or p_expected_email is distinct from 'emanuel.locchi@dialogo.com.br' then
    raise exception using errcode = '22023', message = 'designated_bootstrap_identity_required';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 10 and 1000 then
    raise exception using errcode = '22023', message = 'deployment_reason_required';
  end if;
  perform pg_advisory_xact_lock(704209130002::bigint);
  if exists (select 1 from public.access_decisions where decision_type = 'BOOTSTRAP')
    or exists (select 1 from public.access_accounts where perfil = 'ADMINISTRATIVO') then
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
  if not found or v_request.email <> p_expected_email
    or v_request.status_acesso <> 'PENDENTE_APROVACAO'
    or exists (select 1 from public.access_accounts a where a.auth_user_id = p_expected_user_id)
    or exists (select 1 from public.access_decisions d where d.auth_user_id = p_expected_user_id) then
    raise exception using errcode = '22023', message = 'existing_pending_request_required';
  end if;
  v_now := clock_timestamp();
  insert into public.access_decisions (
    id, auth_user_id, decision_type, perfil, request_snapshot, grants_snapshot,
    reason, actor_database_role, actor_snapshot, decided_at
  ) values (
    v_decision, p_expected_user_id, 'BOOTSTRAP', 'ADMINISTRATIVO', to_jsonb(v_request), '[]',
    btrim(p_reason), session_user, jsonb_build_object(
      'database_session_user', session_user, 'database_role', v_session_role,
      'application_name', current_setting('application_name', true)), v_now
  );
  insert into public.access_accounts (auth_user_id, perfil, approved_at, approved_by)
    values (p_expected_user_id, 'ADMINISTRATIVO', v_now, null);
  update public.access_requests set status_acesso = 'APROVADO', updated_at = v_now
    where auth_user_id = p_expected_user_id;
  return v_decision;
end;
$function$;

revoke all on function public.create_access_work(text),
  public.approve_access_request(uuid, text, text, jsonb, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_access_work(text),
  public.approve_access_request(uuid, text, text, jsonb, text) to authenticated;
revoke all on function dialogo_private.bootstrap_first_administrator(uuid, text, text)
  from public, anon, authenticated, service_role;
grant usage on schema dialogo_private to postgres;
grant execute on function dialogo_private.bootstrap_first_administrator(uuid, text, text) to postgres;

create function public.access_administration_schema_version()
returns integer language sql stable security invoker set search_path = '' as $function$
  select 1;
$function$;
revoke all on function public.access_administration_schema_version() from public, anon, authenticated, service_role;
grant execute on function public.access_administration_schema_version() to anon, authenticated;

comment on table public.access_accounts is 'Approved account state; independent of untrusted declared request data.';
comment on table public.access_grants is 'Exact work/module tuples; never infer a Cartesian product or all-work admin access.';
comment on table public.access_decisions is 'Append-only initial access decisions with original request and exact granted scope snapshots.';
comment on function dialogo_private.bootstrap_first_administrator(uuid, text, text) is
  'One-time deployment action for a verified existing designated identity; reason must identify responsible operator and authorization. Not an API RPC.';

commit;


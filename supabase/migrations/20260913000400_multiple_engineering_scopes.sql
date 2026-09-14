-- B.4: engineering activities compose within the already granted Engineering
-- profile/work/module tuples. Migration backfill never adds a new activity.
begin;

create function dialogo_private.canonical_engineering_scopes(p_scopes text[])
returns text[] language sql immutable strict set search_path = '' as $function$
  select coalesce(array_agg(s.scope order by s.position), array[]::text[])
  from (values ('EQUIPE_OBRA', 1), ('COORDENACAO', 2)) as s(scope, position)
  where s.scope = any(p_scopes);
$function$;
revoke all on function dialogo_private.canonical_engineering_scopes(text[])
  from public, anon, authenticated, service_role;

alter table public.access_accounts add column atuacoes_engenharia text[];
update public.access_accounts set atuacoes_engenharia = case
  when atuacao_engenharia is null then array[]::text[] else array[atuacao_engenharia] end;
alter table public.access_accounts alter column atuacoes_engenharia set not null;
alter table public.access_accounts add constraint access_accounts_engineering_scopes_check check (
  atuacoes_engenharia = dialogo_private.canonical_engineering_scopes(atuacoes_engenharia)
  and (('ENGENHARIA' = any(perfis) and cardinality(atuacoes_engenharia) between 1 and 2
      and atuacao_engenharia = any(atuacoes_engenharia))
    or (not ('ENGENHARIA' = any(perfis)) and atuacao_engenharia is null
      and atuacoes_engenharia = array[]::text[]))
);

-- V2 approvals and the controlled bootstrap retain their original arguments.
-- Inserts omitting the new column receive only the explicitly chosen legacy
-- activity. A legacy update can follow its previous singleton/empty value;
-- it never collapses or expands an existing multiple-activity selection.
create function dialogo_private.fill_legacy_engineering_scopes()
returns trigger language plpgsql set search_path = '' as $function$
begin
  if tg_op = 'INSERT' then
    if new.atuacoes_engenharia is null then
      new.atuacoes_engenharia := case when new.atuacao_engenharia is null
        then array[]::text[] else array[new.atuacao_engenharia] end;
    end if;
  elsif new.atuacoes_engenharia is not distinct from old.atuacoes_engenharia
    and new.atuacao_engenharia is distinct from old.atuacao_engenharia
    and old.atuacoes_engenharia = (case when old.atuacao_engenharia is null
      then array[]::text[] else array[old.atuacao_engenharia] end) then
    new.atuacoes_engenharia := case when new.atuacao_engenharia is null
      then array[]::text[] else array[new.atuacao_engenharia] end;
  end if;
  return new;
end;
$function$;
revoke all on function dialogo_private.fill_legacy_engineering_scopes()
  from public, anon, authenticated, service_role;
create trigger access_accounts_fill_legacy_engineering_scopes
  before insert or update on public.access_accounts
  for each row execute function dialogo_private.fill_legacy_engineering_scopes();

-- Do not backfill decisions. NULL retains the exact original historical
-- meaning: no Engineering activity, or the legacy singleton value.
alter table public.access_decisions add column atuacoes_engenharia text[];
alter table public.access_decisions add constraint access_decisions_engineering_scopes_check check (
  atuacoes_engenharia is null or (
    atuacoes_engenharia = dialogo_private.canonical_engineering_scopes(atuacoes_engenharia)
    and (('ENGENHARIA' = any(coalesce(perfis, array[perfil]))
        and cardinality(atuacoes_engenharia) between 1 and 2
        and atuacao_engenharia is not null and atuacao_engenharia = any(atuacoes_engenharia))
      or (not ('ENGENHARIA' = any(coalesce(perfis, array[perfil])))
        and atuacao_engenharia is null and atuacoes_engenharia = array[]::text[]))
  )
);
alter table public.access_decisions drop constraint access_decisions_decision_type_check;
alter table public.access_decisions add constraint access_decisions_decision_type_check
  check (decision_type in ('BOOTSTRAP', 'APROVACAO', 'AJUSTE_PERFIS_INICIAL', 'AJUSTE_ATUACAO_INICIAL'));
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
);
create unique index access_decisions_one_initial_engineering_adjustment
  on public.access_decisions ((decision_type)) where decision_type = 'AJUSTE_ATUACAO_INICIAL';

create function public.has_current_engineering_scope(p_scope text, p_obra_id uuid, p_modulo text)
returns boolean language sql stable security definer set search_path = '' as $function$
  select exists (
    select 1 from public.access_accounts a
    where a.auth_user_id = (select auth.uid()) and a.ativo
      and 'ENGENHARIA' = any(a.perfis) and p_scope in ('EQUIPE_OBRA', 'COORDENACAO')
      and p_scope = any(a.atuacoes_engenharia)
      and public.has_current_access_grant('ENGENHARIA', p_obra_id, p_modulo)
  );
$function$;
revoke all on function public.has_current_engineering_scope(text, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.has_current_engineering_scope(text, uuid, text) to authenticated;

create function dialogo_private.configure_initial_engineering_scopes(
  p_expected_user_id uuid, p_expected_email text, p_work_ids uuid[], p_reason text
)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  v_request public.access_requests%rowtype;
  v_account public.access_accounts%rowtype;
  v_previous public.access_decisions%rowtype;
  v_decision uuid := gen_random_uuid();
  v_now timestamptz;
  v_session_role text := current_setting('role', true);
  v_before jsonb;
  v_grants_snapshot jsonb;
  v_expected_tuples jsonb;
  v_previous_tuples jsonb;
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
  if exists (select 1 from public.access_decisions where decision_type = 'AJUSTE_ATUACAO_INICIAL') then
    raise exception using errcode = '55000', message = 'initial_engineering_adjustment_already_closed';
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
  if not found or not v_account.ativo or v_account.perfil <> 'ADMINISTRATIVO'
    or v_account.perfis <> array['ADMINISTRATIVO', 'AUDITOR_SEGURANCA', 'AUDITOR_QUALIDADE', 'ENGENHARIA']::text[]
    or v_account.atuacao_engenharia is distinct from 'COORDENACAO'
    or v_account.atuacoes_engenharia is distinct from array['COORDENACAO']::text[]
    or v_account.approved_by is not null
    or not exists (select 1 from public.access_decisions d where d.auth_user_id = p_expected_user_id
      and d.decision_type = 'BOOTSTRAP' and d.decided_at = v_account.approved_at
      and d.actor_database_role = 'postgres' and d.perfil = 'ADMINISTRATIVO'
      and d.grants_snapshot = '[]'::jsonb) then
    raise exception using errcode = '22023', message = 'unchanged_initial_coordination_account_required';
  end if;
  select * into v_previous from public.access_decisions d
    where d.auth_user_id = p_expected_user_id and d.decision_type = 'AJUSTE_PERFIS_INICIAL';
  if not found or v_previous.atuacao_engenharia is distinct from 'COORDENACAO'
    or v_previous.perfis is distinct from v_account.perfis
    or v_previous.actor_database_role is distinct from 'postgres' then
    raise exception using errcode = '22023', message = 'initial_profiles_decision_required';
  end if;

  perform 1 from public.access_works w where w.id = any(p_work_ids) and w.ativo
    order by w.id for share of w;
  if (select count(*) from public.access_works w where w.id = any(p_work_ids) and w.ativo) <> 21 then
    raise exception using errcode = '22023', message = 'active_work_required';
  end if;
  perform 1 from public.access_grants g where g.auth_user_id = p_expected_user_id
    order by g.perfil, g.obra_id, g.modulo for share of g;
  if (select count(*) from public.access_grants g where g.auth_user_id = p_expected_user_id) <> 84
    or exists (select 1 from public.access_grants g where g.auth_user_id = p_expected_user_id
      and (not (g.obra_id = any(p_work_ids)) or g.decision_id <> v_previous.id
        or g.granted_by is not null or g.granted_at <> v_previous.decided_at)) then
    raise exception using errcode = '22023', message = 'unchanged_initial_grants_required';
  end if;
  select jsonb_agg(jsonb_build_object('perfil', p.perfil, 'obra_id', w.id, 'modulo', p.modulo)
    order by p.perfil, w.id, p.modulo) into v_expected_tuples
  from unnest(p_work_ids) w(id) cross join (values
    ('AUDITOR_SEGURANCA', 'SEGURANCA'), ('AUDITOR_QUALIDADE', 'QUALIDADE'),
    ('ENGENHARIA', 'SEGURANCA'), ('ENGENHARIA', 'QUALIDADE')) p(perfil, modulo);
  select jsonb_agg(g.value - 'obra_nome' order by g.value ->> 'perfil',
    (g.value ->> 'obra_id')::uuid, g.value ->> 'modulo') into v_previous_tuples
  from jsonb_array_elements(v_previous.grants_snapshot) g;
  if v_previous_tuples is distinct from v_expected_tuples
    or (select jsonb_agg(jsonb_build_object('perfil', g.perfil, 'obra_id', g.obra_id, 'modulo', g.modulo)
      order by g.perfil, g.obra_id, g.modulo) from public.access_grants g
      where g.auth_user_id = p_expected_user_id) is distinct from v_expected_tuples then
    raise exception using errcode = '22023', message = 'same_21_initial_work_scopes_required';
  end if;
  select jsonb_build_object('account', to_jsonb(v_account), 'grants',
    (select jsonb_agg(to_jsonb(g) order by g.perfil, g.obra_id, g.modulo)
      from public.access_grants g where g.auth_user_id = p_expected_user_id)) into v_before;
  select jsonb_agg(jsonb_build_object('perfil', g.perfil, 'obra_id', g.obra_id,
    'modulo', g.modulo, 'obra_nome', w.nome) order by g.perfil, g.obra_id, g.modulo)
    into v_grants_snapshot from public.access_grants g join public.access_works w on w.id = g.obra_id
    where g.auth_user_id = p_expected_user_id;
  v_now := clock_timestamp();
  insert into public.access_decisions (
    id, auth_user_id, decision_type, perfil, perfis, atuacao_engenharia, atuacoes_engenharia,
    request_snapshot, grants_snapshot, before_access_snapshot, reason,
    actor_database_role, actor_snapshot, decided_at
  ) values (
    v_decision, p_expected_user_id, 'AJUSTE_ATUACAO_INICIAL', v_account.perfil, v_account.perfis,
    'COORDENACAO', array['EQUIPE_OBRA', 'COORDENACAO'], to_jsonb(v_request), v_grants_snapshot,
    v_before, btrim(p_reason), session_user, jsonb_build_object('database_session_user', session_user,
      'database_role', v_session_role, 'application_name', current_setting('application_name', true)), v_now
  );
  update public.access_accounts set atuacoes_engenharia = array['EQUIPE_OBRA', 'COORDENACAO']
    where auth_user_id = p_expected_user_id;
  -- No grant, legacy activity, approved_at/by, request, Auth field or prior
  -- decision is modified. The new activity uses the same 42 Engineering tuples.
  return v_decision;
end;
$function$;
revoke all on function dialogo_private.configure_initial_engineering_scopes(uuid, text, uuid[], text)
  from public, anon, authenticated, service_role;
grant execute on function dialogo_private.configure_initial_engineering_scopes(uuid, text, uuid[], text) to postgres;

create or replace function public.access_administration_schema_version()
returns integer language sql stable security invoker set search_path = '' as $function$
  select 3;
$function$;
comment on column public.access_accounts.atuacao_engenharia is 'Legacy primary Engineering activity retained for compatibility; authorization checks atuacoes_engenharia membership and exact Engineering grants.';
comment on column public.access_accounts.atuacoes_engenharia is 'Canonical granted Engineering activities. They share only this account''s exact Engineering profile/work/module grants, never an implicit administrative scope.';
comment on column public.access_decisions.atuacoes_engenharia is 'Activities at decision time; NULL in old decisions means the unchanged legacy singleton or no Engineering activity. Never backfill history.';
comment on function public.has_current_engineering_scope(text, uuid, text) is 'Server/RLS predicate requiring current verified active account, granted Engineering activity and exact profile/work/module tuple.';
comment on function dialogo_private.configure_initial_engineering_scopes(uuid, text, uuid[], text) is 'One-time postgres-only addition of Equipe da obra to the designated existing initial Coordination account on the same 21 reviewed works; does not mutate grants or earlier history.';

commit;

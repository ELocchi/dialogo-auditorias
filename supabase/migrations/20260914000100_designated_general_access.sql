-- B.6 records an explicitly authorized expansion of Luiza's existing account.
-- Installing this migration changes no account or grant. The separate admin
-- operation requires postgres, the designated identities and 21 explicit works.
begin;

alter table public.access_decisions drop constraint access_decisions_decision_type_check;
alter table public.access_decisions add constraint access_decisions_decision_type_check
  check (decision_type in ('BOOTSTRAP', 'APROVACAO', 'AJUSTE_PERFIS_INICIAL',
    'AJUSTE_ATUACAO_INICIAL', 'AJUSTE_ACESSOS_GERAIS'));
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
);
create unique index access_decisions_one_designated_general_expansion
  on public.access_decisions (auth_user_id) where decision_type = 'AJUSTE_ACESSOS_GERAIS';

create function dialogo_private.configure_luiza_general_access(
  p_expected_user_id uuid, p_expected_email text, p_work_ids uuid[], p_reason text
)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  v_reference constant uuid := '13044e3f-e8d2-4b4b-9981-22a8de22c610';
  v_profiles constant text[] := array['ADMINISTRATIVO', 'AUDITOR_SEGURANCA', 'AUDITOR_QUALIDADE', 'ENGENHARIA'];
  v_request public.access_requests%rowtype;
  v_account public.access_accounts%rowtype;
  v_approval public.access_decisions%rowtype;
  v_reference_account public.access_accounts%rowtype;
  v_reference_decision public.access_decisions%rowtype;
  v_decision uuid := gen_random_uuid();
  v_session_role text := current_setting('role', true);
  v_expected jsonb;
  v_original jsonb;
  v_actual jsonb;
  v_snapshot jsonb;
  v_before jsonb;
  v_now timestamptz;
begin
  if session_user <> 'postgres' or coalesce(v_session_role, '') not in ('none', 'postgres') then
    raise exception using errcode = '42501', message = 'database_administrator_session_required';
  end if;
  if p_expected_user_id is distinct from '1f60b2cc-8028-453e-a6de-9312aa5a67cb'::uuid
    or p_expected_email is distinct from 'luiza.dutra@dialogo.com.br' then
    raise exception using errcode = '22023', message = 'designated_identity_required';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 10 and 1000 then
    raise exception using errcode = '22023', message = 'deployment_reason_required';
  end if;
  if p_work_ids is null or array_ndims(p_work_ids) is distinct from 1
    or cardinality(p_work_ids) <> 21 or array_position(p_work_ids, null) is not null
    or (select count(distinct id) from unnest(p_work_ids) w(id)) <> 21 then
    raise exception using errcode = '22023', message = 'exactly_21_explicit_works_required';
  end if;
  perform pg_advisory_xact_lock(704209130002::bigint);
  if exists (select 1 from public.access_decisions
    where auth_user_id = p_expected_user_id and decision_type = 'AJUSTE_ACESSOS_GERAIS') then
    raise exception using errcode = '55000', message = 'designated_general_expansion_already_closed';
  end if;
  -- Serialize access decisions and lock both identities and authorization rows.
  perform 1 from auth.users u where
    ((u.id = v_reference and u.email = 'emanuel.locchi@dialogo.com.br')
      or (u.id = p_expected_user_id and u.email = p_expected_email))
    and u.email_confirmed_at is not null and u.deleted_at is null
    and (u.banned_until is null or u.banned_until <= statement_timestamp())
    order by u.id for share of u;
  if (select count(*) from auth.users u where
    ((u.id = v_reference and u.email = 'emanuel.locchi@dialogo.com.br')
      or (u.id = p_expected_user_id and u.email = p_expected_email))
    and u.email_confirmed_at is not null and u.deleted_at is null
    and (u.banned_until is null or u.banned_until <= statement_timestamp())) <> 2 then
    raise exception using errcode = '22023', message = 'confirmed_designated_identities_required';
  end if;
  perform 1 from public.access_requests r where r.auth_user_id in (v_reference, p_expected_user_id)
    order by r.auth_user_id for update;
  if (select count(*) from public.access_requests r join auth.users u on u.id = r.auth_user_id
    where r.auth_user_id in (v_reference, p_expected_user_id)
      and r.email = u.email and r.status_acesso = 'APROVADO') <> 2 then
    raise exception using errcode = '22023', message = 'existing_approved_accounts_required';
  end if;
  perform 1 from public.access_accounts a where a.auth_user_id in (v_reference, p_expected_user_id)
    order by a.auth_user_id for update;
  select * into v_reference_account from public.access_accounts where auth_user_id = v_reference;
  if not found or not v_reference_account.ativo or v_reference_account.perfis is distinct from v_profiles
    or v_reference_account.atuacao_engenharia is distinct from 'COORDENACAO'
    or v_reference_account.atuacoes_engenharia is distinct from array['EQUIPE_OBRA', 'COORDENACAO']::text[]
    or v_reference_account.approved_by is not null
    or not exists (select 1 from public.access_decisions d where d.auth_user_id = v_reference
      and d.decision_type = 'BOOTSTRAP' and d.decided_at = v_reference_account.approved_at
      and d.actor_database_role = 'postgres' and d.perfil = 'ADMINISTRATIVO'
      and d.grants_snapshot = '[]'::jsonb) then
    raise exception using errcode = '22023', message = 'unchanged_reference_account_required';
  end if;
  select * into v_account from public.access_accounts where auth_user_id = p_expected_user_id;
  if not found or not v_account.ativo or v_account.perfis is distinct from v_profiles
    or v_account.atuacao_engenharia is distinct from 'EQUIPE_OBRA'
    or v_account.atuacoes_engenharia is distinct from array['EQUIPE_OBRA']::text[] then
    raise exception using errcode = '22023', message = 'unchanged_designated_account_required';
  end if;
  select * into v_request from public.access_requests where auth_user_id = p_expected_user_id;
  select * into v_approval from public.access_decisions
    where auth_user_id = p_expected_user_id and decision_type = 'APROVACAO';
  if not found or v_approval.perfis is distinct from v_account.perfis
    or v_approval.atuacao_engenharia is distinct from v_account.atuacao_engenharia
    or v_approval.decided_at is distinct from v_account.approved_at
    or v_approval.actor_auth_user_id is distinct from v_account.approved_by
    or (select count(*) from public.access_decisions where auth_user_id = p_expected_user_id) <> 1 then
    raise exception using errcode = '22023', message = 'original_designated_approval_required';
  end if;
  select * into v_reference_decision from public.access_decisions
    where auth_user_id = v_reference and decision_type = 'AJUSTE_PERFIS_INICIAL';
  if not found or v_reference_decision.perfis is distinct from v_profiles
    or v_reference_decision.actor_database_role is distinct from 'postgres'
    or v_reference_decision.atuacao_engenharia is distinct from 'COORDENACAO' then
    raise exception using errcode = '22023', message = 'initial_profiles_decision_required';
  end if;
  perform 1 from public.access_works w where w.id = any(p_work_ids) and w.ativo order by w.id for share of w;
  if (select count(*) from public.access_works where id = any(p_work_ids) and ativo) <> 21 then
    raise exception using errcode = '22023', message = 'active_work_required';
  end if;
  perform 1 from public.access_grants g where g.auth_user_id in (v_reference, p_expected_user_id)
    order by g.auth_user_id, g.perfil, g.obra_id, g.modulo for share of g;
  if exists (select 1 from public.access_grants g where g.auth_user_id = v_reference
    and (g.decision_id is distinct from v_reference_decision.id or g.granted_by is not null
      or g.granted_at is distinct from v_reference_decision.decided_at)) then
    raise exception using errcode = '22023', message = 'unchanged_reference_grants_required';
  end if;
  select jsonb_agg(jsonb_build_object('perfil', p.perfil, 'obra_id', w.id, 'modulo', p.modulo)
    order by p.perfil, w.id, p.modulo) into v_expected
    from unnest(p_work_ids) w(id) cross join (values
      ('AUDITOR_SEGURANCA', 'SEGURANCA'), ('AUDITOR_QUALIDADE', 'QUALIDADE'),
      ('ENGENHARIA', 'SEGURANCA'), ('ENGENHARIA', 'QUALIDADE')) p(perfil, modulo);
  select jsonb_agg(g.value - 'obra_nome' order by g.value ->> 'perfil',
    (g.value ->> 'obra_id')::uuid, g.value ->> 'modulo') into v_original
    from jsonb_array_elements(v_reference_decision.grants_snapshot) g;
  select jsonb_agg(jsonb_build_object('perfil', g.perfil, 'obra_id', g.obra_id, 'modulo', g.modulo)
    order by g.perfil, g.obra_id, g.modulo) into v_actual
    from public.access_grants g where g.auth_user_id = v_reference;
  if v_original is distinct from v_expected or v_actual is distinct from v_expected then
    raise exception using errcode = '22023', message = 'same_21_reference_work_scopes_required';
  end if;
  select jsonb_agg(g.value - 'obra_nome' order by g.value ->> 'perfil',
    (g.value ->> 'obra_id')::uuid, g.value ->> 'modulo') into v_original
    from jsonb_array_elements(v_approval.grants_snapshot) g;
  select jsonb_agg(jsonb_build_object('perfil', g.perfil, 'obra_id', g.obra_id, 'modulo', g.modulo)
    order by g.perfil, g.obra_id, g.modulo) into v_actual
    from public.access_grants g where g.auth_user_id = p_expected_user_id;
  if jsonb_array_length(v_original) is distinct from 3 or v_actual is distinct from v_original
    or not (v_expected @> v_actual)
    or exists (select 1 from public.access_grants g where g.auth_user_id = p_expected_user_id
      and (g.decision_id is distinct from v_approval.id or g.granted_at is distinct from v_approval.decided_at
        or g.granted_by is distinct from v_approval.actor_auth_user_id)) then
    raise exception using errcode = '22023', message = 'unchanged_designated_grants_required';
  end if;
  select jsonb_build_object('account', to_jsonb(v_account), 'grants',
    (select jsonb_agg(to_jsonb(g) order by g.perfil, g.obra_id, g.modulo)
      from public.access_grants g where g.auth_user_id = p_expected_user_id)) into v_before;
  select jsonb_agg(jsonb_build_object('perfil', g.perfil, 'obra_id', g.obra_id,
    'modulo', g.modulo, 'obra_nome', w.nome) order by g.perfil, g.obra_id, g.modulo)
    into v_snapshot from public.access_grants g join public.access_works w on w.id = g.obra_id
    where g.auth_user_id = v_reference;
  v_now := clock_timestamp();
  insert into public.access_decisions (
    id, auth_user_id, decision_type, perfil, perfis, atuacao_engenharia, atuacoes_engenharia,
    request_snapshot, grants_snapshot, before_access_snapshot, reason,
    actor_database_role, actor_snapshot, decided_at
  ) values (
    v_decision, p_expected_user_id, 'AJUSTE_ACESSOS_GERAIS', v_profiles[1], v_profiles,
    'COORDENACAO', array['EQUIPE_OBRA', 'COORDENACAO'], to_jsonb(v_request), v_snapshot,
    v_before, btrim(p_reason), session_user, jsonb_build_object('database_session_user', session_user,
      'database_role', v_session_role, 'application_name', current_setting('application_name', true),
      'reference_auth_user_id', v_reference, 'reference_access_account', to_jsonb(v_reference_account)), v_now
  );
  update public.access_accounts set atuacao_engenharia = 'COORDENACAO',
    atuacoes_engenharia = array['EQUIPE_OBRA', 'COORDENACAO'] where auth_user_id = p_expected_user_id;
  insert into public.access_grants (auth_user_id, perfil, obra_id, modulo, granted_at, granted_by, decision_id)
    select p_expected_user_id, g.perfil, g.obra_id, g.modulo, v_now, null, v_decision
    from public.access_grants g where g.auth_user_id = v_reference
      and not exists (select 1 from public.access_grants previous
        where previous.auth_user_id = p_expected_user_id and previous.perfil = g.perfil
          and previous.obra_id = g.obra_id and previous.modulo = g.modulo);
  return v_decision;
end;
$function$;
revoke all on function dialogo_private.configure_luiza_general_access(uuid, text, uuid[], text)
  from public, anon, authenticated, service_role;
grant execute on function dialogo_private.configure_luiza_general_access(uuid, text, uuid[], text) to postgres;
comment on function dialogo_private.configure_luiza_general_access(uuid, text, uuid[], text) is
  'One-time designated account expansion authorized on 2026-09-14. Copies only the explicit verified current 21-work scopes. No API access, Auth changes, new approval, future-work inheritance or history rewrite.';

commit;

-- One-time designated access change; run with the Supabase Management API as postgres.
-- The versioned schema migration must be applied first.
begin;

do $operation$
declare
  v_source constant uuid := '13044e3f-e8d2-4b4b-9981-22a8de22c610';
  v_target constant uuid := 'f482050c-0c13-4ef1-addb-14699cfc656c';
  v_profiles constant text[] := array['ADMINISTRATIVO', 'AUDITOR_SEGURANCA',
    'AUDITOR_QUALIDADE', 'ENGENHARIA'];
  v_scopes constant text[] := array['EQUIPE_OBRA', 'COORDENACAO'];
  v_source_account public.access_accounts%rowtype;
  v_target_account public.access_accounts%rowtype;
  v_request public.access_requests%rowtype;
  v_decision uuid := gen_random_uuid();
  v_now timestamptz;
  v_grants jsonb;
  v_before jsonb;
begin
  if session_user <> 'postgres' or coalesce(current_setting('role', true), '') not in ('none', 'postgres') then
    raise exception 'database_administrator_session_required';
  end if;
  perform pg_advisory_xact_lock(704209130002::bigint);
  perform 1 from auth.users u where u.id in (v_source, v_target)
    order by u.id for share of u;
  if (select count(*) from auth.users u where
    (u.id = v_source and u.email = 'emanuel.locchi@dialogo.com.br'
      or u.id = v_target and u.email = 'ibrahim.cruz@dialogo.com.br')
    and u.email_confirmed_at is not null and u.deleted_at is null
    and (u.banned_until is null or u.banned_until <= statement_timestamp())) <> 2 then
    raise exception 'confirmed_designated_identities_required';
  end if;
  perform 1 from public.access_requests r where r.auth_user_id in (v_source, v_target)
    order by r.auth_user_id for update;
  if (select count(*) from public.access_requests r join auth.users u on u.id = r.auth_user_id
    where r.auth_user_id in (v_source, v_target) and r.email = u.email
      and r.status_acesso = 'APROVADO') <> 2 then
    raise exception 'existing_approved_accounts_required';
  end if;
  perform 1 from public.access_accounts a where a.auth_user_id in (v_source, v_target)
    order by a.auth_user_id for update;
  select * into v_source_account from public.access_accounts where auth_user_id = v_source;
  select * into v_target_account from public.access_accounts where auth_user_id = v_target;
  if not v_source_account.ativo or v_source_account.perfil <> 'ADMINISTRATIVO'
    or v_source_account.perfis is distinct from v_profiles
    or v_source_account.atuacao_engenharia is distinct from 'COORDENACAO'
    or v_source_account.atuacoes_engenharia is distinct from v_scopes then
    raise exception 'unchanged_reference_account_required';
  end if;
  if not v_target_account.ativo or v_target_account.perfil <> 'ADMINISTRATIVO'
    or v_target_account.perfis is distinct from array['ADMINISTRATIVO']::text[]
    or v_target_account.atuacao_engenharia is not null
    or v_target_account.atuacoes_engenharia is distinct from array[]::text[]
    or (select count(*) from public.access_decisions
      where auth_user_id = v_target and decision_type = 'APROVACAO') <> 1
    or (select count(*) from public.access_decisions where auth_user_id = v_target) <> 1
    or exists (select 1 from public.access_grants where auth_user_id = v_target) then
    raise exception 'unchanged_administrative_target_required';
  end if;
  perform 1 from public.access_grants g where g.auth_user_id = v_source
    order by g.perfil, g.obra_id, g.modulo for share of g;
  if (select count(*) from public.access_grants where auth_user_id = v_source) <> 84
    or (select count(distinct obra_id) from public.access_grants where auth_user_id = v_source) <> 21
    or exists (select 1 from public.access_grants g join public.access_works w on w.id = g.obra_id
      where g.auth_user_id = v_source and (not w.ativo or g.perfil not in
        ('AUDITOR_SEGURANCA', 'AUDITOR_QUALIDADE', 'ENGENHARIA')
        or g.modulo not in ('SEGURANCA', 'QUALIDADE')))
    or exists (select 1 from (select obra_id, count(*) n from public.access_grants
      where auth_user_id = v_source group by obra_id) per_work where per_work.n <> 4)
    or exists (select 1 from public.access_grants g where g.auth_user_id = v_source
      and not (g.perfil = 'AUDITOR_SEGURANCA' and g.modulo = 'SEGURANCA'
        or g.perfil = 'AUDITOR_QUALIDADE' and g.modulo = 'QUALIDADE'
        or g.perfil = 'ENGENHARIA' and g.modulo in ('SEGURANCA', 'QUALIDADE'))) then
    raise exception 'unchanged_21_work_reference_grants_required';
  end if;
  select * into v_request from public.access_requests where auth_user_id = v_target;
  select jsonb_build_object('account', to_jsonb(v_target_account), 'grants', '[]'::jsonb)
    into v_before;
  select jsonb_agg(jsonb_build_object('perfil', g.perfil, 'obra_id', g.obra_id,
    'modulo', g.modulo, 'obra_nome', w.nome) order by g.perfil, g.obra_id, g.modulo)
    into v_grants from public.access_grants g join public.access_works w on w.id = g.obra_id
    where g.auth_user_id = v_source;
  v_now := clock_timestamp();
  insert into public.access_decisions (
    id, auth_user_id, decision_type, perfil, perfis, atuacao_engenharia,
    atuacoes_engenharia, request_snapshot, grants_snapshot, before_access_snapshot,
    reason, actor_database_role, actor_snapshot, decided_at
  ) values (
    v_decision, v_target, 'AJUSTE_ACESSOS_GERAIS', 'ADMINISTRATIVO', v_profiles,
    'COORDENACAO', v_scopes, to_jsonb(v_request), v_grants, v_before,
    'Espelhamento dos acessos atuais de Emanuel Locchi para Ibrahim Matheus Cruz, autorizado pelo solicitante.',
    session_user, jsonb_build_object('database_session_user', session_user,
      'database_role', current_setting('role', true),
      'reference_auth_user_id', v_source, 'reference_email', 'emanuel.locchi@dialogo.com.br'), v_now
  );
  update public.access_accounts set perfis = v_profiles,
    atuacao_engenharia = 'COORDENACAO', atuacoes_engenharia = v_scopes
    where auth_user_id = v_target;
  insert into public.access_grants (auth_user_id, perfil, obra_id, modulo, granted_at, granted_by, decision_id)
    select v_target, g.perfil, g.obra_id, g.modulo, v_now, null, v_decision
    from public.access_grants g where g.auth_user_id = v_source;
end;
$operation$;

commit;

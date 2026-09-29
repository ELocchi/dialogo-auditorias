-- Require an explicit authenticated action after Auth email verification.
-- Existing confirmed requests and approved accounts remain unchanged. No
-- historical request, account, grant or decision is rewritten by this migration.
begin;

comment on column public.access_requests.email_confirmado_em is
  'Trusted Auth email timestamp acknowledged explicitly by the owner. New requests stay NULL until confirm_own_access_request_email; never derived from metadata.';

-- Provider confirmation and metadata updates cannot put a new request in the
-- administrative queue. Preserve only an existing, still-valid acknowledgment.
create or replace function public.sync_dialogo_access_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  declared_name text;
  declared_area text;
  declared_work text;
begin
  -- Do not silently enroll or change accounts that predate this migration.
  if tg_op = 'UPDATE' and not exists (
    select 1 from public.access_requests where auth_user_id = new.id
  ) then
    return new;
  end if;

  -- Also runs on direct Auth sign-up requests, beyond Next.js form validation.
  if not public.is_dialogo_corporate_email(new.email) then
    raise exception using errcode = '23514', message = 'corporate_email_required';
  end if;

  -- Email changes are not offered in this substage. Fail closed until the
  -- D02 change-of-email policy and renewed verification are implemented.
  if nullif(new.email_change, '') is not null then
    raise exception using errcode = '23514', message = 'email_change_not_available';
  end if;
  if tg_op = 'UPDATE' and new.email is distinct from old.email then
    raise exception using errcode = '23514', message = 'email_change_not_available';
  end if;

  if jsonb_typeof(new.raw_user_meta_data -> 'nome') is distinct from 'string' then
    raise exception using errcode = '23514', message = 'request_name_required';
  end if;

  declared_name := btrim(new.raw_user_meta_data ->> 'nome');
  declared_area := nullif(btrim(new.raw_user_meta_data ->> 'cargo_area_informado'), '');
  declared_work := nullif(btrim(new.raw_user_meta_data ->> 'obra_referencia_informada'), '');

  if char_length(declared_name) not between 1 and 160
    or char_length(declared_area) > 160
    or char_length(declared_work) > 160
    or (declared_area is not null and jsonb_typeof(new.raw_user_meta_data -> 'cargo_area_informado') <> 'string')
    or (declared_work is not null and jsonb_typeof(new.raw_user_meta_data -> 'obra_referencia_informada') <> 'string')
  then
    raise exception using errcode = '23514', message = 'invalid_declared_information';
  end if;

  if tg_op = 'INSERT' then
    insert into public.access_requests (
      auth_user_id, nome, email, status_acesso,
      cargo_area_informado, obra_referencia_informada, email_confirmado_em
    ) values (
      new.id, declared_name, new.email, 'PENDENTE_APROVACAO',
      declared_area, declared_work, null
    );
  else
    update public.access_requests
    set nome = declared_name,
        email = new.email,
        cargo_area_informado = declared_area,
        obra_referencia_informada = declared_work,
        email_confirmado_em = case
          when new.email_confirmed_at is not null
            and new.email_confirmed_at is not distinct from old.email_confirmed_at
            and email_confirmado_em = new.email_confirmed_at
            and email = new.email then email_confirmado_em
          else null
        end,
        updated_at = clock_timestamp()
    where auth_user_id = new.id;
    -- Never overwrite approval/status from metadata or from repeated requests.
  end if;

  return new;
end;
$function$;

create function public.confirm_own_access_request_email()
returns boolean language plpgsql security definer set search_path = '' as $function$
declare
  v_actor uuid := auth.uid();
  v_email text;
  v_confirmed_at timestamptz;
  v_request public.access_requests%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'confirmed_auth_identity_required';
  end if;
  -- Auth first, request second: the same row-lock order used by approval and
  -- the Auth synchronization trigger. A revoked identity cannot be confirmed.
  select u.email,u.email_confirmed_at into v_email,v_confirmed_at
    from auth.users u where u.id = v_actor
      and u.email_confirmed_at is not null and u.deleted_at is null
      and public.is_dialogo_corporate_email(u.email)
      and (u.banned_until is null or u.banned_until <= statement_timestamp())
    for share of u;
  if not found then
    raise exception using errcode = '42501', message = 'confirmed_auth_identity_required';
  end if;
  select * into v_request from public.access_requests r
    where r.auth_user_id = v_actor for update;
  if not found or v_request.email is distinct from v_email then
    raise exception using errcode = '22023', message = 'confirmed_access_request_required';
  end if;
  if v_request.email_confirmado_em is distinct from v_confirmed_at then
    update public.access_requests set email_confirmado_em = v_confirmed_at,
      updated_at = clock_timestamp() where auth_user_id = v_actor;
  end if;
  return true;
end;
$function$;
revoke all on function public.confirm_own_access_request_email() from public, anon, authenticated, service_role;
grant execute on function public.confirm_own_access_request_email() to authenticated;
comment on function public.confirm_own_access_request_email() is
  'Explicit authenticated confirmation of the caller only; uses the trusted Auth timestamp and creates no account, approval or grant.';


-- Enforce the acknowledgment in pending table RLS too.
create or replace function public.can_read_pending_access_request(p_auth_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select public.is_current_access_administrator() and exists (
    select 1 from public.access_requests r join auth.users u on u.id = r.auth_user_id
    where r.auth_user_id = p_auth_user_id
      and r.status_acesso = 'PENDENTE_APROVACAO' and u.email_confirmed_at is not null and r.email_confirmado_em is not null
      and r.email = u.email and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= statement_timestamp())
  );
$function$;

-- The public v3 approval delegates to this private-to-clients v2 function.
-- Check the acknowledgment under its existing transaction and request lock.
create or replace function public.approve_access_request_v2(
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
    or v_request.email_confirmado_em is null
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

commit;

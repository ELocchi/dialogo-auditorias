-- General administrators can revise an approved account without rewriting prior decisions.
-- Every edit replaces the current authorization atomically and appends an immutable snapshot.
begin;

alter table public.access_decisions drop constraint access_decisions_decision_type_check;
alter table public.access_decisions add constraint access_decisions_decision_type_check
  check (decision_type in ('BOOTSTRAP', 'APROVACAO', 'AJUSTE_PERFIS_INICIAL',
    'AJUSTE_ATUACAO_INICIAL', 'AJUSTE_ACESSOS_GERAIS', 'VINCULO_OBRA',
    'DESVINCULO_OBRA', 'EDICAO_USUARIO'));

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
    and auth_user_id in ('1f60b2cc-8028-453e-a6de-9312aa5a67cb'::uuid,
      'f482050c-0c13-4ef1-addb-14699cfc656c'::uuid)
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
  or (decision_type = 'EDICAO_USUARIO' and actor_auth_user_id is not null
    and actor_database_role is null and before_access_snapshot is not null)
);

create function public.update_access_account(
  p_auth_user_id uuid, p_perfis text[], p_atuacoes_engenharia text[],
  p_atuacao_administrativa text, p_grants jsonb, p_ativo boolean, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  v_actor uuid := auth.uid();
  v_actor_snapshot jsonb;
  v_request public.access_requests%rowtype;
  v_account public.access_accounts%rowtype;
  v_perfis text[] := dialogo_private.canonical_access_profiles(p_perfis);
  v_scopes text[] := dialogo_private.canonical_engineering_scopes(p_atuacoes_engenharia);
  v_item jsonb;
  v_work uuid;
  v_work_name text;
  v_profile text;
  v_module text;
  v_tuple text;
  v_seen text[] := array[]::text[];
  v_granted_profiles text[] := array[]::text[];
  v_before jsonb;
  v_grants_snapshot jsonb := '[]'::jsonb;
  v_decision uuid := gen_random_uuid();
  v_now timestamptz;
begin
  if v_actor is null or not public.is_current_access_administrator() then
    raise exception using errcode = '42501', message = 'general_administrator_required';
  end if;
  if p_auth_user_id is null or p_ativo is null then
    raise exception using errcode = '22023', message = 'invalid_account_edit';
  end if;
  perform pg_advisory_xact_lock(704209130002::bigint);
  perform 1 from public.access_accounts a join auth.users u on u.id = a.auth_user_id
    join public.access_requests r on r.auth_user_id = a.auth_user_id
    where a.auth_user_id = v_actor and a.ativo and 'ADMINISTRATIVO' = any(a.perfis)
      and a.atuacao_administrativa = 'GERAL' and r.status_acesso = 'APROVADO'
      and r.email = u.email and u.email_confirmed_at is not null
      and public.is_dialogo_corporate_email(u.email) and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= statement_timestamp())
    for share of a, u, r;
  if not found then raise exception using errcode = '42501', message = 'general_administrator_required'; end if;
  select jsonb_build_object('auth_user_id', r.auth_user_id, 'nome', r.nome, 'email', r.email)
    into v_actor_snapshot from public.access_requests r where r.auth_user_id = v_actor;

  if p_perfis is null or array_ndims(p_perfis) is distinct from 1
    or cardinality(v_perfis) not between 1 and 4
    or cardinality(p_perfis) <> cardinality(v_perfis) then
    raise exception using errcode = '22023', message = 'invalid_access_profiles';
  end if;
  if 'ENGENHARIA' = any(v_perfis) then
    if p_atuacoes_engenharia is null or array_ndims(p_atuacoes_engenharia) is distinct from 1
      or cardinality(v_scopes) not between 1 and 2
      or cardinality(p_atuacoes_engenharia) <> cardinality(v_scopes) then
      raise exception using errcode = '22023', message = 'invalid_engineering_scopes';
    end if;
  elsif p_atuacoes_engenharia is null or cardinality(p_atuacoes_engenharia) <> 0 then
    raise exception using errcode = '22023', message = 'invalid_engineering_scopes';
  end if;
  if ('ADMINISTRATIVO' = any(v_perfis) and p_atuacao_administrativa not in ('SEGURANCA','QUALIDADE','GERAL'))
    or (not ('ADMINISTRATIVO' = any(v_perfis)) and p_atuacao_administrativa is not null) then
    raise exception using errcode = '22023', message = 'invalid_administrative_scope';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 10 and 1000 then
    raise exception using errcode = '22023', message = 'decision_reason_required';
  end if;
  if p_grants is null or jsonb_typeof(p_grants) <> 'array' or jsonb_array_length(p_grants) > 400 then
    raise exception using errcode = '22023', message = 'invalid_access_grants';
  end if;

  select a.* into v_account from public.access_accounts a join auth.users u on u.id = a.auth_user_id
    join public.access_requests r on r.auth_user_id = a.auth_user_id
    where a.auth_user_id = p_auth_user_id and r.status_acesso = 'APROVADO'
      and r.email = u.email and u.email_confirmed_at is not null
      and public.is_dialogo_corporate_email(u.email) and u.deleted_at is null
    for update of a;
  if not found then raise exception using errcode = '22023', message = 'approved_account_required'; end if;
  select * into v_request from public.access_requests where auth_user_id = p_auth_user_id;

  for v_item in select value from jsonb_array_elements(p_grants) loop
    if jsonb_typeof(v_item) <> 'object' or (select count(*) from jsonb_object_keys(v_item)) <> 3
      or jsonb_typeof(v_item -> 'perfil') is distinct from 'string'
      or jsonb_typeof(v_item -> 'obra_id') is distinct from 'string'
      or jsonb_typeof(v_item -> 'modulo') is distinct from 'string' then
      raise exception using errcode = '22023', message = 'invalid_access_grants';
    end if;
    begin v_work := (v_item ->> 'obra_id')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'invalid_access_grants';
    end;
    v_profile := v_item ->> 'perfil';
    v_module := v_item ->> 'modulo';
    if not (v_profile = any(v_perfis)) or v_profile = 'ADMINISTRATIVO'
      or v_module not in ('SEGURANCA','QUALIDADE')
      or (v_profile = 'AUDITOR_SEGURANCA' and v_module <> 'SEGURANCA')
      or (v_profile = 'AUDITOR_QUALIDADE' and v_module <> 'QUALIDADE') then
      raise exception using errcode = '22023', message = 'profile_module_mismatch';
    end if;
    v_tuple := v_profile || '/' || v_work::text || '/' || v_module;
    if v_tuple = any(v_seen) then raise exception using errcode = '22023', message = 'duplicate_access_grant'; end if;
    v_seen := array_append(v_seen, v_tuple);
    v_granted_profiles := array_append(v_granted_profiles, v_profile);
    select w.nome into v_work_name from public.access_works w where w.id = v_work and w.ativo for share of w;
    if not found then raise exception using errcode = '22023', message = 'active_work_required'; end if;
    v_grants_snapshot := v_grants_snapshot || jsonb_build_array(jsonb_build_object(
      'perfil',v_profile,'obra_id',v_work,'modulo',v_module,'obra_nome',v_work_name));
  end loop;
  if exists (select 1 from unnest(v_perfis) p(perfil)
    where p.perfil <> 'ADMINISTRATIVO' and not (p.perfil = any(v_granted_profiles))) then
    raise exception using errcode = '22023', message = 'technical_profile_grant_required';
  end if;
  if 'ENGENHARIA' = any(v_perfis)
    and not dialogo_private.engineering_grants_cover_both_modules(p_grants) then
    raise exception using errcode = '22023', message = 'engineering_all_modules_required';
  end if;

  if v_account.ativo and 'ADMINISTRATIVO' = any(v_account.perfis)
    and v_account.atuacao_administrativa = 'GERAL'
    and not (p_ativo and 'ADMINISTRATIVO' = any(v_perfis) and p_atuacao_administrativa = 'GERAL')
    and not exists (select 1 from public.access_accounts a
      where a.auth_user_id <> p_auth_user_id and a.ativo
        and 'ADMINISTRATIVO' = any(a.perfis) and a.atuacao_administrativa = 'GERAL') then
    raise exception using errcode = '55000', message = 'last_general_administrator_required';
  end if;

  select jsonb_build_object('account',to_jsonb(v_account),'grants',
    coalesce((select jsonb_agg(to_jsonb(g) order by g.perfil,g.obra_id,g.modulo)
      from public.access_grants g where g.auth_user_id = p_auth_user_id),'[]'::jsonb)) into v_before;
  v_now := clock_timestamp();
  insert into public.access_decisions (
    id,auth_user_id,decision_type,perfil,perfis,atuacao_engenharia,atuacoes_engenharia,
    request_snapshot,grants_snapshot,before_access_snapshot,reason,
    actor_auth_user_id,actor_snapshot,decided_at
  ) values (
    v_decision,p_auth_user_id,'EDICAO_USUARIO',v_perfis[1],v_perfis,
    case when 'ENGENHARIA' = any(v_perfis) then v_scopes[1] else null end,v_scopes,
    to_jsonb(v_request) || jsonb_build_object('access_edit',jsonb_build_object(
      'ativo',p_ativo,'perfis',v_perfis,'atuacoes_engenharia',v_scopes,
      'atuacao_administrativa',p_atuacao_administrativa)),
    v_grants_snapshot,v_before,btrim(p_reason),v_actor,v_actor_snapshot,v_now
  );
  insert into dialogo_private.administrative_scope_decisions(decision_id,auth_user_id,atuacao_administrativa)
    values(v_decision,p_auth_user_id,p_atuacao_administrativa);
  update public.access_accounts set perfil=v_perfis[1],perfis=v_perfis,
    atuacao_engenharia=case when 'ENGENHARIA'=any(v_perfis) then v_scopes[1] else null end,
    atuacoes_engenharia=v_scopes,atuacao_administrativa=p_atuacao_administrativa,ativo=p_ativo
    where auth_user_id=p_auth_user_id;
  delete from public.access_grants where auth_user_id=p_auth_user_id;
  insert into public.access_grants(auth_user_id,perfil,obra_id,modulo,granted_at,granted_by,decision_id)
    select p_auth_user_id,item.value->>'perfil',(item.value->>'obra_id')::uuid,
      item.value->>'modulo',v_now,v_actor,v_decision from jsonb_array_elements(v_grants_snapshot) item;
  return v_decision;
end;
$function$;

revoke all on function public.update_access_account(uuid,text[],text[],text,jsonb,boolean,text)
  from public,anon,authenticated,service_role;
grant execute on function public.update_access_account(uuid,text[],text[],text,jsonb,boolean,text)
  to authenticated;

comment on function public.update_access_account(uuid,text[],text[],text,jsonb,boolean,text) is
  'Atomically replaces one approved account authorization and appends an immutable administrator decision.';

commit;

-- B.5: editable work details with optimistic revisions and immutable history.
-- Existing names, IDs, active flags, creators and access grants remain intact.
begin;

create function dialogo_private.is_valid_work_team(p_team jsonb)
returns boolean language plpgsql immutable set search_path = '' as $function$
declare v_member jsonb;
begin
  if p_team is null or jsonb_typeof(p_team) <> 'array' then return false; end if;
  if jsonb_array_length(p_team) > 30 then return false; end if;
  for v_member in select value from jsonb_array_elements(p_team) loop
    if jsonb_typeof(v_member) <> 'object' then return false; end if;
    if (select count(*) from jsonb_object_keys(v_member)) <> 2
      or jsonb_typeof(v_member -> 'nome') is distinct from 'string'
      or jsonb_typeof(v_member -> 'funcao') is distinct from 'string'
      or char_length(v_member ->> 'nome') not between 2 and 160
      or char_length(v_member ->> 'funcao') > 100
      or (v_member ->> 'nome') <> btrim(v_member ->> 'nome')
      or (v_member ->> 'funcao') <> btrim(v_member ->> 'funcao') then return false; end if;
  end loop;
  return true;
end;
$function$;
revoke all on function dialogo_private.is_valid_work_team(jsonb)
  from public, anon, authenticated, service_role;

alter table public.access_works
  add column logradouro text not null default '',
  add column numero text not null default '',
  add column complemento text not null default '',
  add column bairro text not null default '',
  add column cidade text not null default '',
  add column uf text not null default '',
  add column cep text not null default '',
  add column responsavel_tecnico text not null default '',
  add column registro_tecnico text not null default '',
  add column coordenacao text not null default '',
  add column observacoes text not null default '',
  add column equipe_obra jsonb not null default '[]'::jsonb,
  add column revisao integer not null default 0,
  add column updated_at timestamptz,
  add column updated_by uuid references auth.users(id) on delete restrict;
alter table public.access_works add constraint access_works_details_check check (
  char_length(logradouro) <= 200 and logradouro = btrim(logradouro)
  and char_length(numero) <= 30 and numero = btrim(numero)
  and char_length(complemento) <= 120 and complemento = btrim(complemento)
  and char_length(bairro) <= 100 and bairro = btrim(bairro)
  and char_length(cidade) <= 100 and cidade = btrim(cidade)
  and uf in ('', 'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
    'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO',
    'RR', 'SC', 'SP', 'SE', 'TO')
  and (cep = '' or cep ~ '^[0-9]{8}$')
  and char_length(responsavel_tecnico) <= 160 and responsavel_tecnico = btrim(responsavel_tecnico)
  and char_length(registro_tecnico) <= 80 and registro_tecnico = btrim(registro_tecnico)
  and char_length(coordenacao) <= 160 and coordenacao = btrim(coordenacao)
  and char_length(observacoes) <= 2000 and observacoes = btrim(observacoes)
  and dialogo_private.is_valid_work_team(equipe_obra)
);
alter table public.access_works add constraint access_works_revision_check check (
  (revisao = 0 and updated_at is null and updated_by is null)
  or (revisao > 0 and updated_at is not null and updated_by is not null)
);

create table public.access_work_changes (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.access_works(id) on delete restrict,
  revisao integer not null check (revisao > 0),
  before_snapshot jsonb not null check (jsonb_typeof(before_snapshot) = 'object'),
  after_snapshot jsonb not null check (jsonb_typeof(after_snapshot) = 'object'),
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  actor_snapshot jsonb not null check (jsonb_typeof(actor_snapshot) = 'object'),
  changed_at timestamptz not null,
  unique (obra_id, revisao)
);
create index access_work_changes_recent on public.access_work_changes (changed_at desc, id desc);
alter table public.access_work_changes enable row level security;
revoke all on table public.access_work_changes from public, anon, authenticated, service_role;
grant select on table public.access_work_changes to authenticated;
create policy access_work_changes_select_admin on public.access_work_changes
  for select to authenticated using ((select public.is_current_access_administrator()));

create function dialogo_private.reject_access_work_change_mutation()
returns trigger language plpgsql set search_path = '' as $function$
begin
  raise exception using errcode = '55000', message = 'work_history_is_immutable';
end;
$function$;
revoke all on function dialogo_private.reject_access_work_change_mutation()
  from public, anon, authenticated, service_role;
create trigger access_work_changes_immutable before update or delete on public.access_work_changes
  for each row execute function dialogo_private.reject_access_work_change_mutation();
create trigger access_work_changes_no_truncate before truncate on public.access_work_changes
  for each statement execute function dialogo_private.reject_access_work_change_mutation();

create function dialogo_private.normalize_work_details(p_data jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $function$
declare
  v_field record;
  v_value text;
  v_data jsonb := '{}'::jsonb;
  v_member jsonb;
  v_team jsonb := '[]'::jsonb;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_work_details';
  end if;
  if (select count(*) from jsonb_object_keys(p_data)) <> 13 then
    raise exception using errcode = '22023', message = 'invalid_work_details';
  end if;
  for v_field in select * from (values
    ('nome', 2, 160), ('logradouro', 0, 200), ('numero', 0, 30),
    ('complemento', 0, 120), ('bairro', 0, 100), ('cidade', 0, 100),
    ('uf', 0, 2), ('cep', 0, 8), ('responsavel_tecnico', 0, 160),
    ('registro_tecnico', 0, 80), ('coordenacao', 0, 160), ('observacoes', 0, 2000)
  ) f(name, minimum, maximum) loop
    if jsonb_typeof(p_data -> v_field.name) is distinct from 'string' then
      raise exception using errcode = '22023', message = 'invalid_work_details';
    end if;
    v_value := btrim(p_data ->> v_field.name);
    if v_field.name = 'uf' then v_value := upper(v_value); end if;
    if char_length(v_value) not between v_field.minimum and v_field.maximum then
      raise exception using errcode = '22023', message = 'invalid_work_details';
    end if;
    v_data := v_data || jsonb_build_object(v_field.name, v_value);
  end loop;
  if (v_data ->> 'uf') not in ('', 'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES',
    'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
    'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO')
    or ((v_data ->> 'cep') <> '' and (v_data ->> 'cep') !~ '^[0-9]{8}$')
    or jsonb_typeof(p_data -> 'equipe_obra') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'invalid_work_details';
  end if;
  if jsonb_array_length(p_data -> 'equipe_obra') > 30 then
    raise exception using errcode = '22023', message = 'invalid_work_details';
  end if;
  for v_member in select value from jsonb_array_elements(p_data -> 'equipe_obra') loop
    if jsonb_typeof(v_member) <> 'object' then
      raise exception using errcode = '22023', message = 'invalid_work_details';
    end if;
    if (select count(*) from jsonb_object_keys(v_member)) <> 2
      or jsonb_typeof(v_member -> 'nome') is distinct from 'string'
      or jsonb_typeof(v_member -> 'funcao') is distinct from 'string' then
      raise exception using errcode = '22023', message = 'invalid_work_details';
    end if;
    v_team := v_team || jsonb_build_array(jsonb_build_object(
      'nome', btrim(v_member ->> 'nome'), 'funcao', btrim(v_member ->> 'funcao')));
  end loop;
  if not dialogo_private.is_valid_work_team(v_team) then
    raise exception using errcode = '22023', message = 'invalid_work_details';
  end if;
  return v_data || jsonb_build_object('equipe_obra', v_team);
end;
$function$;
revoke all on function dialogo_private.normalize_work_details(jsonb)
  from public, anon, authenticated, service_role;

create function public.update_access_work(p_work_id uuid, p_expected_revision integer, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_actor uuid := auth.uid();
  v_work public.access_works%rowtype;
  v_actor_snapshot jsonb;
  v_data jsonb;
  v_before jsonb;
  v_after jsonb;
  v_history uuid := gen_random_uuid();
  v_now timestamptz;
begin
  -- Current database membership supplies authority; no client-selected role,
  -- JWT metadata, creator identity or technical work grant can authorize writes.
  select jsonb_build_object('auth_user_id', r.auth_user_id, 'nome', r.nome, 'email', r.email)
    into v_actor_snapshot
  from public.access_accounts a join auth.users u on u.id = a.auth_user_id
    join public.access_requests r on r.auth_user_id = a.auth_user_id
  where a.auth_user_id = v_actor and a.ativo and 'ADMINISTRATIVO' = any(a.perfis)
    and u.email_confirmed_at is not null and r.status_acesso = 'APROVADO' and r.email = u.email
    and public.is_dialogo_corporate_email(u.email)
    and u.deleted_at is null and (u.banned_until is null or u.banned_until <= statement_timestamp())
    for share of a, u, r;
  if not found then
    raise exception using errcode = '42501', message = 'active_administrator_required';
  end if;
  if p_work_id is null or p_expected_revision is null or p_expected_revision < 0 then
    raise exception using errcode = '22023', message = 'invalid_work_revision';
  end if;
  v_data := dialogo_private.normalize_work_details(p_data);
  select * into v_work from public.access_works w where w.id = p_work_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'work_not_found';
  end if;
  if v_work.revisao <> p_expected_revision then
    raise exception using errcode = '40001', message = 'work_revision_conflict';
  end if;
  v_before := to_jsonb(v_work);
  if (select jsonb_object_agg(k.name, v_before -> k.name) from jsonb_object_keys(v_data) k(name)) = v_data then
    return jsonb_build_object('obra_id', v_work.id, 'revisao', v_work.revisao,
      'updated_at', v_work.updated_at, 'history_id', null, 'changed', false);
  end if;
  v_now := clock_timestamp();
  update public.access_works w set
    nome = v_data ->> 'nome', logradouro = v_data ->> 'logradouro', numero = v_data ->> 'numero',
    complemento = v_data ->> 'complemento', bairro = v_data ->> 'bairro', cidade = v_data ->> 'cidade',
    uf = v_data ->> 'uf', cep = v_data ->> 'cep', responsavel_tecnico = v_data ->> 'responsavel_tecnico',
    registro_tecnico = v_data ->> 'registro_tecnico', coordenacao = v_data ->> 'coordenacao',
    observacoes = v_data ->> 'observacoes', equipe_obra = v_data -> 'equipe_obra',
    revisao = v_work.revisao + 1, updated_at = v_now, updated_by = v_actor
    where w.id = p_work_id returning to_jsonb(w) into v_after;
  insert into public.access_work_changes (
    id, obra_id, revisao, before_snapshot, after_snapshot, actor_auth_user_id, actor_snapshot, changed_at
  ) values (v_history, v_work.id, v_work.revisao + 1, v_before, v_after, v_actor, v_actor_snapshot, v_now);
  return jsonb_build_object('obra_id', v_work.id, 'revisao', v_work.revisao + 1,
    'updated_at', v_now, 'history_id', v_history, 'changed', true);
end;
$function$;
revoke all on function public.update_access_work(uuid, integer, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.update_access_work(uuid, integer, jsonb) to authenticated;

create or replace function public.access_administration_schema_version()
returns integer language sql stable security invoker set search_path = '' as $function$
  select 4;
$function$;
comment on table public.access_work_changes is 'Append-only history of reviewed work-detail changes; snapshots include metadata and exact before/after revisions. No account grants are created by names in the team list.';
comment on column public.access_works.equipe_obra is 'Descriptive team names/functions only. Not an Auth identity, access approval, role, activity or work permission.';
comment on column public.access_works.revisao is 'Optimistic revision supplied on update; unchanged forms never create a new revision or history record.';
comment on function public.update_access_work(uuid, integer, jsonb) is 'Authenticated current-Administrator RPC for exact work details; serialized revision check and append-only history are atomic. IDs, active state, creators and access grants cannot be changed through this operation.';

commit;

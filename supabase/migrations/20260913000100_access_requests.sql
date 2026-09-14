-- B.1: minimum request record. Apply only to the authorized Supabase DEV project.
-- This migration does not backfill, approve, delete or modify existing Auth users.
-- Existing accounts without a request require a separate, reviewed reconciliation.
-- No operational permission, administrative approval, audit table or Storage here.
-- References:
-- https://supabase.com/docs/guides/auth/managing-user-data
-- https://supabase.com/docs/guides/database/postgres/row-level-security

begin;

create function public.is_dialogo_corporate_email(candidate text)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select coalesce(
    octet_length(candidate) <= 254
    and octet_length(split_part(candidate, '@', 1)) between 1 and 64
    and lower(split_part(candidate, '@', 2)) = 'dialogo.com.br'
    and candidate ~ $email$^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9.-]+$$email$,
    false
  );
$function$;

revoke all on function public.is_dialogo_corporate_email(text) from public, anon, authenticated;

create table public.access_requests (
  auth_user_id uuid primary key references auth.users(id) on delete restrict,
  nome text not null check (char_length(btrim(nome)) between 1 and 160),
  email text not null check (public.is_dialogo_corporate_email(email)),
  status_acesso text not null default 'PENDENTE_APROVACAO'
    check (status_acesso = 'PENDENTE_APROVACAO'),
  cargo_area_informado text check (char_length(cargo_area_informado) <= 160),
  obra_referencia_informada text check (char_length(obra_referencia_informada) <= 160),
  email_confirmado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.access_requests is
  'B.1 own access request only; not an operational profile or a permission grant.';
comment on column public.access_requests.email_confirmado_em is
  'Server-derived auth.users.email_confirmed_at; never copied from user metadata.';
comment on column public.access_requests.status_acesso is
  'Only pending is supported in B.1. Approval requires a later reviewed migration.';

alter table public.access_requests enable row level security;

-- Explicit privileges complement RLS. There is no client write policy or grant.
revoke all on table public.access_requests from public, anon, authenticated;
grant select on table public.access_requests to authenticated;

create policy access_requests_select_own
on public.access_requests
for select
to authenticated
using ((select auth.uid()) = auth_user_id);

create function public.sync_dialogo_access_request()
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
      declared_area, declared_work, new.email_confirmed_at
    );
  else
    update public.access_requests
    set nome = declared_name,
        email = new.email,
        cargo_area_informado = declared_area,
        obra_referencia_informada = declared_work,
        email_confirmado_em = new.email_confirmed_at,
        updated_at = clock_timestamp()
    where auth_user_id = new.id;
    -- Never overwrite approval/status from metadata or from repeated requests.
  end if;

  return new;
end;
$function$;

revoke all on function public.sync_dialogo_access_request() from public, anon, authenticated;

create trigger dialogo_sync_access_request
after insert or update of email, email_change, email_confirmed_at, raw_user_meta_data
on auth.users
for each row execute function public.sync_dialogo_access_request();

-- Safe readiness signal: no user data, no writes, no elevated privileges.
-- Next.js checks the version before attempting a real Auth sign-up.
create function public.access_requests_schema_version()
returns integer
language sql
stable
security invoker
set search_path = ''
as $function$
  select 1;
$function$;

revoke all on function public.access_requests_schema_version() from public;
grant execute on function public.access_requests_schema_version() to anon, authenticated;

commit;

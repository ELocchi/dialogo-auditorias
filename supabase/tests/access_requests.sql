-- B.1 database tests. NOT run against the hosted DEV project or the pilot.
-- Requires an isolated LOCAL Supabase/Postgres test database with the migration
-- already applied. In that same administrator session explicitly set:
--   SET dialogo.test_database = 'isolated-local';
-- Then run this file with stop-on-error enabled (psql: ON_ERROR_STOP=1).
-- No Auth HTTP calls, no passwords, no mail delivery. Synthetic Auth rows exist
-- only inside this rolled-back transaction. No existing account is modified.
-- Not automatically invoked by npm tests; no database test is approved until
-- this file has actually completed in a suitable local test database.

begin;

do $test$
begin
  if current_setting('dialogo.test_database', true) is distinct from 'isolated-local' then
    raise exception 'Run only in an explicitly designated isolated local test database.';
  end if;
end;
$test$;

create function pg_temp.assert_true(result boolean, test_name text)
returns void
language plpgsql
as $test$
begin
  if result is distinct from true then
    raise exception 'Failed: %', test_name;
  end if;
end;
$test$;

-- T01: exact domain and practical ASCII dot-atom syntax; no mailbox delivery.
do $test$
declare
  case_row record;
begin
  for case_row in
    select * from (values
      ('fixture.sql@dialogo.com.br', true),
      ('Fixture.Sql+part@DIALOGO.COM.BR', true),
      ('fixture@sub.dialogo.com.br', false),
      ('fixture@dialogo.com.br.invalid', false),
      ('fixture@dialogo-com.br', false),
      ('dialogo.com.br@invalid.example', false),
      ('fixture@invalid.example', false),
      ('fixture@@dialogo.com.br', false),
      ('fixture@dialogo.com.br@invalid.example', false),
      ('fixture@dialogo.com.br@', false),
      (E'fixture@dialogo.com.br\ntrailing', false),
      (E'fixture@dialogo.com.br\r\n', false),
      ('fixture@dialogo.com.br trailing', false),
      ('.fixture@dialogo.com.br', false),
      ('fixture..sql@dialogo.com.br', false),
      ('fixture @dialogo.com.br', false),
      (repeat('x', 65) || '@dialogo.com.br', false),
      (null, false)
    ) as cases(email, expected)
  loop
    perform pg_temp.assert_true(
      public.is_dialogo_corporate_email(case_row.email) = case_row.expected,
      'T01 corporate domain and format'
    );
  end loop;
end;
$test$;

-- T02: direct Auth insertion cannot bypass domain validation.
do $test$
begin
  begin
    insert into auth.users (id, email, raw_user_meta_data)
    values ('d1a10000-0000-4000-8000-000000000099',
      'fixture.sql@invalid.example', '{"nome":"SQL fixture denied"}');
    raise exception 'T02 invalid Auth domain was accepted';
  exception when check_violation then
    null;
  end;
  perform pg_temp.assert_true(
    not exists (select 1 from auth.users where id = 'd1a10000-0000-4000-8000-000000000099'),
    'T02 invalid Auth insertion rolls back'
  );
end;
$test$;

-- Synthetic rows for SQL only. There is no password or usable Auth session.
insert into auth.users (id, email, raw_user_meta_data)
values
  ('d1a10000-0000-4000-8000-000000000001',
    'fixture.sql.b1.one@dialogo.com.br',
    '{"nome":"SQL fixture one","status_acesso":"APROVADO","role":"administrative","email_confirmado":true,"email_confirmado_em":"2020-01-01","cargo_area_informado":"Declared area","obra_referencia_informada":"Declared reference"}'),
  ('d1a10000-0000-4000-8000-000000000002',
    'fixture.sql.b1.two@dialogo.com.br',
    '{"nome":"SQL fixture two"}');

-- T03: first/new requests are pending; metadata cannot confirm or approve.
select pg_temp.assert_true(
  (select status_acesso = 'PENDENTE_APROVACAO'
    and email_confirmado_em is null
    and nome = 'SQL fixture one'
    and cargo_area_informado = 'Declared area'
    and obra_referencia_informada = 'Declared reference'
    and created_at is not null and updated_at is not null
   from public.access_requests
   where auth_user_id = 'd1a10000-0000-4000-8000-000000000001'),
  'T03 pending request ignores forged authority metadata'
);

-- T04: trusted Auth confirmation is copied; forged status remains ignored.
update auth.users
set email_confirmed_at = '2026-09-13 12:00:00+00',
    raw_user_meta_data = raw_user_meta_data || '{"status_acesso":"APROVADO","email_confirmado_em":"2030-01-01"}'::jsonb
where id = 'd1a10000-0000-4000-8000-000000000001';

select pg_temp.assert_true(
  (select email_confirmado_em = '2026-09-13 12:00:00+00'::timestamptz
    and status_acesso = 'PENDENTE_APROVACAO'
   from public.access_requests
   where auth_user_id = 'd1a10000-0000-4000-8000-000000000001'),
  'T04 only server Auth confirmation is mirrored'
);

-- T05: neither requesting nor completing an email change is available yet.
do $test$
begin
  begin
    update auth.users set email_change = 'fixture@invalid.example'
    where id = 'd1a10000-0000-4000-8000-000000000001';
    raise exception 'T05 email-change request was accepted';
  exception when check_violation then null;
  end;
  begin
    update auth.users set email = 'fixture.sql.changed@dialogo.com.br'
    where id = 'd1a10000-0000-4000-8000-000000000001';
    raise exception 'T05 direct email change was accepted';
  exception when check_violation then null;
  end;
end;
$test$;

-- T06: the schema cannot represent an approved status in this substage.
do $test$
begin
  begin
    update public.access_requests set status_acesso = 'APROVADO'
    where auth_user_id = 'd1a10000-0000-4000-8000-000000000001';
    raise exception 'T06 approved status was accepted';
  exception when check_violation then null;
  end;
end;
$test$;

-- T07: check the actual RLS/privilege setup, rather than only inspecting SQL.
select pg_temp.assert_true(
  (select relrowsecurity from pg_class where oid = 'public.access_requests'::regclass)
  and not has_table_privilege('anon', 'public.access_requests', 'SELECT')
  and has_table_privilege('authenticated', 'public.access_requests', 'SELECT')
  and not has_table_privilege('authenticated', 'public.access_requests', 'INSERT')
  and not has_table_privilege('authenticated', 'public.access_requests', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.access_requests', 'DELETE')
  and not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'access_requests' and cmd <> 'SELECT'
  ),
  'T07 RLS enabled and no client write permission'
);

set local role authenticated;
set local "request.jwt.claim.sub" = 'd1a10000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"d1a10000-0000-4000-8000-000000000001","role":"authenticated"}';

-- T08: first account sees only itself, even when explicitly requesting another.
do $test$
begin
  if (select count(*) from public.access_requests) <> 1
    or exists (select 1 from public.access_requests
               where auth_user_id = 'd1a10000-0000-4000-8000-000000000002')
  then
    raise exception 'T08 own row isolation failed';
  end if;
end;
$test$;

-- T09: direct data access cannot self-approve, alter declarations or delete.
do $test$
begin
  begin
    update public.access_requests set status_acesso = 'APROVADO'
    where auth_user_id = 'd1a10000-0000-4000-8000-000000000001';
    raise exception 'T09 client status update was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.access_requests set nome = 'Changed directly';
    raise exception 'T09 direct client profile update was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.access_requests;
    raise exception 'T09 client deletion was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.access_requests (auth_user_id, nome, email)
    values ('d1a10000-0000-4000-8000-000000000001', 'Client injection',
      'fixture.sql.b1.one@dialogo.com.br');
    raise exception 'T09 client insertion was allowed';
  exception when insufficient_privilege then null;
  end;
end;
$test$;

-- T10: changing the authenticated identity changes the isolated result set.
set local "request.jwt.claim.sub" = 'd1a10000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"d1a10000-0000-4000-8000-000000000002","role":"authenticated"}';
do $test$
begin
  if (select count(*) from public.access_requests) <> 1
    or not exists (select 1 from public.access_requests
                   where auth_user_id = 'd1a10000-0000-4000-8000-000000000002')
  then
    raise exception 'T10 second account isolation failed';
  end if;
end;
$test$;

-- T11: authenticated role without a subject has no request visibility.
set local "request.jwt.claim.sub" = '';
set local "request.jwt.claims" = '{}';
do $test$
begin
  if exists (select 1 from public.access_requests) then
    raise exception 'T11 missing identity can see rows';
  end if;
end;
$test$;

reset role;
set local role anon;

-- T12: anonymous can only see the constant readiness signal, not user data.
do $test$
begin
  if public.access_requests_schema_version() is distinct from 1 then
    raise exception 'T12 readiness signal unavailable';
  end if;
  begin
    perform 1 from public.access_requests;
    raise exception 'T12 anonymous request read was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.is_dialogo_corporate_email('fixture@dialogo.com.br');
    raise exception 'T12 internal helper RPC was allowed';
  exception when insufficient_privilege then null;
  end;
end;
$test$;

reset role;

-- T13: repeated Auth row insertion cannot replace the original request.
do $test$
begin
  begin
    insert into auth.users (id, email, raw_user_meta_data)
    values ('d1a10000-0000-4000-8000-000000000001',
      'fixture.sql.b1.one@dialogo.com.br', '{"nome":"Replaced"}');
    raise exception 'T13 duplicate identity was inserted';
  exception when unique_violation then null;
  end;
  perform pg_temp.assert_true(
    (select count(*) = 1 from public.access_requests
     where auth_user_id = 'd1a10000-0000-4000-8000-000000000001' and nome = 'SQL fixture one'),
    'T13 repeated identity did not replace request'
  );
end;
$test$;

-- This is a SQL policy suite, not evidence of Auth HTTP duplicate-signup,
-- delivery, browser login, logout or end-to-end email confirmation behavior.
rollback;

-- B.2 tests: only an empty, explicitly isolated LOCAL PostgreSQL/Supabase
-- database with both versioned migrations applied, session_user postgres.
-- SET dialogo.test_database = 'isolated-local'; then run with ON_ERROR_STOP=1.
-- No HTTP/Auth calls, credentials, email delivery, or changes to hosted data.
-- The designated email below is only a synthetic SQL fixture in this rollback.
begin;

do $test$
begin
  if current_setting('dialogo.test_database', true) is distinct from 'isolated-local'
    or session_user <> 'postgres' then
    raise exception 'Requires isolated local database and postgres session';
  end if;
  if exists (select 1 from public.access_requests)
    or exists (select 1 from public.access_decisions) then
    raise exception 'Requires empty isolated fixture database';
  end if;
end;
$test$;

create function pg_temp.assert_true(result boolean, test_name text)
returns void language plpgsql as $test$
begin
  if result is distinct from true then raise exception 'Failed: %', test_name; end if;
end;
$test$;

create function pg_temp.expect_error(statement text, expected_state text, expected_message text default null)
returns void language plpgsql as $test$
declare actual_state text; actual_message text;
begin
  begin
    execute statement;
  exception when others then
    get stacked diagnostics actual_state = returned_sqlstate, actual_message = message_text;
  end;
  if actual_state is distinct from expected_state
    or (expected_message is not null and actual_message is distinct from expected_message) then
    raise exception 'Expected % / %, got % / % for %',
      expected_state, expected_message, actual_state, actual_message, statement;
  end if;
end;
$test$;

-- T01: privileges deny API writes even where a Supabase installation grants
-- broad default permissions, and bootstrap is outside the exposed schema.
do $test$
declare table_name text; role_name text; privilege_name text;
begin
  foreach table_name in array array['access_requests','access_accounts','access_works','access_grants','access_decisions'] loop
    perform pg_temp.assert_true(
      (select relrowsecurity from pg_class where oid = ('public.' || table_name)::regclass),
      'T01 RLS ' || table_name);
    foreach role_name in array array['anon','authenticated','service_role'] loop
      foreach privilege_name in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
        perform pg_temp.assert_true(not has_table_privilege(role_name,'public.' || table_name,privilege_name),
          'T01 denied ' || role_name || ' ' || privilege_name || ' ' || table_name);
      end loop;
    end loop;
    perform pg_temp.assert_true(not has_table_privilege('anon','public.' || table_name,'SELECT'), 'T01 anonymous no data');
  end loop;
  foreach role_name in array array['anon','authenticated','service_role'] loop
    perform pg_temp.assert_true(not has_function_privilege(role_name,
      'dialogo_private.bootstrap_first_administrator(uuid,text,text)','EXECUTE'), 'T01 bootstrap inaccessible');
    perform pg_temp.assert_true(not has_schema_privilege(role_name,'dialogo_private','USAGE'), 'T01 private schema inaccessible');
  end loop;
end;
$test$;

insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 ('d1a20000-0000-4000-8000-000000000001','emanuel.locchi@dialogo.com.br',
  '{"nome":"SQL designated administrator","cargo_area_informado":"Declared area","obra_referencia_informada":"Declared reference","perfil":"ADMINISTRATIVO","status_acesso":"APROVADO","email_confirmado":true}',null),
 ('d1a20000-0000-4000-8000-000000000002','fixture.b2.engineering@dialogo.com.br','{"nome":"SQL engineering"}',clock_timestamp()),
 ('d1a20000-0000-4000-8000-000000000003','fixture.b2.unconfirmed@dialogo.com.br','{"nome":"SQL unconfirmed","email_confirmado_em":"2020-01-01"}',null),
 ('d1a20000-0000-4000-8000-000000000004','fixture.b2.admin@dialogo.com.br','{"nome":"SQL second administrator"}',clock_timestamp()),
 ('d1a20000-0000-4000-8000-000000000005','fixture.b2.auditor@dialogo.com.br','{"nome":"SQL auditor"}',clock_timestamp()),
 ('d1a20000-0000-4000-8000-000000000006','fixture.b2.atomic@dialogo.com.br','{"nome":"SQL atomic failure"}',clock_timestamp());

select pg_temp.assert_true(
 (select count(*) = 6 from public.access_requests where status_acesso = 'PENDENTE_APROVACAO')
 and not exists (select 1 from public.access_accounts)
 and (select email_confirmado_em is null from public.access_requests where auth_user_id='d1a20000-0000-4000-8000-000000000001'),
 'T02 first signup and forged metadata never grant authority');

select pg_temp.expect_error($sql$select dialogo_private.bootstrap_first_administrator(
 'd1a20000-0000-4000-8000-000000000001','other@dialogo.com.br','Local fixture operator authorization')$sql$,
 '22023','designated_bootstrap_identity_required');
select pg_temp.expect_error($sql$select dialogo_private.bootstrap_first_administrator(
 'd1a20000-0000-4000-8000-000000000002','emanuel.locchi@dialogo.com.br','Local fixture operator authorization')$sql$,
 '22023','confirmed_designated_identity_required');
select pg_temp.expect_error($sql$select dialogo_private.bootstrap_first_administrator(
 'd1a20000-0000-4000-8000-000000000001','emanuel.locchi@dialogo.com.br','Local fixture operator authorization')$sql$,
 '22023','confirmed_designated_identity_required');
select pg_temp.expect_error($sql$select dialogo_private.bootstrap_first_administrator(
 'd1a20000-0000-4000-8000-000000000001','emanuel.locchi@dialogo.com.br','short')$sql$,
 '22023','deployment_reason_required');

update auth.users set email_confirmed_at = clock_timestamp()
 where id='d1a20000-0000-4000-8000-000000000001';
create temporary table original_requests as select * from public.access_requests;

select dialogo_private.bootstrap_first_administrator(
 'd1a20000-0000-4000-8000-000000000001','emanuel.locchi@dialogo.com.br',
 'Local fixture operator: SQL suite; explicit isolated bootstrap authorization');

select pg_temp.assert_true(
 (select perfil='ADMINISTRATIVO' and ativo and approved_by is null from public.access_accounts
  where auth_user_id='d1a20000-0000-4000-8000-000000000001')
 and not exists (select 1 from public.access_grants)
 and (select status_acesso='APROVADO' from public.access_requests where auth_user_id='d1a20000-0000-4000-8000-000000000001')
 and (select d.request_snapshot = to_jsonb(r) and d.grants_snapshot='[]'::jsonb
       and d.actor_auth_user_id is null and d.actor_database_role='postgres'
       and d.actor_snapshot->>'database_session_user'='postgres'
       from public.access_decisions d join original_requests r using(auth_user_id)
       where d.decision_type='BOOTSTRAP'),
 'T03 bootstrap is explicit, verified, historical, with no technical grants');

select pg_temp.assert_true(not exists (
 select 1 from original_requests o join public.access_requests r using(auth_user_id)
 where o.created_at <> r.created_at or o.nome <> r.nome or o.email <> r.email
   or o.cargo_area_informado is distinct from r.cargo_area_informado
   or o.obra_referencia_informada is distinct from r.obra_referencia_informada
 ),'T03 original declarations and creation dates survive bootstrap');
select pg_temp.expect_error($sql$select dialogo_private.bootstrap_first_administrator(
 'd1a20000-0000-4000-8000-000000000001','emanuel.locchi@dialogo.com.br','Local repeated bootstrap authorization')$sql$,
 '55000','bootstrap_already_closed');

set local role anon;
select pg_temp.assert_true(public.access_requests_schema_version()=1 and public.access_administration_schema_version()=1,
 'T04 original signup schema signal remains compatible');
select pg_temp.expect_error('select * from public.access_requests','42501');
select pg_temp.expect_error($sql$select public.create_access_work('Forbidden work')$sql$,'42501');
select pg_temp.expect_error($sql$select dialogo_private.bootstrap_first_administrator(
 'd1a20000-0000-4000-8000-000000000001','emanuel.locchi@dialogo.com.br','Client bootstrap injection')$sql$,'42501');
reset role;
set local role service_role;
select pg_temp.expect_error($sql$select dialogo_private.bootstrap_first_administrator(
 'd1a20000-0000-4000-8000-000000000001','emanuel.locchi@dialogo.com.br','Service API bootstrap injection')$sql$,'42501');
select pg_temp.expect_error('delete from public.access_decisions','42501');
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = 'd1a20000-0000-4000-8000-000000000003';
set local "request.jwt.claims" = '{"sub":"d1a20000-0000-4000-8000-000000000003","role":"authenticated","app_metadata":{"perfil":"ADMINISTRATIVO"},"user_metadata":{"status_acesso":"APROVADO","email_confirmado":true}}';
select pg_temp.assert_true(not public.is_current_access_administrator()
 and (select count(*)=1 from public.access_requests)
 and not exists(select 1 from public.access_accounts)
 and not exists(select 1 from public.access_works)
 and not exists(select 1 from public.access_decisions), 'T05 pending own-only RLS ignores forged authority metadata');
select pg_temp.expect_error($sql$update public.access_requests set status_acesso='APROVADO'$sql$,'42501');
select pg_temp.expect_error($sql$insert into public.access_accounts(auth_user_id,perfil,approved_at)
 values('d1a20000-0000-4000-8000-000000000003','ADMINISTRATIVO',now())$sql$,'42501');
select pg_temp.expect_error($sql$select public.create_access_work('Forbidden work')$sql$,'42501','active_administrator_required');
select pg_temp.expect_error($sql$select public.approve_access_request(
 'd1a20000-0000-4000-8000-000000000002','ADMINISTRATIVO',null,'[]','Unauthorized client approval')$sql$,
 '42501','active_administrator_required');
select pg_temp.expect_error($sql$select dialogo_private.bootstrap_first_administrator(
 'd1a20000-0000-4000-8000-000000000001','emanuel.locchi@dialogo.com.br','Client bootstrap injection')$sql$,'42501');

set local "request.jwt.claim.sub" = 'd1a20000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"d1a20000-0000-4000-8000-000000000001","role":"authenticated"}';
select pg_temp.assert_true(public.is_current_access_administrator()
 and (select count(*)=5 from public.access_requests)
 and not exists(select 1 from public.access_requests where auth_user_id='d1a20000-0000-4000-8000-000000000003'),
 'T06 admin queue includes confirmed pending and own request only');
select pg_temp.expect_error($sql$select public.approve_access_request(
 'd1a20000-0000-4000-8000-000000000001','ADMINISTRATIVO',null,'[]','Self approval must fail')$sql$,
 '42501','self_approval_forbidden');
select pg_temp.expect_error($sql$select public.approve_access_request(
 'd1a20000-0000-4000-8000-000000000003','ADMINISTRATIVO',null,'[]','Unconfirmed approval must fail')$sql$,
 '22023','confirmed_pending_request_required');
select pg_temp.expect_error($sql$select public.approve_access_request(
 'd1a20000-0000-4000-8000-000000000099','ADMINISTRATIVO',null,'[]','Missing target must fail')$sql$,
 '22023','confirmed_pending_request_required');
select pg_temp.expect_error($sql$select public.approve_access_request(
 'd1a20000-0000-4000-8000-000000000002','ENGENHARIA',null,'[]','Missing engineering scope')$sql$,
 '22023','invalid_engineering_scope');
select pg_temp.expect_error($sql$select public.approve_access_request(
 'd1a20000-0000-4000-8000-000000000002','SUPERADMIN',null,'[]','Invalid profile must fail')$sql$,
 '22023','invalid_access_profile');
select pg_temp.expect_error($sql$select public.approve_access_request(
 'd1a20000-0000-4000-8000-000000000002','ENGENHARIA','COORDENACAO','[]','Missing grants must fail')$sql$,
 '22023','invalid_access_grants');
select pg_temp.expect_error($sql$select public.approve_access_request(
 'd1a20000-0000-4000-8000-000000000002','ADMINISTRATIVO',null,'{}','Malformed grants must fail')$sql$,
 '22023','invalid_access_grants');
select pg_temp.expect_error($sql$select public.approve_access_request(
 'd1a20000-0000-4000-8000-000000000002','ADMINISTRATIVO',null,'[]','short')$sql$,
 '22023','decision_reason_required');
select pg_temp.expect_error($sql$select public.create_access_work(' ' )$sql$,'22023','invalid_work_name');
select set_config('dialogo.fixture_work_one',public.create_access_work('SQL isolated work A')::text,true);
select set_config('dialogo.fixture_work_two',public.create_access_work('SQL isolated work B')::text,true);
select pg_temp.expect_error($sql$select public.create_access_work(' sql isolated work a ')$sql$,'23505');

do $test$
declare target uuid := 'd1a20000-0000-4000-8000-000000000002';
        one text := current_setting('dialogo.fixture_work_one'); bad jsonb;
begin
  foreach bad in array array[
    '[null]'::jsonb, '["text"]'::jsonb, '[{}]'::jsonb,
    '[{"obra_id":"bad-uuid","modulo":"SEGURANCA"}]'::jsonb,
    jsonb_build_array(jsonb_build_object('obra_id',one,'modulo','SEGURANCA','actor','forged')),
    jsonb_build_array(jsonb_build_object('obra_id',one,'modulo','ALL')),
    jsonb_build_array(jsonb_build_object('obra_id','d1a20000-0000-4000-8000-000000000099','modulo','SEGURANCA')),
    jsonb_build_array(jsonb_build_object('obra_id',one,'modulo','SEGURANCA'),jsonb_build_object('obra_id',one,'modulo','SEGURANCA'))
  ] loop
    perform pg_temp.expect_error(format('select public.approve_access_request(%L,%L,%L,%L::jsonb,%L)',
      target,'ENGENHARIA','COORDENACAO',bad,'Invalid grant fixture must fail'),'22023');
  end loop;
  perform pg_temp.expect_error(format('select public.approve_access_request(%L,%L,null,%L::jsonb,%L)',
    target,'ADMINISTRATIVO',jsonb_build_array(jsonb_build_object('obra_id',one,'modulo','SEGURANCA')),
    'Administrative profile has no technical grants'),'22023','invalid_access_grants');
  perform pg_temp.expect_error(format('select public.approve_access_request(%L,%L,null,%L::jsonb,%L)',
    'd1a20000-0000-4000-8000-000000000005','AUDITOR_SEGURANCA',jsonb_build_array(jsonb_build_object('obra_id',one,'modulo','QUALIDADE')),
    'Auditor cannot cross discipline'),'22023','profile_module_mismatch');
end;
$test$;

-- Inconsistent reconciled data and an inactive work must fail closed even
-- though client writes cannot normally create either condition.
reset role;
update public.access_requests set email='fixture.b2.inconsistent@dialogo.com.br'
 where auth_user_id='d1a20000-0000-4000-8000-000000000005';
set local role authenticated;
select pg_temp.expect_error($sql$select public.approve_access_request(
 'd1a20000-0000-4000-8000-000000000005','ADMINISTRATIVO',null,'[]','Inconsistent target identity must fail')$sql$,
 '22023','confirmed_pending_request_required');
reset role;
update public.access_requests set email='fixture.b2.auditor@dialogo.com.br'
 where auth_user_id='d1a20000-0000-4000-8000-000000000005';
update public.access_works set ativo=false where id=current_setting('dialogo.fixture_work_one')::uuid;
set local role authenticated;
select pg_temp.expect_error($sql$select public.approve_access_request(
 'd1a20000-0000-4000-8000-000000000005','AUDITOR_SEGURANCA',null,
 jsonb_build_array(jsonb_build_object('obra_id',current_setting('dialogo.fixture_work_one'),'modulo','SEGURANCA')),
 'Inactive work cannot receive a grant')$sql$,'22023','active_work_required');
reset role;
update public.access_works set ativo=true where id=current_setting('dialogo.fixture_work_one')::uuid;
set local role authenticated;

-- T07: grant two exact tuples; the two other Cartesian combinations stay absent.
select public.approve_access_request('d1a20000-0000-4000-8000-000000000002','ENGENHARIA','COORDENACAO',
 jsonb_build_array(
  jsonb_build_object('obra_id',current_setting('dialogo.fixture_work_one'),'modulo','SEGURANCA'),
  jsonb_build_object('obra_id',current_setting('dialogo.fixture_work_two'),'modulo','QUALIDADE')),
 'SQL operator approval with precisely two independent tuples');
select public.approve_access_request('d1a20000-0000-4000-8000-000000000004','ADMINISTRATIVO',null,'[]',
 'SQL operator approval for a future genuine administrator');
select pg_temp.assert_true(
 (select count(*)=2 from public.access_grants where auth_user_id='d1a20000-0000-4000-8000-000000000002')
 and not exists(select 1 from public.access_grants where auth_user_id='d1a20000-0000-4000-8000-000000000004')
 and not exists(select 1 from public.access_grants where auth_user_id='d1a20000-0000-4000-8000-000000000002'
   and ((obra_id=current_setting('dialogo.fixture_work_one')::uuid and modulo='QUALIDADE')
     or (obra_id=current_setting('dialogo.fixture_work_two')::uuid and modulo='SEGURANCA')))
 and (select actor_auth_user_id='d1a20000-0000-4000-8000-000000000001'::uuid
       and actor_snapshot->>'email'='emanuel.locchi@dialogo.com.br'
       and request_snapshot->>'status_acesso'='PENDENTE_APROVACAO'
       and grants_snapshot->0->>'obra_nome'='SQL isolated work A'
       from public.access_decisions where auth_user_id='d1a20000-0000-4000-8000-000000000002'),
 'T07 exact scope, original snapshot and trusted actor');
select pg_temp.expect_error($sql$select public.approve_access_request(
 'd1a20000-0000-4000-8000-000000000002','ADMINISTRATIVO',null,'[]','Repeat may not overwrite access')$sql$,
 '22023','confirmed_pending_request_required');

-- T08: inject failure AFTER decisions/accounts/grants were inserted, at the
-- final request update; every prior write must roll back together.
reset role;
create function pg_temp.fail_final_approval_update() returns trigger language plpgsql as $test$
begin
 if new.auth_user_id='d1a20000-0000-4000-8000-000000000006' then
   raise exception using errcode='P0099', message='injected_final_update_failure';
 end if;
 return new;
end;
$test$;
create trigger test_fail_final_approval before update on public.access_requests
 for each row execute function pg_temp.fail_final_approval_update();
set local role authenticated;
select pg_temp.expect_error($sql$select public.approve_access_request(
 'd1a20000-0000-4000-8000-000000000006','AUDITOR_SEGURANCA',null,
 jsonb_build_array(jsonb_build_object('obra_id',current_setting('dialogo.fixture_work_one'),'modulo','SEGURANCA')),
 'Injected failure must roll all state back')$sql$,'P0099','injected_final_update_failure');
select pg_temp.assert_true(
 not exists(select 1 from public.access_accounts where auth_user_id='d1a20000-0000-4000-8000-000000000006')
 and not exists(select 1 from public.access_grants where auth_user_id='d1a20000-0000-4000-8000-000000000006')
 and not exists(select 1 from public.access_decisions where auth_user_id='d1a20000-0000-4000-8000-000000000006')
 and (select status_acesso='PENDENTE_APROVACAO' from public.access_requests where auth_user_id='d1a20000-0000-4000-8000-000000000006'),
 'T08 failure is atomic including decision history');
reset role;
drop trigger test_fail_final_approval on public.access_requests;

-- T09: even owner-level routine SQL cannot rewrite or delete decision rows.
select pg_temp.expect_error($sql$update public.access_decisions set reason='Rewrite historical actor authorization'$sql$,
 '55000','access_history_is_immutable');
select pg_temp.expect_error('delete from public.access_decisions','55000','access_history_is_immutable');
select pg_temp.expect_error('truncate public.access_decisions','55000','access_history_is_immutable');
do $test$
begin
  begin
    delete from auth.users where id='d1a20000-0000-4000-8000-000000000001';
    raise exception 'T09 referenced Auth identity was deleted';
  exception when restrict_violation or foreign_key_violation then null;
  end;
end;
$test$;

-- Auth metadata remains declarative. Later metadata sync cannot reset approval,
-- change actual profile/grants, or rewrite the immutable original snapshot.
update auth.users set raw_user_meta_data=raw_user_meta_data ||
 '{"nome":"Later declared name","perfil":"ADMINISTRATIVO","status_acesso":"PENDENTE_APROVACAO","grants":["ALL"]}'::jsonb
 where id='d1a20000-0000-4000-8000-000000000002';
select pg_temp.assert_true(
 (select status_acesso='APROVADO' from public.access_requests where auth_user_id='d1a20000-0000-4000-8000-000000000002')
 and (select perfil='ENGENHARIA' from public.access_accounts where auth_user_id='d1a20000-0000-4000-8000-000000000002')
 and (select count(*)=2 from public.access_grants where auth_user_id='d1a20000-0000-4000-8000-000000000002')
 and (select request_snapshot->>'nome'='SQL engineering' from public.access_decisions where auth_user_id='d1a20000-0000-4000-8000-000000000002'),
 'T09 later Auth metadata preserves effective access and decision history');

set local role authenticated;
set local "request.jwt.claim.sub" = 'd1a20000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"d1a20000-0000-4000-8000-000000000002","role":"authenticated"}';
select pg_temp.assert_true(not public.is_current_access_administrator()
 and public.is_current_access_active()
 and (select count(*)=1 from public.access_accounts)
 and (select count(*)=2 from public.access_grants)
 and (select count(*)=2 from public.access_works)
 and not exists(select 1 from public.access_decisions), 'T10 approved nonadmin reads only own authorized scope');
select pg_temp.expect_error('update public.access_accounts set ativo=true','42501');
select pg_temp.expect_error('delete from public.access_grants','42501');
select pg_temp.expect_error('delete from public.access_decisions','42501');

-- T11: same open session loses privileges on the next operation. Database-side
-- state changes here simulate revocation; no production revoke UI is claimed.
reset role;
update public.access_accounts set ativo=false where auth_user_id='d1a20000-0000-4000-8000-000000000002';
set local role authenticated;
select pg_temp.assert_true(not public.is_current_access_active()
 and not exists(select 1 from public.access_grants)
 and not exists(select 1 from public.access_works)
 and (select count(*)=1 from public.access_accounts), 'T11 revoked identity loses scoped reads in existing session');
reset role;
update public.access_accounts set ativo=false where perfil='ADMINISTRATIVO';
set local role authenticated;
set local "request.jwt.claim.sub" = 'd1a20000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"d1a20000-0000-4000-8000-000000000001","role":"authenticated"}';
select pg_temp.assert_true(not public.is_current_access_administrator()
 and (select count(*)=1 from public.access_requests)
 and not exists(select 1 from public.access_decisions),'T11 revoked admin loses pending queue and history');
select pg_temp.expect_error($sql$select public.create_access_work('Revoked admin work')$sql$,'42501','active_administrator_required');
select pg_temp.expect_error($sql$select public.approve_access_request(
 'd1a20000-0000-4000-8000-000000000005','ADMINISTRATIVO',null,'[]','Revoked admin cannot approve')$sql$,
 '42501','active_administrator_required');
reset role;
select pg_temp.expect_error($sql$select dialogo_private.bootstrap_first_administrator(
 'd1a20000-0000-4000-8000-000000000001','emanuel.locchi@dialogo.com.br','Revocation cannot reopen bootstrap')$sql$,
 '55000','bootstrap_already_closed');

-- T12: actual Auth confirmation/banning/deletion, never user claims, controls
-- active administrative access in a previously authenticated session.
update public.access_accounts set ativo=true where auth_user_id='d1a20000-0000-4000-8000-000000000001';
update auth.users set email_confirmed_at=null where id='d1a20000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.assert_true(not public.is_current_access_administrator(), 'T12 confirmation removal blocks admin');
select pg_temp.expect_error($sql$select public.create_access_work('Unconfirmed admin work')$sql$,'42501','active_administrator_required');
reset role;
update auth.users set email_confirmed_at=clock_timestamp(), banned_until=clock_timestamp()+interval '1 day'
 where id='d1a20000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.assert_true(not public.is_current_access_administrator(), 'T12 banned Auth identity blocks admin');
reset role;
update auth.users set banned_until=null, deleted_at=clock_timestamp() where id='d1a20000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.assert_true(not public.is_current_access_administrator(), 'T12 soft-deleted Auth identity blocks admin');
reset role;

-- T13: database-administrator identity check remains effective even if an
-- operator accidentally grants API schema usage/function execution later.
grant usage on schema dialogo_private to authenticated,service_role;
grant execute on function dialogo_private.bootstrap_first_administrator(uuid,text,text) to authenticated,service_role;
set local role authenticated;
select pg_temp.expect_error($sql$select dialogo_private.bootstrap_first_administrator(
 'd1a20000-0000-4000-8000-000000000001','emanuel.locchi@dialogo.com.br','API role cannot masquerade as definer owner')$sql$,
 '42501','database_administrator_session_required');
reset role;
set local role service_role;
select pg_temp.expect_error($sql$select dialogo_private.bootstrap_first_administrator(
 'd1a20000-0000-4000-8000-000000000001','emanuel.locchi@dialogo.com.br','Service API cannot masquerade as definer owner')$sql$,
 '42501','database_administrator_session_required');
reset role;

-- The transaction rolls back fixtures, temporary privileges and injected code.
-- True multi-connection races and live GoTrue/browser behavior require their
-- own integration environment; this suite does not claim to exercise them.
rollback;

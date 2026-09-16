-- B.10 isolated PostgreSQL suite. Never execute against a hosted database.
begin;
do $test$
begin
  if current_setting('dialogo.test_database', true) is distinct from 'isolated-local'
    or session_user <> 'postgres' or exists (select 1 from auth.users) then
    raise exception 'Requires empty, disposable local database and postgres session';
  end if;
end;
$test$;
create function pg_temp.assert_true(result boolean, test_name text)
returns void language plpgsql as $test$
begin
  if result is distinct from true then raise exception 'Failed: %', test_name; end if;
end;
$test$;
create function pg_temp.expect_error(statement text, expected_state text)
returns void language plpgsql as $test$
declare actual_state text;
begin
  begin execute statement;
  exception when others then get stacked diagnostics actual_state=returned_sqlstate;
  end;
  if actual_state is distinct from expected_state then
    raise exception 'Expected %, got % for %', expected_state, actual_state, statement;
  end if;
end;
$test$;
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 ('13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br','{"nome":"SQL B10 admin"}',clock_timestamp()),
 ('d1a50000-0000-4000-8000-000000000002','fixture.b10.auditor@dialogo.com.br','{"nome":"SQL B10 auditor"}',clock_timestamp());
select dialogo_private.bootstrap_first_administrator('13044e3f-e8d2-4b4b-9981-22a8de22c610',
 'emanuel.locchi@dialogo.com.br','Synthetic local bootstrap for work team suite');
insert into public.access_works(id,nome,created_by) values
 ('d1a50000-0000-4000-8000-000000000101','SQL B10 original work','13044e3f-e8d2-4b4b-9981-22a8de22c610');
set local role authenticated;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select public.approve_access_request_v2('d1a50000-0000-4000-8000-000000000002',array['AUDITOR_SEGURANCA'],null,
 '[{"perfil":"AUDITOR_SEGURANCA","obra_id":"d1a50000-0000-4000-8000-000000000101","modulo":"SEGURANCA"}]',
 'Synthetic local auditor grant for work team suite');
reset role;
commit;

-- MIGRATION_UPGRADE_BOUNDARY

begin;
create function pg_temp.work_payload(p_name text)
returns jsonb language sql as $test$
  select jsonb_build_object(
    'nome',p_name,'logradouro','','numero','','complemento','','bairro','','cidade','',
    'uf','','cep','','responsavel_tecnico','','registro_tecnico','','coordenacao','',
    'observacoes','','equipe_obra','[]'::jsonb);
$test$;
select pg_temp.assert_true(
 not has_function_privilege('anon','public.create_access_work_with_team(jsonb,uuid[])','EXECUTE')
 and has_function_privilege('authenticated','public.create_access_work_with_team(jsonb,uuid[])','EXECUTE')
 and not has_table_privilege('authenticated','public.work_team_links','INSERT,UPDATE,DELETE')
 and (select relrowsecurity from pg_class where oid='public.work_team_links'::regclass)
 and not exists (select 1 from public.work_team_links),
 'B10 migration does not modify existing accounts or grants');
set local role authenticated;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select set_config('dialogo.b10.new_work', public.create_access_work_with_team(
 pg_temp.work_payload('SQL B10 assigned work'),
 array['d1a50000-0000-4000-8000-000000000002']::uuid[])::text,true);
select pg_temp.assert_true(
 (select count(*)=1 from public.work_team_links where obra_id=current_setting('dialogo.b10.new_work')::uuid
   and auth_user_id='d1a50000-0000-4000-8000-000000000002')
 and (select count(*)=1 from public.access_grants where obra_id=current_setting('dialogo.b10.new_work')::uuid
   and auth_user_id='d1a50000-0000-4000-8000-000000000002' and perfil='AUDITOR_SEGURANCA' and modulo='SEGURANCA')
 and (select count(*)=1 from public.access_decisions where decision_type='VINCULO_OBRA'
   and auth_user_id='d1a50000-0000-4000-8000-000000000002'),
 'B10 assigns only the already authorized profile/module and records the decision');
select pg_temp.assert_true(
 (public.update_access_work_with_team(current_setting('dialogo.b10.new_work')::uuid,0,
   pg_temp.work_payload('SQL B10 assigned work'),array[]::uuid[]) ->> 'team_changed')::boolean,
 'B10 removing the member changes team links');
select pg_temp.assert_true(
 not exists (select 1 from public.work_team_links where obra_id=current_setting('dialogo.b10.new_work')::uuid)
 and not exists (select 1 from public.access_grants where obra_id=current_setting('dialogo.b10.new_work')::uuid)
 and (select count(*)=1 from public.access_grants where obra_id='d1a50000-0000-4000-8000-000000000101')
 and (select count(*)=1 from public.access_decisions where decision_type='DESVINCULO_OBRA'),
 'B10 revokes only the grant created by the link and preserves previous access');
select pg_temp.assert_true(
 (public.update_access_work_with_team('d1a50000-0000-4000-8000-000000000101',0,
   pg_temp.work_payload('SQL B10 original work'),
   array['d1a50000-0000-4000-8000-000000000002']::uuid[]) ->> 'team_changed')::boolean,
 'B10 links a person who already had access to the work');
select pg_temp.assert_true(
 (public.update_access_work_with_team('d1a50000-0000-4000-8000-000000000101',0,
   pg_temp.work_payload('SQL B10 original work'),array[]::uuid[]) ->> 'team_changed')::boolean,
 'B10 removes that link');
select pg_temp.assert_true(
 (select count(*)=1 from public.access_grants where obra_id='d1a50000-0000-4000-8000-000000000101')
 and not exists (select 1 from public.work_team_links where obra_id='d1a50000-0000-4000-8000-000000000101'),
 'B10 unlink preserves access originally granted at approval');
select pg_temp.expect_error($sql$select public.create_access_work_with_team(
 pg_temp.work_payload('SQL B10 invalid member'),
 array['00000000-0000-4000-8000-000000000001']::uuid[])$sql$,'22023');
reset role;
select pg_temp.assert_true(not exists (select 1 from public.access_works where nome='SQL B10 invalid member'),
 'B10 invalid member rolls back entire new work');
set local role authenticated;
set local "request.jwt.claim.sub"='d1a50000-0000-4000-8000-000000000002';
select pg_temp.expect_error($sql$select public.create_access_work_with_team(
 pg_temp.work_payload('SQL B10 forbidden work'),array[]::uuid[])$sql$,'42501');
rollback;

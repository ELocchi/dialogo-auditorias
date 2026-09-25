-- Isolated regression for the read-only Engineering coordination agenda.
begin;
do $test$ begin
  if current_setting('dialogo.test_database',true) is distinct from 'isolated-local'
    or session_user <> 'postgres' or exists (select 1 from auth.users) then
    raise exception 'Requires empty disposable local database';
  end if;
end $test$;
create function pg_temp.assert_true(result boolean,label text)
returns void language plpgsql as $test$
begin if result is distinct from true then raise exception 'Failed: %',label; end if; end $test$;
create function pg_temp.expect_error(statement text,expected_code text)
returns void language plpgsql as $test$
declare received text;
begin
  begin execute statement;
  exception when others then
    get stacked diagnostics received = returned_sqlstate;
    if received = expected_code then return; end if;
    raise exception 'Expected SQLSTATE %, got %: %',expected_code,received,sqlerrm;
  end;
  raise exception 'Expected SQLSTATE %, statement succeeded: %',expected_code,statement;
end $test$;

insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 ('13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br','{"nome":"Agenda admin"}',clock_timestamp()),
 ('d1ac0000-0000-4000-8000-000000000002','coordination.auditor@dialogo.com.br','{"nome":"Agenda auditor"}',clock_timestamp()),
 ('d1ac0000-0000-4000-8000-000000000003','coordination.engineering@dialogo.com.br','{"nome":"Agenda coordination"}',clock_timestamp());
select dialogo_private.bootstrap_first_administrator('13044e3f-e8d2-4b4b-9981-22a8de22c610',
 'emanuel.locchi@dialogo.com.br','Isolated coordination agenda bootstrap');
update public.access_accounts set atuacao_administrativa='GERAL'
  where auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610';
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
insert into public.access_works(id,nome,created_by) values
 ('d1ac0000-0000-4000-8000-000000000101','Coordination work','13044e3f-e8d2-4b4b-9981-22a8de22c610');
set local role authenticated;
select public.approve_access_request_v3('d1ac0000-0000-4000-8000-000000000002',array['AUDITOR_SEGURANCA'],null,null,
 '[{"perfil":"AUDITOR_SEGURANCA","obra_id":"d1ac0000-0000-4000-8000-000000000101","modulo":"SEGURANCA"}]',
 'Synthetic auditor for coordination agenda');
select public.approve_access_request_v3('d1ac0000-0000-4000-8000-000000000003',array['ENGENHARIA'],'COORDENACAO',null,
 '[{"perfil":"ENGENHARIA","obra_id":"d1ac0000-0000-4000-8000-000000000101","modulo":"SEGURANCA"},
   {"perfil":"ENGENHARIA","obra_id":"d1ac0000-0000-4000-8000-000000000101","modulo":"QUALIDADE"}]',
 'Synthetic Engineering coordination agenda');
select set_config('dialogo.test.coordination_visit',public.create_audit_visit('d1ac0000-0000-4000-8000-000000000201',
 'd1ac0000-0000-4000-8000-000000000101','SEGURANCA','security-it07-r02',
 'd1ac0000-0000-4000-8000-000000000002','2030-03-10','Visible to coordination')::text,true);

set local "request.jwt.claim.sub"='d1ac0000-0000-4000-8000-000000000003';
select pg_temp.assert_true(
  jsonb_array_length(public.read_audit_agenda('ENGENHARIA','COORDENACAO')->'visits')=1
  and public.read_audit_agenda('ENGENHARIA','COORDENACAO')->'visits'->0->>'workName'='Coordination work'
  and public.read_audit_agenda('ENGENHARIA','COORDENACAO')->'auditors'='[]'::jsonb,
  'Coordination reads scheduled visits only inside its exact work and discipline');
select pg_temp.expect_error($sql$select public.read_audit_agenda('ENGENHARIA','EQUIPE_OBRA')$sql$,'42501');
select pg_temp.expect_error($sql$select public.delete_audit_visit(
 'd1ac0000-0000-4000-8000-000000000202',current_setting('dialogo.test.coordination_visit')::uuid,1)$sql$,'42501');
select pg_temp.expect_error($sql$select public.confirm_audit_visit(
 'd1ac0000-0000-4000-8000-000000000203',current_setting('dialogo.test.coordination_visit')::uuid,1)$sql$,'42501');

reset role;
rollback;

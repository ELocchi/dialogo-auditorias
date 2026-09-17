-- B.14 isolated PostgreSQL suite. Never execute against a hosted database.
begin;
do $test$ begin
  if current_setting('dialogo.test_database', true) is distinct from 'isolated-local'
    or session_user <> 'postgres' or exists (select 1 from auth.users) then
    raise exception 'Requires empty disposable local database';
  end if;
end $test$;
create function pg_temp.assert_true(result boolean, label text)
returns void language plpgsql as $test$
begin
  if result is distinct from true then raise exception 'Failed: %', label; end if;
end $test$;
create function pg_temp.expect_error(statement text, expected_code text)
returns void language plpgsql as $test$
declare received text;
begin
  begin execute statement;
  exception when others then
    get stacked diagnostics received = returned_sqlstate;
    if received = expected_code then return; end if;
    raise exception 'Expected SQLSTATE %, got %', expected_code, received;
  end;
  raise exception 'Expected SQLSTATE %, statement succeeded', expected_code;
end $test$;
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 ('13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br','{"nome":"General fixture"}',clock_timestamp()),
 ('d1a80000-0000-4000-8000-000000000002','safety.admin@dialogo.com.br','{"nome":"Safety admin"}',clock_timestamp()),
 ('d1a80000-0000-4000-8000-000000000003','quality.admin@dialogo.com.br','{"nome":"Quality admin"}',clock_timestamp()),
 ('d1a80000-0000-4000-8000-000000000004','safety.auditor@dialogo.com.br','{"nome":"Safety auditor"}',clock_timestamp()),
 ('d1a80000-0000-4000-8000-000000000005','quality.auditor@dialogo.com.br','{"nome":"Quality auditor"}',clock_timestamp());
select dialogo_private.bootstrap_first_administrator('13044e3f-e8d2-4b4b-9981-22a8de22c610',
 'emanuel.locchi@dialogo.com.br','Synthetic bootstrap for administrative scopes');
insert into public.access_works(id,nome,created_by) values
 ('d1a80000-0000-4000-8000-000000000101','B14 work fixture','13044e3f-e8d2-4b4b-9981-22a8de22c610');
commit;

-- MIGRATION_UPGRADE_BOUNDARY

begin;
select pg_temp.assert_true(
 (select atuacao_administrativa='GERAL' from public.access_accounts
   where auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610')
 and not has_function_privilege('authenticated','public.approve_access_request_v2(uuid,text[],text,jsonb,text)','EXECUTE')
 and has_function_privilege('authenticated','public.approve_access_request_v3(uuid,text[],text,text,jsonb,text)','EXECUTE'),
 'existing administrators are General and the obsolete approval endpoint is revoked');
set local role authenticated;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select public.approve_access_request_v3('d1a80000-0000-4000-8000-000000000002',array['ADMINISTRATIVO'],null,
 'SEGURANCA','[]','Assign Safety administrative work only');
select public.approve_access_request_v3('d1a80000-0000-4000-8000-000000000003',array['ADMINISTRATIVO'],null,
 'QUALIDADE','[]','Assign Quality administrative work only');
select public.approve_access_request_v3('d1a80000-0000-4000-8000-000000000004',array['AUDITOR_SEGURANCA'],null,
 null,'[{"perfil":"AUDITOR_SEGURANCA","obra_id":"d1a80000-0000-4000-8000-000000000101","modulo":"SEGURANCA"}]',
 'Assign Safety auditor for fixture work');
select public.approve_access_request_v3('d1a80000-0000-4000-8000-000000000005',array['AUDITOR_QUALIDADE'],null,
 null,'[{"perfil":"AUDITOR_QUALIDADE","obra_id":"d1a80000-0000-4000-8000-000000000101","modulo":"QUALIDADE"}]',
 'Assign Quality auditor for fixture work');
select pg_temp.assert_true(
 (select atuacao_administrativa='SEGURANCA' from public.access_accounts where auth_user_id='d1a80000-0000-4000-8000-000000000002')
 and (select atuacao_administrativa='QUALIDADE' from public.access_accounts where auth_user_id='d1a80000-0000-4000-8000-000000000003'),
 'specialist assignments and every approval decision are recorded atomically');
reset role;
select pg_temp.assert_true((select count(*)=4 from dialogo_private.administrative_scope_decisions),
 'each assignment has an immutable decision record');
set local role authenticated;
set local "request.jwt.claim.sub"='d1a80000-0000-4000-8000-000000000002';
select pg_temp.assert_true(public.has_current_administrative_module('SEGURANCA')
 and not public.has_current_administrative_module('QUALIDADE')
 and not public.is_current_access_administrator(), 'Safety has only its discipline and no platform authority');
select pg_temp.expect_error($sql$select public.read_administrative_scope_history()$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_audit_catalog_document('quality-f175',false,null)$sql$,'42501');
select pg_temp.expect_error($sql$select public.list_authorized_visit_auditors(
 'd1a80000-0000-4000-8000-000000000101','QUALIDADE')$sql$,'42501');
select pg_temp.expect_error($sql$select public.save_audit_catalog_revision(
 'd1a80000-0000-4000-8000-000000000210','quality-f175',0,'R1','Unauthorized',
 '[]'::jsonb,null,null,null,null)$sql$,'42501');
select pg_temp.expect_error($sql$select public.create_access_work('Forbidden specialist work')$sql$,'42501');
select pg_temp.expect_error($sql$select public.approve_access_request_v3(
 'd1a80000-0000-4000-8000-000000000006',array['ADMINISTRATIVO'],null,'GERAL','[]','Unauthorized approval')$sql$,'42501');
select pg_temp.expect_error($sql$select public.create_audit_visit(
 'd1a80000-0000-4000-8000-000000000201','d1a80000-0000-4000-8000-000000000101',
 'QUALIDADE','quality-f175','d1a80000-0000-4000-8000-000000000005',date '2030-03-01','')$sql$,'42501');
select set_config('dialogo.b14.safety',public.create_audit_visit(
 'd1a80000-0000-4000-8000-000000000202','d1a80000-0000-4000-8000-000000000101',
 'SEGURANCA','security-it07-r02','d1a80000-0000-4000-8000-000000000004',date '2030-03-02','')::text,true);
select pg_temp.assert_true(jsonb_array_length(public.read_audit_agenda('ADMINISTRATIVO',null)->'visits')=1
 and jsonb_array_length(public.read_audit_agenda('ADMINISTRATIVO',null)->'auditors')=1,
 'Safety administration sees only Safety visits and professionals');
reset role;
set local role authenticated;
set local "request.jwt.claim.sub"='d1a80000-0000-4000-8000-000000000003';
select pg_temp.assert_true(not public.has_current_administrative_module('SEGURANCA')
 and public.has_current_administrative_module('QUALIDADE')
 and jsonb_array_length(public.read_audit_agenda('ADMINISTRATIVO',null)->'visits')=0,
 'Quality administration cannot read a Safety visit');
select pg_temp.expect_error($sql$select public.read_audit_catalog_document('security-it07-r02',false,null)$sql$,'42501');
select set_config('dialogo.b14.quality',public.create_work_follow_up_visit(
 'd1a80000-0000-4000-8000-000000000203','d1a80000-0000-4000-8000-000000000101',
 'QUALIDADE','d1a80000-0000-4000-8000-000000000005',date '2030-03-03','')::text,true);
select pg_temp.expect_error($sql$select public.delete_audit_visit(
 'd1a80000-0000-4000-8000-000000000204',current_setting('dialogo.b14.safety')::uuid,1)$sql$,'42501');
select pg_temp.assert_true(jsonb_array_length(public.read_audit_agenda('ADMINISTRATIVO',null)->'visits')=1
 and jsonb_array_length(public.read_audit_agenda('ADMINISTRATIVO',null)->'auditors')=1,
 'Quality administration sees only Quality visits and professionals');
reset role;
set local role authenticated;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select pg_temp.assert_true(public.is_current_access_administrator()
 and jsonb_array_length(public.read_audit_agenda('ADMINISTRATIVO',null)->'visits')=2
 and jsonb_array_length(public.read_audit_agenda('ADMINISTRATIVO',null)->'auditors')=2,
 'General administration retains both disciplines and platform authority');
select pg_temp.assert_true(
  (select count(*)=4 from jsonb_each_text(public.read_administrative_scope_history())),
  'General administration can review recorded specialist decisions');
reset role;
rollback;

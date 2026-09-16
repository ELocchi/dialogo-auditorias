-- B.12 isolated PostgreSQL suite. Never execute against a hosted database.
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
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 ('13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br','{"nome":"Admin fixture"}',clock_timestamp()),
 ('d1a50000-0000-4000-8000-000000000002','fixture.followup.auditor@dialogo.com.br','{"nome":"Auditor fixture"}',clock_timestamp());
select dialogo_private.bootstrap_first_administrator('13044e3f-e8d2-4b4b-9981-22a8de22c610',
 'emanuel.locchi@dialogo.com.br','Synthetic bootstrap for follow-up suite');
insert into public.access_works(id,nome,created_by) values
 ('d1a50000-0000-4000-8000-000000000101','B12 work fixture','13044e3f-e8d2-4b4b-9981-22a8de22c610');
set local role authenticated;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select public.approve_access_request_v2('d1a50000-0000-4000-8000-000000000002',array['AUDITOR_SEGURANCA'],null,
 '[{"perfil":"AUDITOR_SEGURANCA","obra_id":"d1a50000-0000-4000-8000-000000000101","modulo":"SEGURANCA"}]',
 'Synthetic authorized auditor for follow-up suite');
select public.create_audit_visit('d1a50000-0000-4000-8000-000000000200',
 'd1a50000-0000-4000-8000-000000000101','SEGURANCA','security-it07-r02',
 'd1a50000-0000-4000-8000-000000000002',date '2030-02-19','Existing audit');
reset role;
commit;

-- MIGRATION_UPGRADE_BOUNDARY

begin;
select pg_temp.assert_true(
 not has_function_privilege('anon','public.create_work_follow_up_visit(uuid,uuid,text,uuid,date,text)','EXECUTE')
 and has_function_privilege('authenticated','public.create_work_follow_up_visit(uuid,uuid,text,uuid,date,text)','EXECUTE')
 and (select count(*)=1 from public.audit_visits where visit_kind='AUDITORIA' and modelo_id='security-it07-r02'),
 'migration preserves existing audit and adds only the intended RPC grant');
set local role authenticated;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select set_config('dialogo.b12.follow_up', public.create_work_follow_up_visit(
 'd1a50000-0000-4000-8000-000000000201',
 'd1a50000-0000-4000-8000-000000000101', 'SEGURANCA',
 'd1a50000-0000-4000-8000-000000000002', date '2030-02-20', ''
 )::text, true);
select pg_temp.assert_true(
 (select count(*)=1 from public.audit_visits where id=current_setting('dialogo.b12.follow_up')::uuid
   and visit_kind='ACOMPANHAMENTO' and modelo_id is null and confirmation_status='pending_confirmation')
 and (select count(*)=1 from jsonb_array_elements(public.read_audit_agenda('ADMINISTRATIVO',null)->'visits') v
   where v->>'id'=current_setting('dialogo.b12.follow_up') and v->>'kind'='follow_up'
     and v->'modelId'='null'::jsonb),
 'follow-up is visible as a separate visit without an audit model');
reset role;
set local role authenticated;
set local "request.jwt.claim.sub"='d1a50000-0000-4000-8000-000000000002';
select pg_temp.assert_true(
 (select count(*)=1 from jsonb_array_elements(public.read_audit_agenda('AUDITOR_SEGURANCA',null)->'visits') v
   where v->>'id'=current_setting('dialogo.b12.follow_up') and v->>'kind'='follow_up'),
 'assigned professional sees the follow-up');
select public.confirm_audit_visit('d1a50000-0000-4000-8000-000000000202',
 current_setting('dialogo.b12.follow_up')::uuid, 1);
select pg_temp.assert_true(
 (select confirmation_status='confirmed' and modelo_id is null and visit_kind='ACOMPANHAMENTO'
   from public.audit_visits where id=current_setting('dialogo.b12.follow_up')::uuid),
 'follow-up date can be confirmed without becoming an audit');
reset role;
set local role authenticated;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select public.reschedule_audit_visit('d1a50000-0000-4000-8000-000000000204',
 current_setting('dialogo.b12.follow_up')::uuid, 1, date '2030-02-22', 'New follow-up date');
select pg_temp.assert_true(
 (select data_prevista=date '2030-02-22' and revision=2 and confirmation_status='pending_confirmation'
   and modelo_id is null and visit_kind='ACOMPANHAMENTO'
   from public.audit_visits where id=current_setting('dialogo.b12.follow_up')::uuid),
 'rescheduling preserves the unscored kind and requests confirmation again');
select public.create_audit_visit('d1a50000-0000-4000-8000-000000000203',
 'd1a50000-0000-4000-8000-000000000101','SEGURANCA','security-it07-r02',
 'd1a50000-0000-4000-8000-000000000002',date '2030-02-21','');
select pg_temp.assert_true(
 (select count(*)=2 from public.audit_visits where visit_kind='AUDITORIA' and modelo_id='security-it07-r02')
 and (select count(*)=1 from public.audit_visits where visit_kind='ACOMPANHAMENTO' and modelo_id is null),
 'audit and follow-up stay distinct in persistent records');
reset role;
rollback;

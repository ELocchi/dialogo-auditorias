-- B.13 isolated PostgreSQL suite. Never execute against a hosted database.
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
  begin
    execute statement;
  exception when others then
    get stacked diagnostics received = returned_sqlstate;
    if received = expected_code then return; end if;
    raise exception 'Expected SQLSTATE %, got %', expected_code, received;
  end;
  raise exception 'Expected SQLSTATE %, statement succeeded', expected_code;
end $test$;
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 ('13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br','{"nome":"Admin fixture"}',clock_timestamp()),
 ('d1a60000-0000-4000-8000-000000000002','fixture.deleted.auditor@dialogo.com.br','{"nome":"Auditor fixture"}',clock_timestamp());
select dialogo_private.bootstrap_first_administrator('13044e3f-e8d2-4b4b-9981-22a8de22c610',
 'emanuel.locchi@dialogo.com.br','Synthetic bootstrap for deletion suite');
insert into public.access_works(id,nome,created_by) values
 ('d1a60000-0000-4000-8000-000000000101','B13 work fixture','13044e3f-e8d2-4b4b-9981-22a8de22c610');
set local role authenticated;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select public.approve_access_request_v2('d1a60000-0000-4000-8000-000000000002',array['AUDITOR_SEGURANCA'],null,
 '[{"perfil":"AUDITOR_SEGURANCA","obra_id":"d1a60000-0000-4000-8000-000000000101","modulo":"SEGURANCA"}]',
 'Synthetic authorized auditor for deletion suite');
select public.create_audit_visit('d1a60000-0000-4000-8000-000000000200',
 'd1a60000-0000-4000-8000-000000000101','SEGURANCA','security-it07-r02',
 'd1a60000-0000-4000-8000-000000000002',date '2030-02-19','Existing audit');
reset role;
commit;

-- MIGRATION_UPGRADE_BOUNDARY

begin;
create function pg_temp.reject_cancel_event()
returns trigger language plpgsql as $test$
begin
  if new.event_type='cancelled' and current_setting('dialogo.b13.reject_cancel',true)='on' then
    raise exception using errcode='P0077',message='synthetic_event_failure';
  end if;
  return new;
end $test$;
create trigger b13_reject_cancel_event before insert on public.audit_visit_events
  for each row execute function pg_temp.reject_cancel_event();
select pg_temp.assert_true(
 not has_function_privilege('anon','public.delete_audit_visit(uuid,uuid,integer)','EXECUTE')
 and has_function_privilege('authenticated','public.delete_audit_visit(uuid,uuid,integer)','EXECUTE')
 and not has_function_privilege('authenticated','public.reschedule_audit_visit(uuid,uuid,integer,date,text)','EXECUTE')
 and (select count(*)=1 from public.audit_visits where cancelled_at is null and cancelled_by is null),
 'upgrade preserves the existing visit, grants deletion and revokes rescheduling');
set local role authenticated;
set local "request.jwt.claim.sub"='d1a60000-0000-4000-8000-000000000002';
select pg_temp.expect_error($sql$
 select public.delete_audit_visit('d1a60000-0000-4000-8000-000000000201',
   (select id from public.audit_visits where visit_kind='AUDITORIA'),1)
$sql$,'42501');
select pg_temp.assert_true(jsonb_array_length(public.read_audit_agenda('AUDITOR_SEGURANCA',null)->'visits')=1,
 'assigned auditor still sees the visit before deletion');
reset role;
set local role authenticated;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select pg_temp.expect_error($sql$
 select public.delete_audit_visit('d1a60000-0000-4000-8000-000000000202',
   (select id from public.audit_visits where visit_kind='AUDITORIA'),2)
$sql$,'40001');
select set_config('dialogo.b13.audit',
 (select id::text from public.audit_visits where visit_kind='AUDITORIA'),true);
select public.delete_audit_visit('d1a60000-0000-4000-8000-000000000203',
 current_setting('dialogo.b13.audit')::uuid,1);
select public.delete_audit_visit('d1a60000-0000-4000-8000-000000000203',
 current_setting('dialogo.b13.audit')::uuid,1);
select pg_temp.assert_true(
 (select revision=2 and cancelled_at is not null and cancelled_by=auth.uid()
   from public.audit_visits where id=current_setting('dialogo.b13.audit')::uuid)
 and (select count(*)=1 from public.audit_visit_events where visit_id=current_setting('dialogo.b13.audit')::uuid
   and event_type='cancelled' and revision=2 and before_snapshot->>'cancelled_at' is null
   and after_snapshot->>'cancelled_by'=auth.uid()::text)
 and jsonb_array_length(public.read_audit_agenda('ADMINISTRATIVO',null)->'visits')=0,
 'delete is idempotent, retains one immutable event, and removes the visit from the administrative agenda');
select pg_temp.expect_error($sql$
 select public.delete_audit_visit('d1a60000-0000-4000-8000-000000000204',
   current_setting('dialogo.b13.audit')::uuid,1)
$sql$,'40001');
select pg_temp.expect_error($sql$
 select public.delete_audit_visit('d1a60000-0000-4000-8000-000000000203',
   current_setting('dialogo.b13.audit')::uuid,2)
$sql$,'22023');
select set_config('dialogo.b13.follow_up',public.create_work_follow_up_visit(
 'd1a60000-0000-4000-8000-000000000206',
 'd1a60000-0000-4000-8000-000000000101','SEGURANCA',
 'd1a60000-0000-4000-8000-000000000002',date '2030-02-20','')::text,true);
select set_config('dialogo.b13.reject_cancel','on',true);
select pg_temp.expect_error($sql$
 select public.delete_audit_visit('d1a60000-0000-4000-8000-000000000207',
   current_setting('dialogo.b13.follow_up')::uuid,1)
$sql$,'P0077');
select pg_temp.assert_true(
 (select cancelled_at is null and revision=1 from public.audit_visits
   where id=current_setting('dialogo.b13.follow_up')::uuid)
 and not exists(select 1 from public.audit_visit_events
   where visit_id=current_setting('dialogo.b13.follow_up')::uuid and event_type='cancelled'),
 'event failure rolls back the entire deletion');
select set_config('dialogo.b13.reject_cancel','off',true);
select public.delete_audit_visit('d1a60000-0000-4000-8000-000000000207',
 current_setting('dialogo.b13.follow_up')::uuid,1);
select pg_temp.assert_true(
 (select cancelled_at is not null and visit_kind='ACOMPANHAMENTO' from public.audit_visits
   where id=current_setting('dialogo.b13.follow_up')::uuid)
 and jsonb_array_length(public.read_audit_agenda('ADMINISTRATIVO',null)->'visits')=0,
 'follow-up can also be deleted without creating an audit');
reset role;
set local role authenticated;
set local "request.jwt.claim.sub"='d1a60000-0000-4000-8000-000000000002';
select pg_temp.assert_true(jsonb_array_length(public.read_audit_agenda('AUDITOR_SEGURANCA',null)->'visits')=0,
 'assigned auditor no longer sees a deleted visit or receives its notification');
select pg_temp.expect_error($sql$
 select public.confirm_audit_visit('d1a60000-0000-4000-8000-000000000205',
   current_setting('dialogo.b13.audit')::uuid,2)
$sql$,'55000');
reset role;
select pg_temp.assert_true((select confirmation_status='pending_confirmation' from public.audit_visits
 where id=current_setting('dialogo.b13.audit')::uuid), 'confirmation cannot change a deleted visit');
drop trigger b13_reject_cancel_event on public.audit_visit_events;
rollback;

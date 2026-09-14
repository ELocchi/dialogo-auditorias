-- B7 isolated PostgreSQL upgrade suite. Never run against a hosted database.
begin;
do $test$
begin
  if current_setting('dialogo.test_database',true) is distinct from 'isolated-local'
    or session_user <> 'postgres' or exists(select 1 from auth.users) then
    raise exception 'Requires empty, disposable local database and postgres session';
  end if;
end;
$test$;
create function pg_temp.assert_true(result boolean, test_name text)
returns void language plpgsql as $test$
begin
  if result is distinct from true then raise exception 'Failed: %',test_name; end if;
end;
$test$;
create function pg_temp.expect_error(statement text, expected_state text, expected_message text default null)
returns void language plpgsql as $test$
declare actual_state text; actual_message text;
begin
  begin execute statement;
  exception when others then
    get stacked diagnostics actual_state=returned_sqlstate,actual_message=message_text;
  end;
  if actual_state is distinct from expected_state
    or (expected_message is not null and actual_message is distinct from expected_message) then
    raise exception 'Expected % / %, got % / % for %',expected_state,expected_message,actual_state,actual_message,statement;
  end if;
end;
$test$;
create function pg_temp.b7_state() returns jsonb language sql as $test$
  select jsonb_build_object(
    'auth',(select jsonb_agg(to_jsonb(u) order by id) from auth.users u),
    'requests',(select jsonb_agg(to_jsonb(r) order by auth_user_id) from public.access_requests r),
    'accounts',(select jsonb_agg(to_jsonb(a) order by auth_user_id) from public.access_accounts a),
    'works',(select jsonb_agg(to_jsonb(w) order by id) from public.access_works w),
    'grants',(select jsonb_agg(to_jsonb(g) order by auth_user_id,perfil,obra_id,modulo) from public.access_grants g),
    'decisions',(select jsonb_agg(to_jsonb(d) order by id) from public.access_decisions d));
$test$;
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 ('13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br','{"nome":"SQL B7 admin"}',clock_timestamp()),
 ('d1a70000-0000-4000-8000-000000000002','fixture.b7.dual@dialogo.com.br','{"nome":"SQL B7 dual auditor"}',clock_timestamp()),
 ('d1a70000-0000-4000-8000-000000000003','fixture.b7.other@dialogo.com.br','{"nome":"SQL B7 other auditor"}',clock_timestamp()),
 ('d1a70000-0000-4000-8000-000000000004','fixture.b7.site@dialogo.com.br','{"nome":"SQL B7 site team"}',clock_timestamp()),
 ('d1a70000-0000-4000-8000-000000000005','fixture.b7.pending@dialogo.com.br','{"nome":"SQL B7 pending"}',clock_timestamp()),
 ('d1a70000-0000-4000-8000-000000000006','fixture.b7.coord@dialogo.com.br','{"nome":"SQL B7 coordination"}',clock_timestamp());
select dialogo_private.bootstrap_first_administrator('13044e3f-e8d2-4b4b-9981-22a8de22c610',
 'emanuel.locchi@dialogo.com.br','Synthetic local bootstrap for audit agenda suite');
insert into public.access_works(id,nome,created_by) values
 ('d1a70000-0000-4000-8000-000000000101','SQL B7 work alpha','13044e3f-e8d2-4b4b-9981-22a8de22c610'),
 ('d1a70000-0000-4000-8000-000000000102','SQL B7 work beta','13044e3f-e8d2-4b4b-9981-22a8de22c610');
set local role authenticated;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select public.approve_access_request_v2('d1a70000-0000-4000-8000-000000000002',array['AUDITOR_SEGURANCA','AUDITOR_QUALIDADE'],null,
 '[{"perfil":"AUDITOR_SEGURANCA","obra_id":"d1a70000-0000-4000-8000-000000000101","modulo":"SEGURANCA"},
   {"perfil":"AUDITOR_QUALIDADE","obra_id":"d1a70000-0000-4000-8000-000000000102","modulo":"QUALIDADE"}]','Synthetic scoped dual auditor');
select public.approve_access_request_v2('d1a70000-0000-4000-8000-000000000003',array['AUDITOR_SEGURANCA'],null,
 '[{"perfil":"AUDITOR_SEGURANCA","obra_id":"d1a70000-0000-4000-8000-000000000101","modulo":"SEGURANCA"}]','Synthetic other auditor');
select public.approve_access_request_v2('d1a70000-0000-4000-8000-000000000004',array['ENGENHARIA'],'EQUIPE_OBRA',
 '[{"perfil":"ENGENHARIA","obra_id":"d1a70000-0000-4000-8000-000000000101","modulo":"SEGURANCA"}]','Synthetic site engineering');
select public.approve_access_request_v2('d1a70000-0000-4000-8000-000000000006',array['ENGENHARIA'],'COORDENACAO',
 '[{"perfil":"ENGENHARIA","obra_id":"d1a70000-0000-4000-8000-000000000101","modulo":"SEGURANCA"}]','Synthetic engineering coordination');
reset role;
set local "request.jwt.claim.sub"='';
create temporary table b7_before as select pg_temp.b7_state() payload;
commit;

-- MIGRATION_UPGRADE_BOUNDARY

begin;
select pg_temp.assert_true(pg_temp.b7_state()=(select payload from b7_before)
 and not exists(select 1 from public.audit_visits)
 and not exists(select 1 from public.audit_visit_events)
 and not exists(select 1 from dialogo_private.audit_visit_operations),
 'A01 migration preserves all existing identity, work and access state and seeds no visits');
do $test$
declare r text; f text;
begin
  foreach r in array array['anon','authenticated','service_role'] loop
    perform pg_temp.assert_true(not has_table_privilege(r,'public.audit_visits','INSERT,UPDATE,DELETE,TRUNCATE')
      and not has_table_privilege(r,'public.audit_visit_events','INSERT,UPDATE,DELETE,TRUNCATE')
      and not has_table_privilege(r,'dialogo_private.audit_visit_operations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),
      'A02 API roles cannot directly mutate visits/events or read operation payloads');
    foreach f in array array['public.read_audit_agenda(text,text)',
      'public.create_audit_visit(uuid,uuid,text,text,uuid,date,text)',
      'public.reschedule_audit_visit(uuid,uuid,integer,date,text)','public.confirm_audit_visit(uuid,uuid,integer)',
      'public.list_authorized_visit_auditors(uuid,text)'] loop
      perform pg_temp.assert_true(has_function_privilege(r,f,'EXECUTE')=(r='authenticated'),
        'A03 only authenticated API role executes agenda RPCs');
    end loop;
  end loop;
end;
$test$;
select pg_temp.assert_true((select bool_and(relrowsecurity) from pg_class
 where oid in ('public.audit_visits'::regclass,'public.audit_visit_events'::regclass,'dialogo_private.audit_visit_operations'::regclass)),
 'A04 operational tables have RLS enabled');
create function pg_temp.b7_create(p_request integer default 11, p_date date default date '2026-09-15',p_note text default 'Original schedule')
returns uuid language sql as $test$
  select public.create_audit_visit(('d1a70000-0000-4000-8000-'||lpad(p_request::text,12,'0'))::uuid,
    'd1a70000-0000-4000-8000-000000000101','SEGURANCA','security-it07-r02',
    'd1a70000-0000-4000-8000-000000000002',p_date,p_note);
$test$;
create function pg_temp.b7_visit() returns uuid language sql as $test$
  select id from public.audit_visits where auditor_auth_user_id='d1a70000-0000-4000-8000-000000000002' and modulo='SEGURANCA';
$test$;
set local role authenticated;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select pg_temp.assert_true(public.read_audit_agenda('ADMINISTRATIVO')->'visits'='[]'::jsonb
 and jsonb_array_length(public.read_audit_agenda('ADMINISTRATIVO')->'auditors')=3
 and jsonb_array_length(public.list_authorized_visit_auditors('d1a70000-0000-4000-8000-000000000101','SEGURANCA'))=2
 and public.list_authorized_visit_auditors('d1a70000-0000-4000-8000-000000000101','QUALIDADE')='[]'::jsonb,
 'A05 actual approved auditor names and exact discipline/work grants, including dual profiles');
select pg_temp.b7_create();
select pg_temp.assert_true(pg_temp.b7_create()=pg_temp.b7_visit()
 and (select count(*)=1 from public.audit_visits) and (select count(*)=1 from public.audit_visit_events)
 and (select revision=1 and confirmation_status='pending_confirmation' and confirmed_at is null
   and created_by=auth.uid() from public.audit_visits where id=pg_temp.b7_visit()),
 'A06 create is persisted once, initially pending, with server actor and durable retry idempotency');
select pg_temp.expect_error($sql$select pg_temp.b7_create(11,'2026-09-16')$sql$,'22023','visit_request_id_reused');
select pg_temp.expect_error($sql$select pg_temp.b7_create(12,'infinity')$sql$,'22023','invalid_visit_schedule');
select pg_temp.expect_error($sql$select pg_temp.b7_create(12,'2026-09-15',null)$sql$,'22023','invalid_visit_schedule');
select pg_temp.expect_error($sql$select pg_temp.b7_create(12,'2026-09-15',repeat('x',2001))$sql$,'22023','invalid_visit_schedule');
select pg_temp.expect_error($sql$select public.create_audit_visit(null,'d1a70000-0000-4000-8000-000000000101',
 'SEGURANCA','security-it07-r02','d1a70000-0000-4000-8000-000000000002','2026-09-15','')$sql$,'22023','visit_request_id_required');
select pg_temp.expect_error($sql$select public.create_audit_visit('d1a70000-0000-4000-8000-000000000012',
 'd1a70000-0000-4000-8000-000000000101','SEGURANCA','quality-f175','d1a70000-0000-4000-8000-000000000002','2026-09-15','')$sql$,
 '22023','invalid_visit_scope');
select pg_temp.expect_error($sql$select public.create_audit_visit('d1a70000-0000-4000-8000-000000000012',
 'd1a70000-0000-4000-8000-000000000102','SEGURANCA','security-it07-r02','d1a70000-0000-4000-8000-000000000002','2026-09-15','')$sql$,
 '42501','authorized_visit_auditor_required');
select pg_temp.expect_error($sql$select public.create_audit_visit('d1a70000-0000-4000-8000-000000000012',
 'd1a70000-0000-4000-8000-000000000101','SEGURANCA','security-it07-r02','d1a70000-0000-4000-8000-000000000004','2026-09-15','')$sql$,
 '42501','active_agenda_profile_required');
select public.create_audit_visit('d1a70000-0000-4000-8000-000000000012','d1a70000-0000-4000-8000-000000000102',
 'QUALIDADE','quality-f175','d1a70000-0000-4000-8000-000000000002','2026-10-20','Quality on a different month');
select public.create_audit_visit('d1a70000-0000-4000-8000-000000000013','d1a70000-0000-4000-8000-000000000101',
 'SEGURANCA','security-it07-r02','d1a70000-0000-4000-8000-000000000003','2026-09-20','Other auditor');
select pg_temp.assert_true(jsonb_array_length(public.read_audit_agenda('ADMINISTRATIVO')->'visits')=3,
 'A07 admin reads both disciplines and months together');
select pg_temp.expect_error($sql$select public.confirm_audit_visit('d1a70000-0000-4000-8000-000000000020',pg_temp.b7_visit(),1)$sql$,
 '42501','assigned_visit_auditor_required');
set local "request.jwt.claim.sub"='d1a70000-0000-4000-8000-000000000002';
select pg_temp.assert_true((select count(*)=2 from public.audit_visits)
 and jsonb_array_length(public.read_audit_agenda('AUDITOR_SEGURANCA')->'visits')=1
 and jsonb_array_length(public.read_audit_agenda('AUDITOR_QUALIDADE')->'visits')=1
 and public.read_audit_agenda('AUDITOR_SEGURANCA')->'auditors'='[]'::jsonb,
 'A08 assigned auditor reads own exact scopes; selected profile narrows multi-profile data');
select pg_temp.expect_error($sql$select public.read_audit_agenda('ADMINISTRATIVO')$sql$,'42501','active_agenda_profile_required');
select pg_temp.expect_error($sql$select public.list_authorized_visit_auditors('d1a70000-0000-4000-8000-000000000101','SEGURANCA')$sql$,
 '42501','active_administrator_required');
select pg_temp.expect_error($sql$select pg_temp.b7_create(14)$sql$,'42501','active_agenda_profile_required');
select pg_temp.expect_error($sql$select public.reschedule_audit_visit('d1a70000-0000-4000-8000-000000000014',pg_temp.b7_visit(),1,'2026-09-16','')$sql$,
 '42501','active_agenda_profile_required');
select public.confirm_audit_visit('d1a70000-0000-4000-8000-000000000020',pg_temp.b7_visit(),1);
select public.confirm_audit_visit('d1a70000-0000-4000-8000-000000000020',pg_temp.b7_visit(),1);
select public.confirm_audit_visit('d1a70000-0000-4000-8000-000000000021',pg_temp.b7_visit(),1);
select pg_temp.assert_true((select confirmation_status='confirmed' and revision=1 and confirmed_by=auth.uid() and confirmed_at is not null
 from public.audit_visits where id=pg_temp.b7_visit())
 and (select count(*)=1 from public.audit_visit_events where visit_id=pg_temp.b7_visit() and event_type='confirmed'),
 'A09 repeat confirmation is harmless and does not change schedule revision or duplicate history');
select pg_temp.expect_error($sql$update public.audit_visits set confirmation_status='confirmed'$sql$,'42501');
select pg_temp.expect_error($sql$delete from public.audit_visit_events$sql$,'42501');
select pg_temp.expect_error($sql$truncate public.audit_visits$sql$,'42501');
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select public.reschedule_audit_visit('d1a70000-0000-4000-8000-000000000030',pg_temp.b7_visit(),1,'2026-09-17','New date');
select public.reschedule_audit_visit('d1a70000-0000-4000-8000-000000000030',pg_temp.b7_visit(),1,'2026-09-17','New date');
select pg_temp.assert_true((select revision=2 and confirmation_status='pending_confirmation' and confirmed_at is null and confirmed_by is null
 from public.audit_visits where id=pg_temp.b7_visit())
 and (select count(*)=1 from public.audit_visit_events where visit_id=pg_temp.b7_visit() and event_type='rescheduled')
 and (select v->'history'->0->>'previousDate'='2026-09-15' and v->'history'->0->>'date'='2026-09-17'
   from jsonb_array_elements(public.read_audit_agenda('ADMINISTRATIVO')->'visits') v where v->>'id'=pg_temp.b7_visit()::text),
 'A10 reschedule atomically resets confirmation, advances revision and appends correct history once');
select pg_temp.expect_error($sql$select public.reschedule_audit_visit('d1a70000-0000-4000-8000-000000000031',pg_temp.b7_visit(),1,'2026-09-18','Stale')$sql$,
 '40001','visit_revision_conflict');
select public.reschedule_audit_visit('d1a70000-0000-4000-8000-000000000031',pg_temp.b7_visit(),2,'2026-09-17','New date');
select pg_temp.assert_true((select revision=2 from public.audit_visits where id=pg_temp.b7_visit()),'A11 unchanged form does not invalidate confirmation or advance revision');
set local "request.jwt.claim.sub"='d1a70000-0000-4000-8000-000000000002';
select pg_temp.expect_error($sql$select public.confirm_audit_visit('d1a70000-0000-4000-8000-000000000022',pg_temp.b7_visit(),1)$sql$,
 '40001','visit_revision_conflict');
-- An old successful response retry must not claim a newer schedule is confirmed.
select pg_temp.expect_error($sql$select public.confirm_audit_visit('d1a70000-0000-4000-8000-000000000020',pg_temp.b7_visit(),1)$sql$,
 '40001','visit_revision_conflict');
select pg_temp.assert_true((select confirmation_status='pending_confirmation' from public.audit_visits where id=pg_temp.b7_visit()),
 'A12 stale applied retry cannot report success or confirm a newer schedule');
select pg_temp.expect_error($sql$select public.confirm_audit_visit('d1a70000-0000-4000-8000-000000000020',pg_temp.b7_visit(),2)$sql$,
 '22023','visit_request_id_reused');
select public.confirm_audit_visit('d1a70000-0000-4000-8000-000000000022',pg_temp.b7_visit(),2);
reset role;
create temporary table b7_target as select pg_temp.b7_visit() id;
grant select on b7_target to authenticated;
set local role authenticated;
set local "request.jwt.claim.sub"='d1a70000-0000-4000-8000-000000000003';
select pg_temp.assert_true((select count(*)=1 from public.audit_visits)
 and not exists(select 1 from public.audit_visit_events where visit_id=(select id from b7_target)),
 'A13 another auditor cannot read another assignment or its history even on the same work');
select pg_temp.expect_error($sql$select public.confirm_audit_visit('d1a70000-0000-4000-8000-000000000023',(select id from b7_target),2)$sql$,
 '42501','assigned_visit_auditor_required');
set local "request.jwt.claim.sub"='d1a70000-0000-4000-8000-000000000004';
select pg_temp.assert_true(jsonb_array_length(public.read_audit_agenda('ENGENHARIA','EQUIPE_OBRA')->'visits')=2
 and (select count(*)=2 from public.audit_visits), 'A14 engineering site team reads only granted work/discipline');
select pg_temp.expect_error($sql$select public.read_audit_agenda('ENGENHARIA','COORDENACAO')$sql$,'42501','active_agenda_profile_required');
select pg_temp.expect_error($sql$select public.confirm_audit_visit('d1a70000-0000-4000-8000-000000000023',(select id from b7_target),2)$sql$,
 '42501','assigned_visit_auditor_required');
set local "request.jwt.claim.sub"='d1a70000-0000-4000-8000-000000000006';
select pg_temp.assert_true(public.read_audit_agenda('ENGENHARIA','COORDENACAO')='{"visits":[],"auditors":[]}'::jsonb
 and (select count(*)=0 from public.audit_visits), 'A15 coordination gets no implied agenda authority');
set local "request.jwt.claim.sub"='d1a70000-0000-4000-8000-000000000005';
select pg_temp.expect_error($sql$select public.read_audit_agenda('AUDITOR_SEGURANCA')$sql$,'42501','active_agenda_profile_required');
select pg_temp.assert_true((select count(*)=0 from public.audit_visits),'A16 pending identity sees no visits');
reset role;

savepoint b7_revoke;
delete from public.access_grants where auth_user_id='d1a70000-0000-4000-8000-000000000002' and perfil='AUDITOR_SEGURANCA';
set local role authenticated;
set local "request.jwt.claim.sub"='d1a70000-0000-4000-8000-000000000002';
select pg_temp.assert_true(public.read_audit_agenda('AUDITOR_SEGURANCA')->'visits'='[]'::jsonb,'A17 revoked grant removes assigned visit visibility');
select pg_temp.expect_error($sql$select public.confirm_audit_visit('d1a70000-0000-4000-8000-000000000022',(select id from b7_target),2)$sql$,
 '42501','authorized_visit_auditor_required');
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select pg_temp.expect_error($sql$select pg_temp.b7_create()$sql$,'42501','authorized_visit_auditor_required');
select pg_temp.assert_true(jsonb_array_length(public.list_authorized_visit_auditors('d1a70000-0000-4000-8000-000000000101','SEGURANCA'))=1,
 'A18 picker drops revoked scope and even applied create retries revalidate it');
reset role;
rollback to savepoint b7_revoke;
savepoint b7_inactive;
update public.access_accounts set ativo=false where auth_user_id='d1a70000-0000-4000-8000-000000000002';
set local role authenticated;
set local "request.jwt.claim.sub"='d1a70000-0000-4000-8000-000000000002';
select pg_temp.expect_error($sql$select public.confirm_audit_visit('d1a70000-0000-4000-8000-000000000022',(select id from b7_target),2)$sql$,
 '42501','active_agenda_profile_required');
select pg_temp.assert_true((select count(*)=0 from public.audit_visits),'A19 disabled account loses all operational visibility');
reset role;
rollback to savepoint b7_inactive;
savepoint b7_ban;
update auth.users set banned_until=clock_timestamp()+interval '1 day' where id='13044e3f-e8d2-4b4b-9981-22a8de22c610';
set local role authenticated;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select pg_temp.expect_error($sql$select pg_temp.b7_create()$sql$,'42501','active_agenda_profile_required');
select pg_temp.expect_error($sql$select public.read_audit_agenda('ADMINISTRATIVO')$sql$,'42501','active_agenda_profile_required');
reset role;
rollback to savepoint b7_ban;
savepoint b7_inactive_work;
update public.access_works set ativo=false where id='d1a70000-0000-4000-8000-000000000101';
set local role authenticated;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select pg_temp.expect_error($sql$select pg_temp.b7_create()$sql$,'42501','authorized_visit_auditor_required');
select pg_temp.assert_true(jsonb_array_length(public.read_audit_agenda('ADMINISTRATIVO')->'visits')=1,'A20 inactive work is excluded from active agenda');
reset role;
rollback to savepoint b7_inactive_work;

create function pg_temp.reject_visit_event() returns trigger language plpgsql as $test$
begin raise exception using errcode='P0077',message='Synthetic agenda history failure'; end;
$test$;
create trigger b7_reject_event before insert on public.audit_visit_events for each row execute function pg_temp.reject_visit_event();
set local role authenticated;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select pg_temp.expect_error($sql$select pg_temp.b7_create(90)$sql$,'P0077');
select pg_temp.expect_error($sql$select public.reschedule_audit_visit('d1a70000-0000-4000-8000-000000000091',pg_temp.b7_visit(),2,'2026-09-19','Must roll back')$sql$,'P0077');
select pg_temp.assert_true((select count(*)=3 from public.audit_visits)
 and (select revision=2 and confirmation_status='confirmed' and data_prevista='2026-09-17' from public.audit_visits where id=pg_temp.b7_visit()),
 'A21 history failure rolls back entire create/reschedule transaction and confirmation reset');
reset role;
select pg_temp.assert_true(not exists(select 1 from dialogo_private.audit_visit_operations
 where request_id in ('d1a70000-0000-4000-8000-000000000090','d1a70000-0000-4000-8000-000000000091')),
 'A22 failed writes do not consume idempotency keys');
drop trigger b7_reject_event on public.audit_visit_events;
savepoint b7_later_schedule;
set local role authenticated;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select public.reschedule_audit_visit('d1a70000-0000-4000-8000-000000000092',pg_temp.b7_visit(),2,'2026-09-21','Later change');
select pg_temp.expect_error($sql$select public.reschedule_audit_visit('d1a70000-0000-4000-8000-000000000030',pg_temp.b7_visit(),1,'2026-09-17','New date')$sql$,
 '40001','visit_revision_conflict');
reset role;
create trigger b7_reject_confirm_event before insert on public.audit_visit_events for each row execute function pg_temp.reject_visit_event();
set local role authenticated;
set local "request.jwt.claim.sub"='d1a70000-0000-4000-8000-000000000002';
select pg_temp.expect_error($sql$select public.confirm_audit_visit('d1a70000-0000-4000-8000-000000000093',pg_temp.b7_visit(),3)$sql$,'P0077');
select pg_temp.assert_true((select revision=3 and confirmation_status='pending_confirmation' and confirmed_at is null
  from public.audit_visits where id=pg_temp.b7_visit()),'A24 failed confirmation history leaves schedule pending');
reset role;
select pg_temp.assert_true(not exists(select 1 from dialogo_private.audit_visit_operations
 where request_id='d1a70000-0000-4000-8000-000000000093'),'A25 failed confirmation does not consume retry key');
rollback to savepoint b7_later_schedule;
select pg_temp.expect_error($sql$update public.audit_visit_events set actor_auth_user_id='d1a70000-0000-4000-8000-000000000002'$sql$,
 '55000','visit_history_is_immutable');
select pg_temp.expect_error($sql$delete from public.audit_visit_events$sql$,'55000','visit_history_is_immutable');
select pg_temp.expect_error($sql$truncate public.audit_visit_events$sql$,'55000','visit_history_is_immutable');
select pg_temp.assert_true(pg_temp.b7_state()=(select payload from b7_before),
 'A23 agenda writes never alter existing Auth/accounts/grants/works/access decisions');
rollback;

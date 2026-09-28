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


-- New projection is identical to the existing agenda for each authorized view.
select set_config('dialogo.test.agenda_revision',public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL')->>'revision',true);
select pg_temp.assert_true(public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL')->'snapshot'
 =public.read_audit_agenda('ADMINISTRATIVO'),'General admin projection equals current agenda');
select pg_temp.assert_true(public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'QUALIDADE')->'snapshot'
 ='{"visits":[],"auditors":[]}'::jsonb,'General admin selected discipline has exact narrower projection');
select pg_temp.assert_true(public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'SEGURANCA',current_setting('dialogo.test.agenda_revision'))->>'unchanged'='false',
 'Another selected administrative discipline never reuses a token');
set local "request.jwt.claim.sub"='d1ac0000-0000-4000-8000-000000000003';
select pg_temp.assert_true(public.read_audit_agenda_if_changed('ENGENHARIA','COORDENACAO')->'snapshot'
 =public.read_audit_agenda('ENGENHARIA','COORDENACAO'),'Coordination projection equals current agenda');
select pg_temp.expect_error($sql$select public.read_audit_agenda_if_changed('ENGENHARIA','EQUIPE_OBRA',null,current_setting('dialogo.test.agenda_revision'))$sql$,'42501');
set local "request.jwt.claim.sub"='d1ac0000-0000-4000-8000-000000000002';
select pg_temp.assert_true(public.read_audit_agenda_if_changed('AUDITOR_SEGURANCA')->'snapshot'
 =public.read_audit_agenda('AUDITOR_SEGURANCA'),'Auditor projection equals current agenda');
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select pg_temp.assert_true(public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL',current_setting('dialogo.test.agenda_revision'))
 =jsonb_build_object('unchanged',true,'revision',current_setting('dialogo.test.agenda_revision')),
 'Repeated revision returns only token without visit, auditor or history payload');

-- Prove unchanged requests bypass the expensive function, rather than hashing it.
reset role;
savepoint skip_json_probe;
create or replace function public.read_audit_agenda(p_profile text,p_engineering_scope text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $test$
begin raise exception using errcode='P0001',message='expensive_projection_was_called'; end;
$test$;
set local role authenticated;
select pg_temp.assert_true(public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL',current_setting('dialogo.test.agenda_revision'))->>'unchanged'='true',
 'Unchanged poll performs zero calls to expensive agenda projection');
select pg_temp.expect_error($sql$select public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL')$sql$,'P0001');
rollback to savepoint skip_json_probe;
release savepoint skip_json_probe;

-- Metadata changes invalidate in the same transaction without shared locks.
update public.access_requests set nome='Renamed auditor' where auth_user_id='d1ac0000-0000-4000-8000-000000000002';
select pg_temp.assert_true(public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL',current_setting('dialogo.test.agenda_revision'))->>'unchanged'='false'
 and public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL')->'snapshot'->'visits'->0->>'auditorName'='Renamed auditor','Auditor name changes invalidate');
select set_config('dialogo.test.agenda_revision',public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL')->>'revision',true);
update public.access_requests set nome='Renamed creator' where auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select pg_temp.assert_true(public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL',current_setting('dialogo.test.agenda_revision'))->>'unchanged'='false'
 and public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL')->'snapshot'->'visits'->0->>'createdByName'='Renamed creator','Creator name changes invalidate');
select set_config('dialogo.test.agenda_revision',public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL')->>'revision',true);
update public.access_works set nome='Renamed work' where id='d1ac0000-0000-4000-8000-000000000101';
select pg_temp.assert_true(public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL',current_setting('dialogo.test.agenda_revision'))->>'unchanged'='false'
 and public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL')->'snapshot'->'visits'->0->>'workName'='Renamed work','Work name changes invalidate');
select set_config('dialogo.test.agenda_revision',public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL')->>'revision',true);

set local role authenticated;
set local "request.jwt.claim.sub"='d1ac0000-0000-4000-8000-000000000002';
select public.confirm_audit_visit('d1ac0000-0000-4000-8000-000000000301',current_setting('dialogo.test.coordination_visit')::uuid,1);
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select pg_temp.assert_true(public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL',current_setting('dialogo.test.agenda_revision'))->>'unchanged'='false'
 and public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL')->'snapshot'->'visits'->0->>'confirmationStatus'='confirmed','Confirmation invalidates even without schedule revision change');
select set_config('dialogo.test.agenda_revision',public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL')->>'revision',true);

-- Insertion and immutable history are separate invalidation sources.
reset role;
savepoint additional_visit;
set local role authenticated;
select public.create_audit_visit('d1ac0000-0000-4000-8000-000000000303',
 'd1ac0000-0000-4000-8000-000000000101','SEGURANCA','security-it07-r02',
 'd1ac0000-0000-4000-8000-000000000002','2030-03-11','Additional visit');
select pg_temp.assert_true(public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL',current_setting('dialogo.test.agenda_revision'))->>'unchanged'='false'
 and jsonb_array_length(public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL')->'snapshot'->'visits')=2,'New visit invalidates existing agenda token');
rollback to savepoint additional_visit;
release savepoint additional_visit;
savepoint history_only;
insert into public.audit_visit_events(id,visit_id,revision,event_type,before_snapshot,after_snapshot,actor_auth_user_id,occurred_at)
values('d1ac0000-0000-4000-8000-000000000401',current_setting('dialogo.test.coordination_visit')::uuid,2,'rescheduled',
 '{"data_prevista":"2030-03-09"}','{"data_prevista":"2030-03-10","observacao":"Imported historical note"}',
 '13044e3f-e8d2-4b4b-9981-22a8de22c610',clock_timestamp());
select pg_temp.assert_true(public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL',current_setting('dialogo.test.agenda_revision'))->>'unchanged'='false'
 and public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL')->'snapshot'->'visits'->0->'history'->0->>'note'='Imported historical note',
 'New immutable history invalidates even if visit metadata stays unchanged');
rollback to savepoint history_only;
release savepoint history_only;
savepoint inactive_nominee;
update public.access_accounts set ativo=false where auth_user_id='d1ac0000-0000-4000-8000-000000000002';
select pg_temp.assert_true(public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL',current_setting('dialogo.test.agenda_revision'))->>'unchanged'='false'
 and public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL')->'snapshot'->'auditors'='[]'::jsonb,'Inactive nominee is removed immediately');
rollback to savepoint inactive_nominee;
release savepoint inactive_nominee;

-- Authority is never cached, including when the caller knows an old valid token.
reset role;
savepoint revoked_profile;
update public.access_accounts set ativo=false where auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610';
set local role authenticated;
select pg_temp.expect_error($sql$select public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL',current_setting('dialogo.test.agenda_revision'))$sql$,'42501');
rollback to savepoint revoked_profile;
release savepoint revoked_profile;
savepoint narrowed_scope;
update public.access_accounts set atuacao_administrativa='SEGURANCA' where auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610';
set local role authenticated;
select pg_temp.expect_error($sql$select public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL',current_setting('dialogo.test.agenda_revision'))$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'QUALIDADE',current_setting('dialogo.test.agenda_revision'))$sql$,'42501');
rollback to savepoint narrowed_scope;
release savepoint narrowed_scope;

-- Grant removal hides Engineering data immediately; work activation is also covered.
savepoint revoked_grant;
set local "request.jwt.claim.sub"='d1ac0000-0000-4000-8000-000000000003';
select set_config('dialogo.test.engineering_revision',public.read_audit_agenda_if_changed('ENGENHARIA','COORDENACAO')->>'revision',true);
delete from public.access_grants where auth_user_id='d1ac0000-0000-4000-8000-000000000003';
set local role authenticated;
select pg_temp.assert_true(public.read_audit_agenda_if_changed('ENGENHARIA','COORDENACAO',null,current_setting('dialogo.test.engineering_revision'))->>'unchanged'='false'
 and public.read_audit_agenda_if_changed('ENGENHARIA','COORDENACAO')->'snapshot'->'visits'='[]'::jsonb,'Grant deletion immediately changes and narrows agenda');
rollback to savepoint revoked_grant;
release savepoint revoked_grant;
savepoint inactive_work;
update public.access_works set ativo=false where id='d1ac0000-0000-4000-8000-000000000101';
select pg_temp.assert_true(public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL',current_setting('dialogo.test.agenda_revision'))->>'unchanged'='false'
 and public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL')->'snapshot'->'visits'='[]'::jsonb,'Inactive work immediately removes its visit');
rollback to savepoint inactive_work;
release savepoint inactive_work;

-- Deletion/publication invalidate, but never remove immutable agenda history.
savepoint cancelled_visit;
set local role authenticated;
select public.delete_audit_visit('d1ac0000-0000-4000-8000-000000000302',current_setting('dialogo.test.coordination_visit')::uuid,1);
select pg_temp.assert_true(public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL',current_setting('dialogo.test.agenda_revision'))->>'unchanged'='false'
 and public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL')->'snapshot'->'visits'='[]'::jsonb,'Deleted visit disappears on next conditional poll');
rollback to savepoint cancelled_visit;
release savepoint cancelled_visit;
savepoint published_visit;
insert into public.published_audits(id,work_id,modulo,model_id,audit_date,auditor_auth_user_id,auditor_name,final_score,
 catalog_version,catalog_revision_label,criteria,responses,evidence_files,report_file_name,source_file_name,published_at)
values('d1ac0000-0000-4000-8000-000000000501','d1ac0000-0000-4000-8000-000000000101','SEGURANCA','security-it07-r02','2030-03-10',
 'd1ac0000-0000-4000-8000-000000000002','Renamed auditor',8,1,'Fixture R1',
 '[{"id":"c1","code":"01.01","title":"Fixture","text":"Fixture","group":"1. Group","subgroup":"","source":"Fixture","locator":"1","documentedWeight":1,"orientations":[],"verificationRule":"Conforme/Não Conforme"}]',
 '{"c1":{"answer":"Conforme","note":"","photos":[]}}','[]','fixture.pdf','fixture.pdf',clock_timestamp());
select pg_temp.assert_true(public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL',current_setting('dialogo.test.agenda_revision'))->>'unchanged'='false'
 and public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL')->'snapshot'->'visits'='[]'::jsonb,'Published audit removes linked visit and invalidates projection');
rollback to savepoint published_visit;
release savepoint published_visit;

-- Conditional reads keep the same authenticated execution boundary.
set local role authenticated;
select pg_temp.assert_true(not has_function_privilege('anon','public.read_audit_agenda_if_changed(text,text,text,text)','execute'), 'No anonymous conditional agenda RPC');
set local role anon;
select pg_temp.expect_error($sql$select public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL')$sql$,'42501');
reset role;

-- Other auditors' visits never enter the selected auditor's fingerprint.
savepoint auditor_assignments;
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 ('d1ac0000-0000-4000-8000-000000000004','agenda.other.auditor@dialogo.com.br','{"nome":"Other auditor"}',clock_timestamp());
set local role authenticated;
select public.approve_access_request_v3('d1ac0000-0000-4000-8000-000000000004',array['AUDITOR_SEGURANCA'],null,null,
 '[{"perfil":"AUDITOR_SEGURANCA","obra_id":"d1ac0000-0000-4000-8000-000000000101","modulo":"SEGURANCA"}]','Other fixture auditor');
set local "request.jwt.claim.sub"='d1ac0000-0000-4000-8000-000000000002';
select set_config('dialogo.test.auditor_revision',public.read_audit_agenda_if_changed('AUDITOR_SEGURANCA')->>'revision',true);
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select public.create_audit_visit('d1ac0000-0000-4000-8000-000000000304',
 'd1ac0000-0000-4000-8000-000000000101','SEGURANCA','security-it07-r02',
 'd1ac0000-0000-4000-8000-000000000004','2030-03-12','Other auditor visit');
set local "request.jwt.claim.sub"='d1ac0000-0000-4000-8000-000000000002';
select pg_temp.assert_true(public.read_audit_agenda_if_changed('AUDITOR_SEGURANCA',null,null,current_setting('dialogo.test.auditor_revision'))->>'unchanged'='true',
 'Other auditor visit in the same work does not invalidate the selected auditor');
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select set_config('dialogo.test.new_assigned_visit',public.create_audit_visit('d1ac0000-0000-4000-8000-000000000305',
 'd1ac0000-0000-4000-8000-000000000101','SEGURANCA','security-it07-r02',
 'd1ac0000-0000-4000-8000-000000000002','2030-03-13','New assigned visit')::text,true);
set local "request.jwt.claim.sub"='d1ac0000-0000-4000-8000-000000000002';
select pg_temp.assert_true(public.read_audit_agenda_if_changed('AUDITOR_SEGURANCA',null,null,current_setting('dialogo.test.auditor_revision'))->>'unchanged'='false'
 and jsonb_array_length(public.read_audit_agenda_if_changed('AUDITOR_SEGURANCA')->'snapshot'->'visits')=2,'New assignment invalidates selected auditor');
select set_config('dialogo.test.auditor_revision',public.read_audit_agenda_if_changed('AUDITOR_SEGURANCA')->>'revision',true);
reset role;
update public.audit_visits set auditor_auth_user_id='d1ac0000-0000-4000-8000-000000000004'
 where id=current_setting('dialogo.test.new_assigned_visit')::uuid;
set local role authenticated;
select pg_temp.assert_true(public.read_audit_agenda_if_changed('AUDITOR_SEGURANCA',null,null,current_setting('dialogo.test.auditor_revision'))->>'unchanged'='false'
 and jsonb_array_length(public.read_audit_agenda_if_changed('AUDITOR_SEGURANCA')->'snapshot'->'visits')=1,'Removed assignment invalidates selected auditor');
rollback to savepoint auditor_assignments;
release savepoint auditor_assignments;

-- Ban activation affects the fingerprint without modifying any public table.
select pg_temp.assert_true(not exists(select 1 from pg_trigger where tgname='agenda_revision_changed'), 'Conditional agenda introduces no write trigger or shared revision lock');
update auth.users set banned_until=clock_timestamp()+interval '10 minutes' where id='d1ac0000-0000-4000-8000-000000000002';

select pg_temp.assert_true(public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL',current_setting('dialogo.test.agenda_revision'))->>'unchanged'='false'
 and public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL')->'snapshot'->'auditors'='[]'::jsonb,'Ban activates immediately in fingerprint and authorized nominees');
select set_config('dialogo.test.banned_revision',public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL')->>'revision',true);
update auth.users set banned_until=clock_timestamp()+interval '200 milliseconds' where id='d1ac0000-0000-4000-8000-000000000002';
select pg_temp.assert_true(public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL',current_setting('dialogo.test.banned_revision'))->>'unchanged'='true', 'Ban is active immediately before the request boundary');
-- The runner ends this SQL request, waits 300 ms, then runs the remainder.
-- AGENDA_BAN_EXPIRY_BOUNDARY

select pg_temp.assert_true(public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL',current_setting('dialogo.test.banned_revision'))->>'unchanged'='false'
 and jsonb_array_length(public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL')->'snapshot'->'auditors')=1,'Ban expiry without writes invalidates token and restores eligible nominee');

rollback;

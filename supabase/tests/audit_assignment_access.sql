-- Isolated synthetic PostgreSQL regression. NEVER run against a hosted database.
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
create function pg_temp.id(n integer) returns uuid language sql immutable as $test$
  select ('d1ae0000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
$test$;
create function pg_temp.work_data() returns jsonb language sql as $test$
  select '{"nome":"LAN project fixture","empreendimento":"LAN development fixture","etapa_obra":"ESTRUTURA",
    "logradouro":"Fixture street","numero":"1","complemento":"","bairro":"Fixture district","cidade":"",
    "uf":"","cep":"12345678","responsavel_tecnico":"Fixture engineer","registro_tecnico":"",
    "coordenacao":"Fixture coordinator","observacoes":"","equipe_obra":[]}'::jsonb;
$test$;
create function pg_temp.access_state() returns jsonb language sql as $test$
  select jsonb_build_object(
    'accounts',(select jsonb_agg(to_jsonb(a) order by auth_user_id) from public.access_accounts a),
    'requests',(select jsonb_agg(to_jsonb(r) order by auth_user_id) from public.access_requests r),
    'grants',(select jsonb_agg(to_jsonb(g) order by auth_user_id,perfil,obra_id,modulo) from public.access_grants g),
    'works',(select jsonb_agg(to_jsonb(w) order by id) from public.access_works w),
    'team',(select jsonb_agg(to_jsonb(t) order by obra_id,auth_user_id) from public.work_team_links t));
$test$;
create function pg_temp.create_audit(n integer,work_n integer default 102,user_n integer default 2,
  module_name text default 'SEGURANCA',model_name text default 'security-it07-r02')
returns uuid language sql as $test$
  select public.create_audit_visit(pg_temp.id(n),pg_temp.id(work_n),module_name,model_name,
    pg_temp.id(user_n),date '2030-03-01' + n,'Synthetic assignment');
$test$;
create function pg_temp.criterion() returns jsonb language sql as $test$
  select '[{"id":"fixture-criterion","code":"01.01","title":"Fixture item","text":"Fixture description",
    "group":"1. Fixture","subgroup":"","source":"Fixture","locator":"1","documentedWeight":1,
    "orientations":[],"verificationRule":"Conforme/Não Conforme"}]'::jsonb;
$test$;
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 ('13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br','{"nome":"Assignment admin fixture"}',clock_timestamp()),
 (pg_temp.id(2),'assignment.dual@dialogo.com.br','{"nome":"Dual auditor fixture"}',clock_timestamp()),
 (pg_temp.id(3),'assignment.other@dialogo.com.br','{"nome":"Other auditor fixture"}',clock_timestamp()),
 (pg_temp.id(4),'assignment.engineering@dialogo.com.br','{"nome":"Engineering fixture"}',clock_timestamp()),
 (pg_temp.id(5),'assignment.safety.admin@dialogo.com.br','{"nome":"Safety admin fixture"}',clock_timestamp()),
 (pg_temp.id(6),'assignment.pending@dialogo.com.br','{"nome":"Pending fixture"}',clock_timestamp()),
 (pg_temp.id(7),'assignment.quality@dialogo.com.br','{"nome":"Quality auditor fixture"}',clock_timestamp());
select dialogo_private.bootstrap_first_administrator('13044e3f-e8d2-4b4b-9981-22a8de22c610',
 'emanuel.locchi@dialogo.com.br','Isolated assignment test bootstrap');
update public.access_accounts set atuacao_administrativa = 'GERAL'
  where auth_user_id = '13044e3f-e8d2-4b4b-9981-22a8de22c610';
set local "request.jwt.claim.sub" = '13044e3f-e8d2-4b4b-9981-22a8de22c610';
insert into public.access_works(id,nome,created_by) values
 (pg_temp.id(101),'Follow-up work fixture',auth.uid()),(pg_temp.id(102),'Assigned work fixture',auth.uid());
set local role authenticated;
select public.approve_access_request_v3(pg_temp.id(2),array['AUDITOR_SEGURANCA','AUDITOR_QUALIDADE'],null,null,
 jsonb_build_array(jsonb_build_object('perfil','AUDITOR_SEGURANCA','obra_id',pg_temp.id(101),'modulo','SEGURANCA'),
   jsonb_build_object('perfil','AUDITOR_QUALIDADE','obra_id',pg_temp.id(101),'modulo','QUALIDADE')),'Synthetic dual auditor approval');
select public.approve_access_request_v3(pg_temp.id(3),array['AUDITOR_SEGURANCA'],null,null,
 jsonb_build_array(jsonb_build_object('perfil','AUDITOR_SEGURANCA','obra_id',pg_temp.id(101),'modulo','SEGURANCA')),'Synthetic other auditor approval');
select public.approve_access_request_v3(pg_temp.id(4),array['ENGENHARIA'],'EQUIPE_OBRA',null,
 jsonb_build_array(jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(101),'modulo','SEGURANCA')),'Synthetic engineering approval');
select public.approve_access_request_v3(pg_temp.id(5),array['ADMINISTRATIVO'],null,'SEGURANCA','[]','Synthetic scoped admin approval');
select public.approve_access_request_v3(pg_temp.id(7),array['AUDITOR_QUALIDADE'],null,null,
 jsonb_build_array(jsonb_build_object('perfil','AUDITOR_QUALIDADE','obra_id',pg_temp.id(101),'modulo','QUALIDADE')),'Synthetic quality auditor approval');

-- Exercise the actual LAN stage/team migrations in the same schema as the new
-- assignment migration. Adding a member deliberately creates follow-up grants.
select set_config('dialogo.test.new_work',public.create_access_work_with_team_v2(pg_temp.work_data(),
 jsonb_build_array(jsonb_build_object('id',pg_temp.id(3),'cargo','Técnico de segurança')))::text,true);
select pg_temp.assert_true((select empreendimento = 'LAN development fixture' and etapa_obra = 'ESTRUTURA'
 from public.access_works where id = current_setting('dialogo.test.new_work')::uuid)
 and (select cargo = 'Técnico de segurança' from public.work_team_links
   where obra_id = current_setting('dialogo.test.new_work')::uuid and auth_user_id = pg_temp.id(3)),
 'LAN creation persists development, stage and member job title');
select public.update_access_work_with_team_v2(current_setting('dialogo.test.new_work')::uuid,0,
 pg_temp.work_data() || '{"etapa_obra":"ACABAMENTO"}',
 jsonb_build_array(jsonb_build_object('id',pg_temp.id(3),'cargo','Supervisor de segurança')));
select pg_temp.assert_true((select etapa_obra = 'ACABAMENTO' from public.access_works
 where id = current_setting('dialogo.test.new_work')::uuid)
 and (select cargo = 'Supervisor de segurança' from public.work_team_links
   where obra_id = current_setting('dialogo.test.new_work')::uuid and auth_user_id = pg_temp.id(3)),
 'LAN edit persists stage and member job title');
select pg_temp.expect_error($sql$select public.create_access_work_with_team_v2(
 pg_temp.work_data() || '{"etapa_obra":"INVALID"}','[]')$sql$,'22023');

select public.save_audit_catalog_revision(pg_temp.id(900),'security-it07-r02',0,'Fixture R1','Assignment test',pg_temp.criterion());
select public.save_audit_catalog_revision(pg_temp.id(901),'quality-f175',0,'Fixture R1','Assignment test',pg_temp.criterion());
select public.save_audit_catalog_revision(pg_temp.id(902),'quality-f176',0,'Fixture R1','Assignment test',pg_temp.criterion());
reset role;
-- A profile remains valid when its previous follow-up grants are revoked.
delete from public.access_grants where auth_user_id = pg_temp.id(7);
insert into public.audit_fvs_weight_revisions(version,revision_label,change_note,services,created_by,request_id)
 values(1,'Fixture FVS','Assignment test','[{"document":"FVS-1","service":"Fixture service","weight":3,"label":"FVS-1 - Fixture service"}]',
 auth.uid(),pg_temp.id(903));
create temporary table assignment_before as select pg_temp.access_state() payload;

set local role authenticated;
select pg_temp.assert_true(jsonb_array_length(public.list_authorized_visit_auditors(pg_temp.id(102),'SEGURANCA')) = 2,
 'audit nominations include auditors with no grant to the assigned work');
select pg_temp.assert_true(exists (select 1 from jsonb_array_elements(public.read_audit_agenda('ADMINISTRATIVO')->'auditors') a
 where a->>'id' = pg_temp.id(7)::text and a->'workIds' = '[]' and a->'workModuleScopes' = '[]'),
 'eligible profile without any follow-up grants appears with empty scope');
select set_config('dialogo.test.audit',pg_temp.create_audit(201)::text,true);
select pg_temp.assert_true(pg_temp.create_audit(201)::text = current_setting('dialogo.test.audit')
 and (select count(*) = 1 from public.audit_visits),'audit creation replays idempotently without grants');
select pg_temp.expect_error($sql$select pg_temp.create_audit(201,101)$sql$,'22023');
select set_config('dialogo.test.other_audit',pg_temp.create_audit(202,102,3)::text,true);
select set_config('dialogo.test.quality_audit',pg_temp.create_audit(203,102,7,'QUALIDADE','quality-f175')::text,true);
select set_config('dialogo.test.dual_quality',pg_temp.create_audit(204,102,2,'QUALIDADE','quality-f176')::text,true);
select set_config('dialogo.test.own_work_audit',pg_temp.create_audit(205,101,2)::text,true);
select pg_temp.assert_true(current_setting('dialogo.test.own_work_audit') <> '',
 'separation does not prohibit auditing a followed work');
select pg_temp.expect_error($sql$select pg_temp.create_audit(206,102,3,'QUALIDADE','quality-f175')$sql$,'42501');
select pg_temp.expect_error($sql$select pg_temp.create_audit(206,102,4)$sql$,'42501');
select pg_temp.expect_error($sql$select pg_temp.create_audit(206,102,6)$sql$,'42501');
select pg_temp.expect_error($sql$select public.create_work_follow_up_visit(pg_temp.id(207),pg_temp.id(102),
 'SEGURANCA',pg_temp.id(2),'2030-04-01','Foreign follow-up')$sql$,'42501');
select set_config('dialogo.test.follow_up',public.create_work_follow_up_visit(pg_temp.id(208),pg_temp.id(101),
 'SEGURANCA',pg_temp.id(2),'2030-04-01','Granted follow-up')::text,true);

set local "request.jwt.claim.sub" = 'd1ae0000-0000-4000-8000-000000000002';
select pg_temp.assert_true(public.has_current_assigned_audit_visit(current_setting('dialogo.test.audit')::uuid)
 and not public.has_current_assigned_audit_visit(current_setting('dialogo.test.other_audit')::uuid)
 and not public.has_current_assigned_audit_visit(current_setting('dialogo.test.follow_up')::uuid),
 'assignment predicate is exact to the current auditor and audit kind');
select pg_temp.assert_true(exists(select 1 from jsonb_array_elements(public.read_audit_agenda('AUDITOR_SEGURANCA')->'visits') v
 where v->>'id' = current_setting('dialogo.test.audit') and v->>'workName' = 'Assigned work fixture')
 and jsonb_array_length(public.read_audit_agenda('AUDITOR_SEGURANCA')->'visits') = 3
 and jsonb_array_length(public.read_audit_agenda('AUDITOR_QUALIDADE')->'visits') = 1,
 'agenda shows assigned work name and restricts the selected auditor discipline');
select pg_temp.assert_true((select count(*) = 4 from public.audit_visits)
 and not exists(select 1 from public.audit_visit_events where visit_id = current_setting('dialogo.test.other_audit')::uuid),
 'direct visit and history RLS cannot read another auditor assignment');
select pg_temp.assert_true(not exists(select 1 from public.access_works where id = pg_temp.id(102))
 and not public.has_current_access_grant('AUDITOR_SEGURANCA',pg_temp.id(102),'SEGURANCA')
 and not public.has_current_access_grant('AUDITOR_QUALIDADE',pg_temp.id(102),'QUALIDADE'),
 'assignment exposes no general work record or grant');
select public.confirm_audit_visit(pg_temp.id(301),current_setting('dialogo.test.audit')::uuid,1);
select public.confirm_audit_visit(pg_temp.id(301),current_setting('dialogo.test.audit')::uuid,1);
select pg_temp.assert_true((select confirmation_status = 'confirmed' and revision = 1 from public.audit_visits
 where id = current_setting('dialogo.test.audit')::uuid)
 and (select count(*) = 1 from public.audit_visit_events where visit_id = current_setting('dialogo.test.audit')::uuid
 and event_type = 'confirmed'),'foreign assigned audit confirms once with safe replay');
select pg_temp.expect_error($sql$select public.confirm_audit_visit(pg_temp.id(302),current_setting('dialogo.test.other_audit')::uuid,1)$sql$,'42501');
select pg_temp.expect_error($sql$select public.confirm_audit_visit(pg_temp.id(302),current_setting('dialogo.test.audit')::uuid,2)$sql$,'40001');
select pg_temp.expect_error($sql$select pg_temp.create_audit(210)$sql$,'42501');
select pg_temp.expect_error($sql$insert into public.follow_up_work_findings(id,work_id,auditor_auth_user_id,modulo,
 description,correction,photo_file_name) values(pg_temp.id(400),pg_temp.id(102),auth.uid(),'SEGURANCA',
 'Foreign finding','Foreign correction',pg_temp.id(400)::text || '_' || pg_temp.id(401)::text || '.jpg')$sql$,'42501');
select pg_temp.expect_error($sql$insert into public.audit_visits(obra_id,modulo,modelo_id,auditor_auth_user_id,data_prevista,created_by,updated_by)
 values(pg_temp.id(102),'SEGURANCA','security-it07-r02',auth.uid(),'2030-05-01',auth.uid(),auth.uid())$sql$,'42501');

set local "request.jwt.claim.sub" = 'd1ae0000-0000-4000-8000-000000000007';
select pg_temp.assert_true(public.has_current_assigned_audit_visit(current_setting('dialogo.test.quality_audit')::uuid)
 and (select count(*) = 0 from public.access_works)
 and jsonb_array_length(public.read_audit_catalogs('AUDITOR_QUALIDADE')) = 1
 and public.read_audit_catalogs('AUDITOR_QUALIDADE')->0->>'modelId' = 'quality-f175'
 and public.read_fvs_services('AUDITOR_QUALIDADE')->>'label' = 'Fixture FVS',
 'audit-only scope gets the exact assigned template and FVS weights without any work visibility');
select public.confirm_audit_visit(pg_temp.id(303),current_setting('dialogo.test.quality_audit')::uuid,1);
select pg_temp.expect_error($sql$select public.read_audit_agenda('AUDITOR_SEGURANCA')$sql$,'42501');

set local "request.jwt.claim.sub" = 'd1ae0000-0000-4000-8000-000000000005';
select pg_temp.assert_true(not exists(select 1 from jsonb_array_elements(public.read_audit_agenda('ADMINISTRATIVO')->'visits') v
 where v->>'module' = 'quality') and not exists(select 1 from public.audit_visits where modulo = 'QUALIDADE'),
 'administrative discipline wrapper and direct RLS keep Quality out of Safety');
select pg_temp.expect_error($sql$select pg_temp.create_audit(210,102,7,'QUALIDADE','quality-f175')$sql$,'42501');
set local "request.jwt.claim.sub" = '';
select pg_temp.expect_error($sql$select public.read_audit_agenda('AUDITOR_SEGURANCA')$sql$,'42501');
select pg_temp.expect_error($sql$select public.confirm_audit_visit(pg_temp.id(304),current_setting('dialogo.test.audit')::uuid,1)$sql$,'42501');
select pg_temp.assert_true((select count(*) = 0 from public.audit_visits),'missing identity has no direct visit access');
set local role anon;
select pg_temp.expect_error($sql$select public.read_audit_agenda('AUDITOR_SEGURANCA')$sql$,'42501');
select pg_temp.expect_error($sql$select public.has_current_assigned_audit_visit(current_setting('dialogo.test.audit')::uuid)$sql$,'42501');
reset role;

savepoint revoked_grants;
delete from public.access_grants where auth_user_id = pg_temp.id(2);
set local role authenticated;
set local "request.jwt.claim.sub" = 'd1ae0000-0000-4000-8000-000000000002';
select pg_temp.assert_true(public.has_current_assigned_audit_visit(current_setting('dialogo.test.audit')::uuid)
 and not exists(select 1 from public.audit_visits where id = current_setting('dialogo.test.follow_up')::uuid),
 'removing follow-up grants preserves audit assignment and hides follow-up');
select pg_temp.expect_error($sql$select public.confirm_audit_visit(pg_temp.id(305),current_setting('dialogo.test.follow_up')::uuid,1)$sql$,'42501');
reset role;
rollback to savepoint revoked_grants;

savepoint revoked_profile;
update public.access_accounts set perfil = 'AUDITOR_QUALIDADE',perfis = array['AUDITOR_QUALIDADE'] where auth_user_id = pg_temp.id(2);
set local role authenticated;
set local "request.jwt.claim.sub" = 'd1ae0000-0000-4000-8000-000000000002';
select pg_temp.assert_true(not public.has_current_assigned_audit_visit(current_setting('dialogo.test.audit')::uuid),
 'revoked auditor profile removes assignment access immediately');
select pg_temp.expect_error($sql$select public.confirm_audit_visit(pg_temp.id(301),current_setting('dialogo.test.audit')::uuid,1)$sql$,'42501');
reset role;
rollback to savepoint revoked_profile;

savepoint inactive_account;
update public.access_accounts set ativo = false where auth_user_id = pg_temp.id(2);
set local role authenticated;
set local "request.jwt.claim.sub" = 'd1ae0000-0000-4000-8000-000000000002';
select pg_temp.assert_true(not public.has_current_assigned_audit_visit(current_setting('dialogo.test.audit')::uuid)
 and (select count(*) = 0 from public.audit_visits),'disabled account loses all assignment visibility');
select pg_temp.expect_error($sql$select public.confirm_audit_visit(pg_temp.id(301),current_setting('dialogo.test.audit')::uuid,1)$sql$,'42501');
reset role;
rollback to savepoint inactive_account;

savepoint inactive_work;
set local "request.jwt.claim.sub" = '13044e3f-e8d2-4b4b-9981-22a8de22c610';
update public.access_works set ativo = false where id = pg_temp.id(102);
set local role authenticated;
select pg_temp.assert_true(public.list_authorized_visit_auditors(pg_temp.id(102),'SEGURANCA') = '[]','inactive work has no nominees');
select pg_temp.expect_error($sql$select pg_temp.create_audit(201)$sql$,'42501');
set local "request.jwt.claim.sub" = 'd1ae0000-0000-4000-8000-000000000002';
select pg_temp.assert_true(not public.has_current_assigned_audit_visit(current_setting('dialogo.test.audit')::uuid),'inactive work revokes assigned access');
select pg_temp.expect_error($sql$select public.confirm_audit_visit(pg_temp.id(301),current_setting('dialogo.test.audit')::uuid,1)$sql$,'42501');
reset role;
rollback to savepoint inactive_work;

-- An unrelated published audit at the assigned work must remain invisible.
insert into public.published_audits(id,work_id,modulo,model_id,audit_date,auditor_auth_user_id,auditor_name,final_score,
 catalog_version,catalog_revision_label,criteria,responses,evidence_files,report_file_name,source_file_name,published_at)
 values(pg_temp.id(500),pg_temp.id(102),'SEGURANCA','security-it07-r02','2029-01-01',pg_temp.id(3),'Other auditor fixture',7,
 1,'Fixture R1',pg_temp.criterion(),'{"fixture-criterion":{"answer":"Conforme"}}','[]','fixture.pdf','fixture.pdf',clock_timestamp());
insert into storage.objects(id,bucket_id,name) values(pg_temp.id(501),'published-audits',pg_temp.id(102)::text || '/' || pg_temp.id(500)::text || '/fixture.pdf');
set local role authenticated;
set local "request.jwt.claim.sub" = 'd1ae0000-0000-4000-8000-000000000002';
select pg_temp.assert_true(public.read_published_audit_index('AUDITOR_SEGURANCA') = '[]'
 and public.read_published_audits('AUDITOR_SEGURANCA') = '[]'
 and not public.can_read_published_audit_storage(pg_temp.id(102),pg_temp.id(500))
 and (select count(*) = 0 from storage.objects),'assignment does not expose ranking, other reports or storage');
select pg_temp.expect_error('select * from public.published_audits','42501');
reset role;

-- Cancellation must invalidate the original successful confirmation replay.
set local role authenticated;
set local "request.jwt.claim.sub" = '13044e3f-e8d2-4b4b-9981-22a8de22c610';
select public.delete_audit_visit(pg_temp.id(600),current_setting('dialogo.test.audit')::uuid,1);
select public.delete_audit_visit(pg_temp.id(600),current_setting('dialogo.test.audit')::uuid,1);
set local "request.jwt.claim.sub" = 'd1ae0000-0000-4000-8000-000000000002';
select pg_temp.assert_true(not public.has_current_assigned_audit_visit(current_setting('dialogo.test.audit')::uuid)
 and not exists(select 1 from public.audit_visits where id = current_setting('dialogo.test.audit')::uuid)
 and not exists(select 1 from public.audit_visit_events where visit_id = current_setting('dialogo.test.audit')::uuid),
 'cancelled audit and history no longer confer assigned access');
select pg_temp.expect_error($sql$select public.confirm_audit_visit(pg_temp.id(301),current_setting('dialogo.test.audit')::uuid,1)$sql$,'42501');
reset role;

-- The existing publication trigger completes a foreign-work audit without
-- inserting any follow-up permissions, and its assignment then expires.
insert into public.published_audits(id,work_id,modulo,model_id,audit_date,auditor_auth_user_id,auditor_name,final_score,
 catalog_version,catalog_revision_label,criteria,responses,evidence_files,report_file_name,source_file_name,published_at)
 select pg_temp.id(700),obra_id,modulo,modelo_id,data_prevista,auditor_auth_user_id,'Quality auditor fixture',8,
 1,'Fixture R1',pg_temp.criterion(),'{"fixture-criterion":{"answer":"Conforme"}}','[]','fixture.pdf','fixture.pdf',clock_timestamp()
 from public.audit_visits where id = current_setting('dialogo.test.quality_audit')::uuid;
set local role authenticated;
set local "request.jwt.claim.sub" = 'd1ae0000-0000-4000-8000-000000000007';
select pg_temp.assert_true(not public.has_current_assigned_audit_visit(current_setting('dialogo.test.quality_audit')::uuid)
 and public.read_audit_agenda('AUDITOR_QUALIDADE')->'visits' = '[]'
 and (select count(*) = 0 from public.audit_visits)
 and public.read_audit_catalogs('AUDITOR_QUALIDADE') = '[]',
 'completed publication expires audit, agenda and assignment-only template visibility');
select pg_temp.expect_error($sql$select public.confirm_audit_visit(pg_temp.id(303),current_setting('dialogo.test.quality_audit')::uuid,1)$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_fvs_services('AUDITOR_QUALIDADE')$sql$,'42501');
reset role;
select pg_temp.assert_true(pg_temp.access_state() = (select payload from assignment_before),
 'all audit nominations, confirmations, cancellations and completion leave work, account and follow-up grants untouched');
select pg_temp.assert_true(not has_function_privilege('authenticated','dialogo_private.lock_audit_nominee(uuid,uuid,text)','EXECUTE')
 and not has_function_privilege('authenticated','dialogo_private.create_audit_visit_unscoped(uuid,uuid,text,text,uuid,date,text)','EXECUTE')
 and not has_function_privilege('authenticated','public.reschedule_audit_visit(uuid,uuid,integer,date,text)','EXECUTE'),
 'private nomination helpers and obsolete unscoped mutation endpoints remain revoked');
rollback;

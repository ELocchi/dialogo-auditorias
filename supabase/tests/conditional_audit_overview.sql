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

create function pg_temp.criteria() returns jsonb language sql as $test$
  select jsonb_agg(jsonb_build_object('id','c' || n,'code','01.' || n,'title','Item ' || n,'text','Descrição ' || n,
    'group','1. Grupo','subgroup','','source','Fixture','locator','1','documentedWeight',1,
    'configuredWeight',2,'weightConfigurationId','fixture','orientations','[]'::jsonb,'verificationRule','Conforme/Não Conforme') order by n)
  from generate_series(1,12) n;
$test$;
create function pg_temp.responses() returns jsonb language sql as $test$
  select '{
    "c1":{"answer":"Não conforme","note":"private note","serious":true,"photos":["p01-01.png"]},
    "c2":{"answer":"Conforme","checks":[{"id":"a","label":"private label","compliant":false,"weight":2,"photos":["p01-01.png"]}]},
    "c3":{"answer":"N/A"},"c4":{"answer":"5"},"c5":{"answer":"0"},"c6":{"answer":"10"},
    "c7":{"checks":[{"id":"b","label":"quantitative only","compliant":false}]},
    "c8":{"answer":null},"c9":{"answer":5},"c10":{"answer":"  Literal original  "},
    "c11":{"answer":""},"c12":{"answer":"Não verificado"}
  }'::jsonb;
$test$;
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 ('13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br','{"nome":"Dashboard sync admin"}',clock_timestamp()),
 (pg_temp.id(2),'dashboard.sync.multi@dialogo.com.br','{"nome":"Dashboard sync multiple profiles"}',clock_timestamp()),
 (pg_temp.id(3),'dashboard.sync.coordination@dialogo.com.br','{"nome":"Dashboard sync coordination"}',clock_timestamp()),
 (pg_temp.id(4),'dashboard.sync.quality.admin@dialogo.com.br','{"nome":"Dashboard sync quality admin"}',clock_timestamp());
select dialogo_private.bootstrap_first_administrator('13044e3f-e8d2-4b4b-9981-22a8de22c610',
 'emanuel.locchi@dialogo.com.br','Isolated overview test bootstrap');
update public.access_accounts set atuacao_administrativa='GERAL'
 where auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610';
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
insert into public.access_works(id,nome,created_by) values
 (pg_temp.id(101),'Dashboard sync first work',auth.uid()),(pg_temp.id(102),'Dashboard sync second work',auth.uid());
set local role authenticated;
select public.approve_access_request_v3(pg_temp.id(2),array['AUDITOR_SEGURANCA','AUDITOR_QUALIDADE','ENGENHARIA'],'EQUIPE_OBRA',null,
 jsonb_build_array(
  jsonb_build_object('perfil','AUDITOR_SEGURANCA','obra_id',pg_temp.id(101),'modulo','SEGURANCA'),
  jsonb_build_object('perfil','AUDITOR_QUALIDADE','obra_id',pg_temp.id(102),'modulo','QUALIDADE'),
  jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(101),'modulo','SEGURANCA'),
  jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(101),'modulo','QUALIDADE')),'Dashboard sync profile boundaries');
select public.approve_access_request_v3(pg_temp.id(3),array['ENGENHARIA'],'COORDENACAO',null,
 jsonb_build_array(
  jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(101),'modulo','SEGURANCA'),
  jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(101),'modulo','QUALIDADE')),'Dashboard sync coordination');
select public.approve_access_request_v3(pg_temp.id(4),array['ADMINISTRATIVO'],null,'QUALIDADE','[]','Dashboard sync scoped administration');
reset role;
insert into public.published_audits(id,work_id,modulo,model_id,audit_date,auditor_auth_user_id,auditor_name,final_score,
 catalog_version,catalog_revision_label,criteria,responses,evidence_files,report_file_name,source_file_name,published_at)
select pg_temp.id(500+n),pg_temp.id(case when n<=2 then 101 else 102 end),
 case when n%2=0 then 'QUALIDADE' else 'SEGURANCA' end,
 case when n%2=0 then 'quality-f176' else 'security-it07-r02' end,
 '2030-03-01',pg_temp.id(2),'Dashboard sync auditor',8,1,'Fixture R1',pg_temp.criteria(),pg_temp.responses(),
 '["p01-01.png"]','fixture.pdf','fixture.pdf',clock_timestamp() from generate_series(1,4) n;

insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at)
 values(pg_temp.id(5),'dashboard.sync.safety.admin@dialogo.com.br','{"nome":"Safety administrator"}',clock_timestamp());
set local role authenticated;
select public.approve_access_request_v3(pg_temp.id(5),array['ADMINISTRATIVO'],null,'SEGURANCA','[]','Dashboard scoped administration');
reset role;

set local role authenticated;
set local "request.jwt.claim.sub"='d1ae0000-0000-4000-8000-000000000002';
select set_config('dialogo.test.dashboard_revision',public.read_published_audit_overview_if_changed('ENGENHARIA','EQUIPE_OBRA')->>'revision',true);
select pg_temp.assert_true(public.read_published_audit_overview_if_changed('ENGENHARIA','EQUIPE_OBRA') - array['revision','unchanged']
 = public.read_published_audit_overview('ENGENHARIA','EQUIPE_OBRA'),
 'Cold conditional projection exactly matches every current metadata and finding field/order');
select pg_temp.assert_true(public.read_published_audit_overview_if_changed('ENGENHARIA','EQUIPE_OBRA',null,current_setting('dialogo.test.dashboard_revision'))
 = jsonb_build_object('revision',current_setting('dialogo.test.dashboard_revision'),'unchanged',true),
 'Matching revision returns exactly two fields and omits metadata/findings');
select pg_temp.assert_true(public.read_published_audit_overview_if_changed('ENGENHARIA','EQUIPE_OBRA')->>'unchanged'='false'
 and public.read_published_audit_overview_if_changed('ENGENHARIA','EQUIPE_OBRA',null,'invalid')->>'unchanged'='false'
 and public.read_published_audit_overview_if_changed('ENGENHARIA','EQUIPE_OBRA')->>'revision' ~ '^[0-9a-f]{32}$',
 'Absent or unrecognized revision requests a full stable projection');
select pg_temp.assert_true(public.read_published_audit_overview_if_changed('AUDITOR_SEGURANCA') - array['revision','unchanged']
 = public.read_published_audit_overview('AUDITOR_SEGURANCA')
 and jsonb_array_length(public.read_published_audit_overview_if_changed('AUDITOR_SEGURANCA')->'audits')=1,
 'Selected auditor role keeps work/module scope even with grants in other roles');
select set_config('dialogo.test.safety_revision',public.read_published_audit_overview_if_changed('AUDITOR_SEGURANCA')->>'revision',true);
select pg_temp.assert_true(public.read_published_audit_overview_if_changed('AUDITOR_QUALIDADE',null,null,current_setting('dialogo.test.safety_revision'))->>'unchanged'='false'
 and public.read_published_audit_overview_if_changed('AUDITOR_QUALIDADE')->'audits'->0->>'id'=pg_temp.id(504)::text,
 'Revision cannot be reused for another selected profile');
select pg_temp.expect_error($sql$select public.read_published_audit_overview_if_changed('ENGENHARIA','COORDENACAO',null,current_setting('dialogo.test.dashboard_revision'))$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_published_audit_overview_if_changed('AUDITOR_SEGURANCA','EQUIPE_OBRA',null,current_setting('dialogo.test.safety_revision'))$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_published_audit_overview_if_changed('ADMINISTRATIVO',null,'GERAL',current_setting('dialogo.test.dashboard_revision'))$sql$,'42501');

set local "request.jwt.claim.sub"='d1ae0000-0000-4000-8000-000000000003';
select pg_temp.assert_true(public.read_published_audit_overview_if_changed('ENGENHARIA','COORDENACAO',null,current_setting('dialogo.test.dashboard_revision'))->>'unchanged'='false'
 and public.read_published_audit_overview_if_changed('ENGENHARIA','COORDENACAO')->>'revision'<>current_setting('dialogo.test.dashboard_revision')
 and public.read_published_audit_overview_if_changed('ENGENHARIA','COORDENACAO') - array['revision','unchanged']
 = public.read_published_audit_overview('ENGENHARIA','COORDENACAO'),
 'Same visible publication IDs still have distinct identity/scope revisions');
set local "request.jwt.claim.sub"='d1ae0000-0000-4000-8000-000000000004';
select pg_temp.assert_true(public.read_published_audit_overview_if_changed('ADMINISTRATIVO',null,'GERAL') - array['revision','unchanged']
 = public.read_published_audit_overview('ADMINISTRATIVO',null,'GERAL')
 and jsonb_array_length(public.read_published_audit_overview_if_changed('ADMINISTRATIVO',null,'GERAL')->'audits')=2,
 'Quality administration cannot widen visibility by requesting General');
select set_config('dialogo.test.empty_revision',public.read_published_audit_overview_if_changed('ADMINISTRATIVO',null,'SEGURANCA')->>'revision',true);
select pg_temp.assert_true(public.read_published_audit_overview_if_changed('ADMINISTRATIVO',null,'SEGURANCA',current_setting('dialogo.test.empty_revision'))
 = jsonb_build_object('revision',current_setting('dialogo.test.empty_revision'),'unchanged',true),
 'Authorized empty result can be cached without inventing records');

-- Exercise every administrative account/selected-scope combination against the
-- previous reader; locale/order-sensitive JavaScript aggregation stays unchanged.
set local "request.jwt.claim.sub"='d1ae0000-0000-4000-8000-000000000005';
select pg_temp.assert_true(public.read_published_audit_overview_if_changed('ADMINISTRATIVO',null,'SEGURANCA') - array['revision','unchanged']
 = public.read_published_audit_overview('ADMINISTRATIVO',null,'SEGURANCA')
 and jsonb_array_length(public.read_published_audit_overview_if_changed('ADMINISTRATIVO',null,'SEGURANCA')->'audits')=2
 and public.read_published_audit_overview_if_changed('ADMINISTRATIVO',null,'QUALIDADE')->'audits'='[]'::jsonb,
 'Safety administration remains limited to Safety even if requesting Quality');
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
do $test$
declare selected text; actual jsonb;
begin
 foreach selected in array array['GERAL','QUALIDADE','SEGURANCA'] loop
  actual := public.read_published_audit_overview_if_changed('ADMINISTRATIVO',null,selected);
  perform pg_temp.assert_true(actual-array['revision','unchanged']=public.read_published_audit_overview('ADMINISTRATIVO',null,selected),
    'General administrator selected scope matches every old projection field/order');
  perform pg_temp.assert_true(public.read_published_audit_overview_if_changed('ADMINISTRATIVO',null,selected,actual->>'revision')
    =jsonb_build_object('revision',actual->>'revision','unchanged',true),
    'Every General administrator selected scope supports its own conditional token');
 end loop;
end $test$;

-- A publication in a different work must not disclose its insertion through the token.
reset role;
insert into public.published_audits(id,work_id,modulo,model_id,audit_date,auditor_auth_user_id,auditor_name,final_score,
 catalog_version,catalog_revision_label,criteria,responses,evidence_files,report_file_name,source_file_name,published_at)
values (pg_temp.id(600),pg_temp.id(102),'QUALIDADE','quality-f176','2030-04-01',pg_temp.id(2),'New publication auditor',8,
 1,'Fixture R1',pg_temp.criteria(),pg_temp.responses(),'[]','fixture.pdf','fixture.pdf',clock_timestamp());
set local role authenticated;
set local "request.jwt.claim.sub"='d1ae0000-0000-4000-8000-000000000002';
select pg_temp.assert_true(public.read_published_audit_overview_if_changed('ENGENHARIA','EQUIPE_OBRA',null,current_setting('dialogo.test.dashboard_revision'))->>'unchanged'='true',
 'Unrelated hidden publication does not alter the authorized revision');
reset role;
insert into public.published_audits(id,work_id,modulo,model_id,audit_date,auditor_auth_user_id,auditor_name,final_score,
 catalog_version,catalog_revision_label,criteria,responses,evidence_files,report_file_name,source_file_name,published_at)
values (pg_temp.id(601),pg_temp.id(101),'QUALIDADE','quality-f176','2030-04-01',pg_temp.id(2),'New publication auditor',8,
 1,'Fixture R1',pg_temp.criteria(),pg_temp.responses(),'[]','fixture.pdf','fixture.pdf',clock_timestamp());
set local role authenticated;
select pg_temp.assert_true(public.read_published_audit_overview_if_changed('ENGENHARIA','EQUIPE_OBRA',null,current_setting('dialogo.test.dashboard_revision'))->>'unchanged'='false'
 and jsonb_array_length(public.read_published_audit_overview_if_changed('ENGENHARIA','EQUIPE_OBRA',null,current_setting('dialogo.test.dashboard_revision'))->'audits')=3,
 'Authorized insertion changes the token and full result together');
select set_config('dialogo.test.dashboard_revision',public.read_published_audit_overview_if_changed('ENGENHARIA','EQUIPE_OBRA')->>'revision',true);

-- Exact grants affect the fingerprint without relying on time-based expiry.
reset role;
create temporary table dashboard_saved_grant as select * from public.access_grants
 where auth_user_id=pg_temp.id(2) and perfil='ENGENHARIA' and obra_id=pg_temp.id(101) and modulo='QUALIDADE';
delete from public.access_grants where auth_user_id=pg_temp.id(2) and perfil='ENGENHARIA' and obra_id=pg_temp.id(101) and modulo='QUALIDADE';
set local role authenticated;
select pg_temp.assert_true(public.read_published_audit_overview_if_changed('ENGENHARIA','EQUIPE_OBRA',null,current_setting('dialogo.test.dashboard_revision'))->>'unchanged'='false'
 and jsonb_array_length(public.read_published_audit_overview_if_changed('ENGENHARIA','EQUIPE_OBRA')->'audits')=1,
 'Grant revocation immediately changes the visible token and payload');
select set_config('dialogo.test.dashboard_revision',public.read_published_audit_overview_if_changed('ENGENHARIA','EQUIPE_OBRA')->>'revision',true);
reset role;
insert into public.access_grants select * from pg_temp.dashboard_saved_grant;
set local role authenticated;
select pg_temp.assert_true(public.read_published_audit_overview_if_changed('ENGENHARIA','EQUIPE_OBRA',null,current_setting('dialogo.test.dashboard_revision'))->>'unchanged'='false'
 and jsonb_array_length(public.read_published_audit_overview_if_changed('ENGENHARIA','EQUIPE_OBRA')->'audits')=3,
 'Restored grant is reflected immediately');
select set_config('dialogo.test.dashboard_revision',public.read_published_audit_overview_if_changed('ENGENHARIA','EQUIPE_OBRA')->>'revision',true);
reset role;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
update public.access_works set ativo=false where id=pg_temp.id(101);
set local role authenticated;
set local "request.jwt.claim.sub"='d1ae0000-0000-4000-8000-000000000002';
select pg_temp.assert_true(public.read_published_audit_overview_if_changed('ENGENHARIA','EQUIPE_OBRA',null,current_setting('dialogo.test.dashboard_revision'))->>'unchanged'='false'
 and public.read_published_audit_overview_if_changed('ENGENHARIA','EQUIPE_OBRA')->'audits'='[]'::jsonb,
 'Work deactivation invalidates the summary immediately');
select set_config('dialogo.test.dashboard_revision',public.read_published_audit_overview_if_changed('ENGENHARIA','EQUIPE_OBRA')->>'revision',true);
reset role;
update auth.users set banned_until=clock_timestamp()+interval '1 day' where id=pg_temp.id(2);
set local role authenticated;
select pg_temp.expect_error($sql$select public.read_published_audit_overview_if_changed('ENGENHARIA','EQUIPE_OBRA',null,current_setting('dialogo.test.dashboard_revision'))$sql$,'42501');
reset role;
update auth.users set banned_until=clock_timestamp()-interval '1 day' where id=pg_temp.id(2);
set local role authenticated;
select pg_temp.assert_true(public.read_published_audit_overview_if_changed('ENGENHARIA','EQUIPE_OBRA',null,current_setting('dialogo.test.dashboard_revision'))->>'unchanged'='true',
 'Expired ban allows a fresh authorization check without forcing unrelated projection changes');
reset role;
update public.access_accounts set ativo=false where auth_user_id=pg_temp.id(2);
set local role authenticated;
select pg_temp.expect_error($sql$select public.read_published_audit_overview_if_changed('ENGENHARIA','EQUIPE_OBRA',null,current_setting('dialogo.test.dashboard_revision'))$sql$,'42501');
reset role;
set local role anon;
select pg_temp.expect_error($sql$select public.read_published_audit_overview_if_changed('ENGENHARIA','EQUIPE_OBRA',null,current_setting('dialogo.test.dashboard_revision'))$sql$,'42501');
reset role;
set local role service_role;
select pg_temp.expect_error($sql$select public.read_published_audit_overview_if_changed('ENGENHARIA','EQUIPE_OBRA',null,current_setting('dialogo.test.dashboard_revision'))$sql$,'42501');
reset role;
rollback;

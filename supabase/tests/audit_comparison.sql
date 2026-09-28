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
 ('13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br','{"nome":"Comparison admin"}',clock_timestamp()),
 (pg_temp.id(2),'comparison.multi@dialogo.com.br','{"nome":"Comparison multiple profiles"}',clock_timestamp()),
 (pg_temp.id(3),'comparison.coordination@dialogo.com.br','{"nome":"Comparison coordination"}',clock_timestamp()),
 (pg_temp.id(4),'comparison.quality.admin@dialogo.com.br','{"nome":"Comparison quality admin"}',clock_timestamp());
select dialogo_private.bootstrap_first_administrator('13044e3f-e8d2-4b4b-9981-22a8de22c610',
 'emanuel.locchi@dialogo.com.br','Isolated overview test bootstrap');
update public.access_accounts set atuacao_administrativa='GERAL'
 where auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610';
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
insert into public.access_works(id,nome,created_by) values
 (pg_temp.id(101),'Comparison first work',auth.uid()),(pg_temp.id(102),'Comparison second work',auth.uid());
set local role authenticated;
select public.approve_access_request_v3(pg_temp.id(2),array['AUDITOR_SEGURANCA','AUDITOR_QUALIDADE','ENGENHARIA'],'EQUIPE_OBRA',null,
 jsonb_build_array(
  jsonb_build_object('perfil','AUDITOR_SEGURANCA','obra_id',pg_temp.id(101),'modulo','SEGURANCA'),
  jsonb_build_object('perfil','AUDITOR_QUALIDADE','obra_id',pg_temp.id(102),'modulo','QUALIDADE'),
  jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(101),'modulo','SEGURANCA'),
  jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(101),'modulo','QUALIDADE')),'Comparison profile boundaries');
select public.approve_access_request_v3(pg_temp.id(3),array['ENGENHARIA'],'COORDENACAO',null,
 jsonb_build_array(
  jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(101),'modulo','SEGURANCA'),
  jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(101),'modulo','QUALIDADE')),'Comparison coordination');
select public.approve_access_request_v3(pg_temp.id(4),array['ADMINISTRATIVO'],null,'QUALIDADE','[]','Comparison scoped administration');
reset role;
insert into public.published_audits(id,work_id,modulo,model_id,audit_date,auditor_auth_user_id,auditor_name,final_score,
 catalog_version,catalog_revision_label,criteria,responses,evidence_files,report_file_name,source_file_name,published_at)
select pg_temp.id(500+n),pg_temp.id(case when n<=2 then 101 else 102 end),
 case when n%2=0 then 'QUALIDADE' else 'SEGURANCA' end,
 case when n%2=0 then 'quality-f176' else 'security-it07-r02' end,
 '2030-03-01',pg_temp.id(2),'Comparison auditor',8,1,'Fixture R1',pg_temp.criteria(),pg_temp.responses(),
 '["p01-01.png"]','fixture.pdf','fixture.pdf',clock_timestamp() from generate_series(1,4) n;

-- Exact requested IDs, authorization and unchanged answer strings.
set local role authenticated;
set local "request.jwt.claim.sub"='d1ae0000-0000-4000-8000-000000000002';
select pg_temp.assert_true(public.read_published_audit_comparison(array[pg_temp.id(501),pg_temp.id(502),pg_temp.id(503)],'AUDITOR_SEGURANCA') = jsonb_build_array(jsonb_build_object(
  'id',pg_temp.id(501),'workId',pg_temp.id(101),'modelId','security-it07-r02','date','2030-03-01',
  'answers','{"c1":"Não conforme","c2":"Conforme","c3":"N/A","c4":"5","c5":"0","c6":"10","c10":"  Literal original  ","c11":"","c12":"Não verificado"}'::jsonb)),
  'Projection preserves string answers exactly, omits absent/null/non-string answers and all technical/evidence fields');
select pg_temp.assert_true(public.read_published_audit_comparison(array[pg_temp.id(999)],'AUDITOR_SEGURANCA')='[]'::jsonb,
  'Unknown ID remains absent');
select pg_temp.assert_true(public.read_published_audit_comparison(array[pg_temp.id(502),pg_temp.id(501),pg_temp.id(504)],'ENGENHARIA','EQUIPE_OBRA')->0->>'id'=pg_temp.id(502)::text
  and jsonb_array_length(public.read_published_audit_comparison(array[pg_temp.id(502),pg_temp.id(501),pg_temp.id(504)],'ENGENHARIA','EQUIPE_OBRA'))=2,
  'Engineering reads only scoped works and requested order');
select pg_temp.assert_true(public.read_published_audit_comparison(array[pg_temp.id(501),pg_temp.id(504)],'AUDITOR_QUALIDADE')->0->>'id'=pg_temp.id(504)::text
  and jsonb_array_length(public.read_published_audit_comparison(array[pg_temp.id(501),pg_temp.id(504)],'AUDITOR_QUALIDADE'))=1,
  'Auditor role cannot borrow a grant from another selected profile');
select pg_temp.expect_error($sql$select public.read_published_audit_comparison(array[pg_temp.id(501)],'ENGENHARIA','COORDENACAO')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_published_audit_comparison(array[pg_temp.id(501)],'AUDITOR_SEGURANCA','EQUIPE_OBRA')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_published_audit_comparison(array[pg_temp.id(501)],'ADMINISTRATIVO',null,'GERAL')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_published_audit_comparison(null,'AUDITOR_SEGURANCA')$sql$,'22023');
select pg_temp.expect_error($sql$select public.read_published_audit_comparison('{}'::uuid[],'AUDITOR_SEGURANCA')$sql$,'22023');
select pg_temp.expect_error($sql$select public.read_published_audit_comparison(array[pg_temp.id(501),null],'AUDITOR_SEGURANCA')$sql$,'22023');
select pg_temp.expect_error($sql$select public.read_published_audit_comparison(array[pg_temp.id(501),pg_temp.id(501)],'AUDITOR_SEGURANCA')$sql$,'22023');
select pg_temp.expect_error($sql$select public.read_published_audit_comparison(array[pg_temp.id(501),pg_temp.id(502),pg_temp.id(503),pg_temp.id(504)],'AUDITOR_SEGURANCA')$sql$,'22023');
select pg_temp.expect_error($sql$select public.read_published_audit_comparison(array[[pg_temp.id(501),pg_temp.id(502)]],'AUDITOR_SEGURANCA')$sql$,'22023');

set local "request.jwt.claim.sub"='d1ae0000-0000-4000-8000-000000000003';
select pg_temp.assert_true(jsonb_array_length(public.read_published_audit_comparison(array[pg_temp.id(501),pg_temp.id(502),pg_temp.id(504)],'ENGENHARIA','COORDENACAO'))=2,
  'Coordination has its own work scope');
set local "request.jwt.claim.sub"='d1ae0000-0000-4000-8000-000000000004';
select pg_temp.assert_true(jsonb_array_length(public.read_published_audit_comparison(array[pg_temp.id(501),pg_temp.id(502),pg_temp.id(504)],'ADMINISTRATIVO',null,'GERAL'))=2,
  'Quality administration never reads Safety when claiming General');
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select pg_temp.assert_true(jsonb_array_length(public.read_published_audit_comparison(array[pg_temp.id(501),pg_temp.id(502),pg_temp.id(504)],'ADMINISTRATIVO',null,'GERAL'))=3,
  'General administration reads all three requested authorized audits');
select pg_temp.assert_true(jsonb_array_length(public.read_published_audit_comparison(array[pg_temp.id(501),pg_temp.id(502),pg_temp.id(504)],'ADMINISTRATIVO',null,'SEGURANCA'))=1,
  'Administrative selected scope still limits comparisons');
select pg_temp.expect_error($sql$select * from public.published_audits$sql$,'42501');
reset role;
update public.access_works set ativo=false where id=pg_temp.id(101);
set local role authenticated;
set local "request.jwt.claim.sub"='d1ae0000-0000-4000-8000-000000000003';
select pg_temp.assert_true(public.read_published_audit_comparison(array[pg_temp.id(501),pg_temp.id(502)],'ENGENHARIA','COORDENACAO')='[]'::jsonb,
  'Inactive work immediately removes comparison data');
reset role;
update public.access_accounts set ativo=false where auth_user_id=pg_temp.id(3);
set local role authenticated;
select pg_temp.expect_error($sql$select public.read_published_audit_comparison(array[pg_temp.id(501)],'ENGENHARIA','COORDENACAO')$sql$,'42501');
reset role;
set local role anon;
select pg_temp.expect_error($sql$select public.read_published_audit_comparison(array[pg_temp.id(501)],'ENGENHARIA','COORDENACAO')$sql$,'42501');
reset role;
set local role service_role;
select pg_temp.expect_error($sql$select public.read_published_audit_comparison(array[pg_temp.id(501)],'ENGENHARIA','COORDENACAO')$sql$,'42501');
reset role;
rollback;

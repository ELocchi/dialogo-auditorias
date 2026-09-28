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
  from generate_series(1,7) n;
$test$;
create function pg_temp.responses() returns jsonb language sql as $test$
  select '{
    "c1":{"answer":"Não conforme","note":"  Falha principal  ","serious":true,"photos":["p01-01.png"]},
    "c2":{"answer":"Conforme","note":"Nota ignorada por haver subitens", "checks":[
      {"id":"a","label":"Contramarco","compliant":false,"note":"  Material sem proteção  ","weight":2,"photos":["p01-01.png"]},
      {"id":"b","label":"Conforme","compliant":true,"note":"Aprovado"},
      {"id":"c","label":"Sem identificação","compliant":false,"note":" "}]},
    "c3":{"answer":"Conforme","note":" APROVADO. "},
    "c4":{"answer":"5","note":""},
    "c5":{"answer":"Conforme","note":"","serious":true},
    "c6":{"answer":"Conforme","note":"Orientação adicional"},
    "c7":{"answer":"Conforme","note":"","checks":[{"id":"d","label":"Pendente","compliant":null}]}
  }'::jsonb;
$test$;
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 ('13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br','{"nome":"Overview admin"}',clock_timestamp()),
 (pg_temp.id(2),'overview.multi@dialogo.com.br','{"nome":"Overview multiple profiles"}',clock_timestamp()),
 (pg_temp.id(3),'overview.coordination@dialogo.com.br','{"nome":"Overview coordination"}',clock_timestamp()),
 (pg_temp.id(4),'overview.quality.admin@dialogo.com.br','{"nome":"Overview quality admin"}',clock_timestamp());
select dialogo_private.bootstrap_first_administrator('13044e3f-e8d2-4b4b-9981-22a8de22c610',
 'emanuel.locchi@dialogo.com.br','Isolated overview test bootstrap');
update public.access_accounts set atuacao_administrativa='GERAL'
 where auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610';
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
insert into public.access_works(id,nome,created_by) values
 (pg_temp.id(101),'Overview first work',auth.uid()),(pg_temp.id(102),'Overview second work',auth.uid());
set local role authenticated;
select public.approve_access_request_v3(pg_temp.id(2),array['AUDITOR_SEGURANCA','AUDITOR_QUALIDADE','ENGENHARIA'],'EQUIPE_OBRA',null,
 jsonb_build_array(
  jsonb_build_object('perfil','AUDITOR_SEGURANCA','obra_id',pg_temp.id(101),'modulo','SEGURANCA'),
  jsonb_build_object('perfil','AUDITOR_QUALIDADE','obra_id',pg_temp.id(102),'modulo','QUALIDADE'),
  jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(101),'modulo','SEGURANCA'),
  jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(101),'modulo','QUALIDADE')),'Overview profile boundaries');
select public.approve_access_request_v3(pg_temp.id(3),array['ENGENHARIA'],'COORDENACAO',null,
 jsonb_build_array(
  jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(101),'modulo','SEGURANCA'),
  jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(101),'modulo','QUALIDADE')),'Overview coordination');
select public.approve_access_request_v3(pg_temp.id(4),array['ADMINISTRATIVO'],null,'QUALIDADE','[]','Overview scoped administration');
reset role;
insert into public.published_audits(id,work_id,modulo,model_id,audit_date,auditor_auth_user_id,auditor_name,final_score,
 catalog_version,catalog_revision_label,criteria,responses,evidence_files,report_file_name,source_file_name,published_at)
select pg_temp.id(500+n),pg_temp.id(case when n<=2 then 101 else 102 end),
 case when n%2=0 then 'QUALIDADE' else 'SEGURANCA' end,
 case when n%2=0 then 'quality-f176' else 'security-it07-r02' end,
 '2030-03-01',pg_temp.id(2),'Overview auditor',8,1,'Fixture R1',pg_temp.criteria(),pg_temp.responses(),
 '["p01-01.png"]','fixture.pdf','fixture.pdf',clock_timestamp() from generate_series(1,4) n;

-- Findings match the existing UI extractor, including quantitative subitems.
select pg_temp.assert_true(dialogo_private.published_audit_findings(pg_temp.criteria(),pg_temp.responses()) =
 '[{"id":"c1","item":"01.1","description":"Item 1","criterionTitle":"Item 1","serious":true,"nonconformity":"Falha principal"},
   {"id":"c2:a","item":"01.2","description":"Item 2 — Contramarco","criterionTitle":"Item 2","subitem":"Contramarco","serious":false,"nonconformity":"Material sem proteção"},
   {"id":"c2:c","item":"01.2","description":"Item 2 — Sem identificação","criterionTitle":"Item 2","subitem":"Sem identificação","serious":false,"nonconformity":"Verificação “Sem identificação” registrada como não conforme."},
   {"id":"c4","item":"01.4","description":"Item 4","criterionTitle":"Item 4","serious":false,"nonconformity":"Descrição 4"},
   {"id":"c5","item":"01.5","description":"Item 5","criterionTitle":"Item 5","serious":true,"nonconformity":"Descrição 5"},
   {"id":"c6","item":"01.6","description":"Item 6","criterionTitle":"Item 6","serious":false,"nonconformity":"Orientação adicional"}]'::jsonb,
 'Compact finding projection preserves quantitative, score, note, serious and approved semantics');

set local role authenticated;
set local "request.jwt.claim.sub"='d1ae0000-0000-4000-8000-000000000002';
select pg_temp.assert_true(jsonb_array_length(public.read_published_audit_overview('AUDITOR_SEGURANCA')->'audits')=1
 and public.read_published_audit_overview('AUDITOR_SEGURANCA')->'audits'->0->>'id'=pg_temp.id(501)::text
 and jsonb_array_length(public.read_published_audit_overview('AUDITOR_SEGURANCA')->'findings')=6,
 'Selected auditor profile sees exactly its work/module and compact findings');
select pg_temp.assert_true(public.read_published_audit_detail(pg_temp.id(502),'AUDITOR_SEGURANCA')='[]'::jsonb
 and public.read_published_audit_report(pg_temp.id(502),'AUDITOR_SEGURANCA') is null
 and public.read_published_audit_detail(pg_temp.id(503),'AUDITOR_SEGURANCA')='[]'::jsonb,
 'Other profile grants never leak through a selected auditor profile or report');
select pg_temp.assert_true(public.read_published_audit_overview('AUDITOR_QUALIDADE')->'audits'->0->>'id'=pg_temp.id(504)::text,
 'Quality profile has its own work boundary');
select pg_temp.assert_true(jsonb_array_length(public.read_published_audit_overview('ENGENHARIA','EQUIPE_OBRA')->'audits')=2
 and jsonb_array_length(public.read_published_audit_overview('ENGENHARIA','EQUIPE_OBRA')->'findings')=12
 and public.read_published_audit_detail(pg_temp.id(504),'ENGENHARIA','EQUIPE_OBRA')='[]'::jsonb,
 'Engineering summary and single details retain authorized work boundaries');
select pg_temp.assert_true(not (public.read_published_audit_overview('ENGENHARIA','EQUIPE_OBRA')->'audits'->0 ?| array['criteria','responses','evidenceFiles','reportFileName'])
 and not (public.read_published_audit_overview('ENGENHARIA','EQUIPE_OBRA')->'findings'->0 ?| array['photos','checks','evidencePhotos','verificationCriterion']),
 'Overview never serializes full criteria, checks, evidence or report files');
select pg_temp.assert_true(jsonb_array_length(public.read_published_audit_detail(pg_temp.id(502),'ENGENHARIA','EQUIPE_OBRA'))=1
 and public.read_published_audit_detail(pg_temp.id(502),'ENGENHARIA','EQUIPE_OBRA')->0->'criteria'->0->'documentedWeight'='null'::jsonb
 and not (public.read_published_audit_detail(pg_temp.id(502),'ENGENHARIA','EQUIPE_OBRA')->0->'criteria'->0 ? 'configuredWeight')
 and not (public.read_published_audit_detail(pg_temp.id(502),'ENGENHARIA','EQUIPE_OBRA')->0->'responses'->'c2'->'checks'->0 ? 'weight'),
 'On-demand Engineering detail retains technical-weight projection');
select pg_temp.assert_true(public.read_published_audit_detail(pg_temp.id(501),'AUDITOR_SEGURANCA')->0->'criteria'->0->>'configuredWeight'='2'
 and public.read_published_audit_report(pg_temp.id(501),'AUDITOR_SEGURANCA') = jsonb_build_object(
   'id',pg_temp.id(501),'workId',pg_temp.id(101),'modelId','security-it07-r02','reportFileName','fixture.pdf'),
 'Auditor detail retains weights; PDF click retrieves only its authorized file reference');
select pg_temp.expect_error($sql$select public.read_published_audit_overview('ENGENHARIA','COORDENACAO')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_published_audit_overview('AUDITOR_SEGURANCA','EQUIPE_OBRA')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_published_audit_detail(pg_temp.id(501),'ADMINISTRATIVO',null,'GERAL')$sql$,'42501');

set local "request.jwt.claim.sub"='d1ae0000-0000-4000-8000-000000000003';
select pg_temp.assert_true(jsonb_array_length(public.read_published_audit_overview('ENGENHARIA','COORDENACAO')->'audits')=2,
 'Coordination can read its compact overview');
set local "request.jwt.claim.sub"='d1ae0000-0000-4000-8000-000000000004';
select pg_temp.assert_true(jsonb_array_length(public.read_published_audit_overview('ADMINISTRATIVO',null,'QUALIDADE')->'audits')=2
 and public.read_published_audit_report(pg_temp.id(501),'ADMINISTRATIVO',null,'GERAL') is null,
 'Quality administration never exposes Safety even when requesting General');
select pg_temp.expect_error($sql$select * from public.published_audits$sql$,'42501');
reset role;

-- Account and work deactivation invalidate every new read immediately.
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
update public.access_works set ativo=false where id=pg_temp.id(101);
set local role authenticated;
set local "request.jwt.claim.sub"='d1ae0000-0000-4000-8000-000000000003';
select pg_temp.assert_true(public.read_published_audit_overview('ENGENHARIA','COORDENACAO')->'audits'='[]'::jsonb
 and public.read_published_audit_detail(pg_temp.id(501),'ENGENHARIA','COORDENACAO')='[]'::jsonb
 and public.read_published_audit_report(pg_temp.id(501),'ENGENHARIA','COORDENACAO') is null,
 'Inactive work invalidates overview, detail and report');
reset role;
update public.access_accounts set ativo=false where auth_user_id=pg_temp.id(3);
set local role authenticated;
select pg_temp.expect_error($sql$select public.read_published_audit_overview('ENGENHARIA','COORDENACAO')$sql$,'42501');
reset role;
set local role anon;
select pg_temp.expect_error($sql$select public.read_published_audit_overview('ENGENHARIA','COORDENACAO')$sql$,'42501');
reset role;
set local role service_role;
select pg_temp.expect_error($sql$select public.read_published_audit_report(pg_temp.id(501),'ENGENHARIA','COORDENACAO')$sql$,'42501');
reset role;
rollback;

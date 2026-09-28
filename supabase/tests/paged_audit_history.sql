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
 ('13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br','{"nome":"History admin"}',clock_timestamp()),
 (pg_temp.id(2),'history.multi@dialogo.com.br','{"nome":"History multiple profiles"}',clock_timestamp()),
 (pg_temp.id(3),'history.coordination@dialogo.com.br','{"nome":"History coordination"}',clock_timestamp()),
 (pg_temp.id(4),'history.quality.admin@dialogo.com.br','{"nome":"History quality admin"}',clock_timestamp());
select dialogo_private.bootstrap_first_administrator('13044e3f-e8d2-4b4b-9981-22a8de22c610',
 'emanuel.locchi@dialogo.com.br','Isolated overview test bootstrap');
update public.access_accounts set atuacao_administrativa='GERAL'
 where auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610';
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
insert into public.access_works(id,nome,created_by) values
 (pg_temp.id(101),'History first work',auth.uid()),(pg_temp.id(102),'History second work',auth.uid());
set local role authenticated;
select public.approve_access_request_v3(pg_temp.id(2),array['AUDITOR_SEGURANCA','AUDITOR_QUALIDADE','ENGENHARIA'],'EQUIPE_OBRA',null,
 jsonb_build_array(
  jsonb_build_object('perfil','AUDITOR_SEGURANCA','obra_id',pg_temp.id(101),'modulo','SEGURANCA'),
  jsonb_build_object('perfil','AUDITOR_QUALIDADE','obra_id',pg_temp.id(102),'modulo','QUALIDADE'),
  jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(101),'modulo','SEGURANCA'),
  jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(101),'modulo','QUALIDADE')),'History profile boundaries');
select public.approve_access_request_v3(pg_temp.id(3),array['ENGENHARIA'],'COORDENACAO',null,
 jsonb_build_array(
  jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(101),'modulo','SEGURANCA'),
  jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(101),'modulo','QUALIDADE')),'History coordination');
select public.approve_access_request_v3(pg_temp.id(4),array['ADMINISTRATIVO'],null,'QUALIDADE','[]','History scoped administration');
reset role;
insert into public.published_audits(id,work_id,modulo,model_id,audit_date,auditor_auth_user_id,auditor_name,final_score,
 catalog_version,catalog_revision_label,criteria,responses,evidence_files,report_file_name,source_file_name,published_at)
select pg_temp.id(500+n),pg_temp.id(case when n<=2 then 101 else 102 end),
 case when n%2=0 then 'QUALIDADE' else 'SEGURANCA' end,
 case when n%2=0 then 'quality-f176' else 'security-it07-r02' end,
 '2030-03-01',pg_temp.id(2),'History auditor',8,1,'Fixture R1',pg_temp.criteria(),pg_temp.responses(),
 '["p01-01.png"]','fixture.pdf','fixture.pdf',clock_timestamp() from generate_series(1,4) n;

-- Enough publications for three pages, including empty findings and tied dates.
insert into public.published_audits(id,work_id,modulo,model_id,audit_date,auditor_auth_user_id,auditor_name,final_score,
 catalog_version,catalog_revision_label,criteria,responses,evidence_files,report_file_name,source_file_name,published_at)
select pg_temp.id(600+n),pg_temp.id(101),'QUALIDADE','quality-f176',
 case when n<=12 then '2030-03-01'::date else '2030-04-01'::date end,pg_temp.id(2),'History auditor',8,1,'Fixture R1',
 pg_temp.criteria(),case when n%2=0 then pg_temp.responses() else '{}'::jsonb end,
 '["p01-01.png"]','fixture.pdf','fixture.pdf',clock_timestamp() from generate_series(1,24) n;

set local role authenticated;
set local "request.jwt.claim.sub"='d1ae0000-0000-4000-8000-000000000002';
select pg_temp.assert_true(public.read_published_audit_history('AUDITOR_SEGURANCA')->>'total'='1'
 and public.read_published_audit_history('AUDITOR_SEGURANCA')->'audits'->0->>'id'=pg_temp.id(501)::text,
 'Selected Safety auditor sees only its authorized work and module, not other profile grants');
select pg_temp.assert_true(public.read_published_audit_history('AUDITOR_QUALIDADE')->>'total'='1'
 and public.read_published_audit_history('AUDITOR_QUALIDADE')->'audits'->0->>'id'=pg_temp.id(504)::text,
 'Quality auditor sees exactly its separately granted work');
select pg_temp.assert_true(public.read_published_audit_history('ENGENHARIA','EQUIPE_OBRA')->>'total'='26'
 and jsonb_array_length(public.read_published_audit_history('ENGENHARIA','EQUIPE_OBRA')->'audits')=10
 and public.read_published_audit_history('ENGENHARIA','EQUIPE_OBRA')->'audits'->0->>'id'=pg_temp.id(624)::text,
 'Default page contains ten rows and complete scoped total, with descending date/id');

do $test$
declare combined jsonb := '[]'::jsonb; page jsonb; n integer;
begin
 for n in 1..3 loop
   page := public.read_published_audit_history('ENGENHARIA','EQUIPE_OBRA',p_page=>n);
   perform pg_temp.assert_true(page->>'total'='26' and (page->>'page')::integer=n,
     'Every page retains exact total and requested page');
   perform pg_temp.assert_true(not exists (
     select 1 from jsonb_array_elements(page->'findings') f
     where not exists (select 1 from jsonb_array_elements(page->'audits') a where a->>'id'=f->>'auditId')),
     'Findings belong exclusively to the selected page');
   perform pg_temp.assert_true(not exists (
     select 1 from jsonb_array_elements(page->'audits') a where a ?| array['criteria','responses','evidenceFiles','reportFileName']),
     'Paged metadata excludes detail and private evidence');
   combined := combined || (page->'audits');
 end loop;
 perform pg_temp.assert_true(jsonb_array_length(combined)=26
   and (select count(distinct a->>'id') from jsonb_array_elements(combined) a)=26,
   'All three pages contain every scoped publication exactly once');
 perform pg_temp.assert_true(combined->9->>'id'=pg_temp.id(615)::text
   and combined->10->>'id'=pg_temp.id(614)::text
   and combined->25->>'id'=pg_temp.id(501)::text,
   'Tied dates remain in stable descending UUID order across page boundaries');
end $test$;

select pg_temp.assert_true(public.read_published_audit_history('ENGENHARIA','EQUIPE_OBRA',p_page=>4)->'audits'='[]'::jsonb
 and public.read_published_audit_history('ENGENHARIA','EQUIPE_OBRA',p_page=>4)->>'total'='26',
 'Page beyond the last returns empty rows with real total');
select pg_temp.assert_true(public.read_published_audit_history('ENGENHARIA','EQUIPE_OBRA',p_page=>2147483647)->'audits'='[]'::jsonb,
 'Large valid page arithmetic cannot overflow');
select pg_temp.assert_true(public.read_published_audit_history('ENGENHARIA','EQUIPE_OBRA',p_module=>'quality')->>'total'='25'
 and public.read_published_audit_history('ENGENHARIA','EQUIPE_OBRA',p_module=>'safety')->>'total'='1'
 and public.read_published_audit_history('ENGENHARIA','EQUIPE_OBRA',p_model_id=>'quality-f175')->>'total'='0',
 'Module and model filters are applied before count and pagination');
select pg_temp.assert_true(public.read_published_audit_history('ENGENHARIA','EQUIPE_OBRA',p_date_from=>'2030-03-01',p_date_to=>'2030-03-01')->>'total'='14'
 and public.read_published_audit_history('ENGENHARIA','EQUIPE_OBRA',p_date_from=>'2030-03-02',p_date_to=>'2030-04-01')->>'total'='12',
 'Date boundaries are inclusive and affect total');
select pg_temp.assert_true(public.read_published_audit_history('ENGENHARIA','EQUIPE_OBRA',p_only_with_findings=>true)->>'total'='14',
 'Only-with-findings counts publications instead of individual failed checks');
select pg_temp.assert_true(public.read_published_audit_history('ENGENHARIA','EQUIPE_OBRA',p_work_id=>pg_temp.id(102))->>'total'='0'
 and public.read_published_audit_history('ENGENHARIA','EQUIPE_OBRA',p_work_id=>pg_temp.id(999))->>'total'='0',
 'Denied and nonexistent works are indistinguishable');
select pg_temp.assert_true(public.read_published_audit_history('ENGENHARIA','EQUIPE_OBRA',p_audit_id=>pg_temp.id(501))->>'total'='1'
 and public.read_published_audit_history('ENGENHARIA','EQUIPE_OBRA',p_audit_id=>pg_temp.id(504))->>'total'='0'
 and public.read_published_audit_history('ENGENHARIA','EQUIPE_OBRA',p_audit_id=>pg_temp.id(999))->>'total'='0',
 'Direct lookup respects the same work scope and unknown IDs stay absent');
select pg_temp.assert_true(public.read_published_audit_history('ENGENHARIA','EQUIPE_OBRA',p_work_id=>pg_temp.id(101),p_model_id=>'quality-f176',p_page_size=>3,p_include_findings=>false,p_exclude_audit_id=>pg_temp.id(624)) = jsonb_build_object(
 'total',24,'page',1,'pageSize',3,
 'audits',public.read_published_audit_history('ENGENHARIA','EQUIPE_OBRA',p_work_id=>pg_temp.id(101),p_model_id=>'quality-f176',p_page_size=>3,p_include_findings=>false,p_exclude_audit_id=>pg_temp.id(624))->'audits','findings','[]'::jsonb)
 and public.read_published_audit_history('ENGENHARIA','EQUIPE_OBRA',p_work_id=>pg_temp.id(101),p_model_id=>'quality-f176',p_page_size=>3,p_include_findings=>false,p_exclude_audit_id=>pg_temp.id(624))->'audits'->0->>'id'=pg_temp.id(623)::text,
 'Comparison lookup selects three latest metadata records and no findings');
select pg_temp.expect_error($sql$select public.read_published_audit_history('ENGENHARIA','COORDENACAO')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_published_audit_history('AUDITOR_SEGURANCA','EQUIPE_OBRA')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_published_audit_history('ADMINISTRATIVO',null,'GERAL')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_published_audit_history('ENGENHARIA','EQUIPE_OBRA',p_page=>0)$sql$,'22023');
select pg_temp.expect_error($sql$select public.read_published_audit_history('ENGENHARIA','EQUIPE_OBRA',p_page_size=>51)$sql$,'22023');
select pg_temp.expect_error($sql$select public.read_published_audit_history('ENGENHARIA','EQUIPE_OBRA',p_page_size=>null)$sql$,'22023');
select pg_temp.expect_error($sql$select public.read_published_audit_history('ENGENHARIA','EQUIPE_OBRA',p_module=>'invalid')$sql$,'22023');
select pg_temp.expect_error($sql$select public.read_published_audit_history('ENGENHARIA','EQUIPE_OBRA',p_model_id=>'invalid')$sql$,'22023');
select pg_temp.expect_error($sql$select public.read_published_audit_history('ENGENHARIA','EQUIPE_OBRA',p_date_from=>'2030-04-01',p_date_to=>'2030-03-01')$sql$,'22023');
select pg_temp.expect_error($sql$select public.read_published_audit_history('ENGENHARIA','EQUIPE_OBRA',p_date_to=>'infinity')$sql$,'22023');
select pg_temp.expect_error($sql$select public.read_published_audit_history('ENGENHARIA','EQUIPE_OBRA',p_include_findings=>null)$sql$,'22023');

set local "request.jwt.claim.sub"='d1ae0000-0000-4000-8000-000000000003';
select pg_temp.assert_true(public.read_published_audit_history('ENGENHARIA','COORDENACAO')->>'total'='26',
 'Coordination pagination keeps its own scope');
set local "request.jwt.claim.sub"='d1ae0000-0000-4000-8000-000000000004';
select pg_temp.assert_true(public.read_published_audit_history('ADMINISTRATIVO',null,'GERAL')->>'total'='26'
 and public.read_published_audit_history('ADMINISTRATIVO',null,'SEGURANCA')->>'total'='0',
 'Quality administrator cannot widen module by claiming General');
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select pg_temp.assert_true(public.read_published_audit_history('ADMINISTRATIVO',null,'GERAL',p_page_size=>50)->>'total'='28'
 and jsonb_array_length(public.read_published_audit_history('ADMINISTRATIVO',null,'GERAL',p_page_size=>50)->'audits')=28,
 'General administrator can request the maximum allowed page');
select pg_temp.assert_true(public.read_published_audit_history('ADMINISTRATIVO',null,'SEGURANCA')->>'total'='2',
 'Selected administrative module still applies');
select pg_temp.expect_error($sql$select * from public.published_audits$sql$,'42501');
reset role;
update public.access_works set ativo=false where id=pg_temp.id(101);
set local role authenticated;
set local "request.jwt.claim.sub"='d1ae0000-0000-4000-8000-000000000003';
select pg_temp.assert_true(public.read_published_audit_history('ENGENHARIA','COORDENACAO')->>'total'='0'
 and public.read_published_audit_history('ENGENHARIA','COORDENACAO')->'findings'='[]'::jsonb,
 'Inactive works are removed from both total and page');
reset role;
update public.access_accounts set ativo=false where auth_user_id=pg_temp.id(3);
set local role authenticated;
select pg_temp.expect_error($sql$select public.read_published_audit_history('ENGENHARIA','COORDENACAO')$sql$,'42501');
reset role;
set local role anon;
select pg_temp.expect_error($sql$select public.read_published_audit_history('ENGENHARIA','COORDENACAO')$sql$,'42501');
reset role;
set local role service_role;
select pg_temp.expect_error($sql$select public.read_published_audit_history('ENGENHARIA','COORDENACAO')$sql$,'42501');
reset role;
rollback;

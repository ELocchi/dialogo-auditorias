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
  from generate_series(1,10) n;
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
    "c7":{"answer":"Conforme","note":"","checks":[{"id":"d","label":"Pendente","compliant":null}]},
    "c8":{"answer":"0","note":""},
    "c9":{"answer":"10","note":" Aprovado "}
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
 case when n=4 then '2030-04-01'::date else '2030-03-01'::date end,pg_temp.id(2),'Overview auditor',8,1,'Fixture R1',pg_temp.criteria(),case when n=3 then '{}'::jsonb else pg_temp.responses() end,
 '["p01-01.png"]','fixture.pdf','fixture.pdf',clock_timestamp() from generate_series(1,4) n;

-- Save the actual pre-upgrade API output, full immutable records and helper
-- definitions. The upgrade runs against already-published rows, not an empty
-- table; no audit trigger is disabled to backfill the generated projection.
create temporary table before_records as
 select id,to_jsonb(a) as record,dialogo_private.published_audit_findings(criteria,responses) as findings
 from public.published_audits a;
create temporary table before_functions as
 select p.oid::regprocedure::text as signature,pg_get_functiondef(p.oid) as definition
 from pg_proc p where p.oid in (
  'dialogo_private.published_audit_findings(jsonb,jsonb)'::regprocedure,
  'public.read_published_audits(text,text,text)'::regprocedure,
  'public.read_published_audit_detail(uuid,text,text,text)'::regprocedure,
  'public.read_published_audit_report(uuid,text,text,text)'::regprocedure);
create temporary table before_overviews (
 actor uuid,profile text,engineering_scope text,administrative_scope text,overview jsonb
);
insert into before_overviews(actor,profile,engineering_scope,administrative_scope) values
 ('13044e3f-e8d2-4b4b-9981-22a8de22c610','ADMINISTRATIVO',null,'GERAL'),
 ('13044e3f-e8d2-4b4b-9981-22a8de22c610','ADMINISTRATIVO',null,'QUALIDADE'),
 ('13044e3f-e8d2-4b4b-9981-22a8de22c610','ADMINISTRATIVO',null,'SEGURANCA'),
 (pg_temp.id(2),'AUDITOR_SEGURANCA',null,null),
 (pg_temp.id(2),'AUDITOR_QUALIDADE',null,null),
 (pg_temp.id(2),'ENGENHARIA','EQUIPE_OBRA',null),
 (pg_temp.id(3),'ENGENHARIA','COORDENACAO',null),
 (pg_temp.id(4),'ADMINISTRATIVO',null,'QUALIDADE');
do $test$ declare fixture record;
begin
 for fixture in select * from before_overviews loop
  perform set_config('request.jwt.claim.sub',fixture.actor::text,true);
  update before_overviews set overview=public.read_published_audit_overview(
   fixture.profile,fixture.engineering_scope,fixture.administrative_scope)
  where actor=fixture.actor and profile=fixture.profile
   and engineering_scope is not distinct from fixture.engineering_scope
   and administrative_scope is not distinct from fixture.administrative_scope;
 end loop;
end $test$;
grant select on before_overviews to authenticated;

select pg_temp.assert_true((select provolatile='i' from pg_proc
 where oid='dialogo_private.published_audit_findings(jsonb,jsonb)'::regprocedure),
 'The existing calculation is immutable and valid for stored generation');
select pg_temp.assert_true((select findings from before_records where id=pg_temp.id(501)) =
 '[{"id":"c1","item":"01.1","description":"Item 1","criterionTitle":"Item 1","serious":true,"nonconformity":"Falha principal"},
   {"id":"c2:a","item":"01.2","description":"Item 2 — Contramarco","criterionTitle":"Item 2","subitem":"Contramarco","serious":false,"nonconformity":"Material sem proteção"},
   {"id":"c2:c","item":"01.2","description":"Item 2 — Sem identificação","criterionTitle":"Item 2","subitem":"Sem identificação","serious":false,"nonconformity":"Verificação “Sem identificação” registrada como não conforme."},
   {"id":"c4","item":"01.4","description":"Item 4","criterionTitle":"Item 4","serious":false,"nonconformity":"Descrição 4"},
   {"id":"c5","item":"01.5","description":"Item 5","criterionTitle":"Item 5","serious":true,"nonconformity":"Descrição 5"},
   {"id":"c6","item":"01.6","description":"Item 6","criterionTitle":"Item 6","serious":false,"nonconformity":"Orientação adicional"},
   {"id":"c8","item":"01.8","description":"Item 8","criterionTitle":"Item 8","serious":false,"nonconformity":"Descrição 8"}]'::jsonb,
 'Baseline includes quantitative subitems, security scores zero/five, notes, serious and approved semantics');
select pg_temp.assert_true((select findings='[]'::jsonb from before_records where id=pg_temp.id(503)),
 'Unanswered criteria produce zero findings');
commit;

-- MIGRATION_UPGRADE_BOUNDARY

begin;
select pg_temp.assert_true((select count(*)=4 and bool_and(
 (to_jsonb(a)-'findings_summary')=b.record and a.findings_summary=b.findings)
 from public.published_audits a join before_records b using(id)),
 'Upgrade backfills summaries and preserves every original audit value');
select pg_temp.assert_true((select attgenerated='s' and attnotnull from pg_attribute
 where attrelid='public.published_audits'::regclass and attname='findings_summary'),
 'Summary is a stored generated non-null column');
select pg_temp.assert_true((select bool_and(pg_get_functiondef(signature::regprocedure)=definition)
 from before_functions),
 'Calculation and detailed/report/legacy readers are unchanged');
select pg_temp.assert_true((select count(*)=2 and bool_and(tgenabled='O') from pg_trigger
 where tgrelid='public.published_audits'::regclass
 and tgname in ('published_audits_immutable','published_audits_no_truncate')),
 'Immutable UPDATE/DELETE/TRUNCATE protection remains enabled');
select pg_temp.expect_error($sql$update public.published_audits set auditor_name='Changed'
 where id=pg_temp.id(501)$sql$,'55000');
select pg_temp.expect_error($sql$delete from public.published_audits where id=pg_temp.id(501)$sql$,'55000');
select pg_temp.expect_error($sql$truncate public.published_audits cascade$sql$,'55000');

-- No table or newly-added column becomes accessible through direct API reads,
-- including projects retaining permissive default grants on future objects.
do $test$ declare actor text; permission text;
begin
 foreach actor in array array['anon','authenticated','service_role'] loop
  foreach permission in array array['SELECT','INSERT','UPDATE','REFERENCES'] loop
   perform pg_temp.assert_true(not has_column_privilege(actor,'public.published_audits','findings_summary',permission),
    actor || ' has no direct ' || permission || ' grant on stored summaries');
  end loop;
  perform pg_temp.assert_true(not has_function_privilege(actor,
   'dialogo_private.published_audit_findings(jsonb,jsonb)','EXECUTE'),
   actor || ' cannot invoke the private calculation');
 end loop;
end $test$;

-- Replacing the calculation with a failing sentinel in this disposable test
-- proves reads never invoke it. No production helper is changed by migration.
create or replace function dialogo_private.published_audit_findings(p_criteria jsonb,p_responses jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $test$
begin raise exception 'unexpected_finding_recalculation'; end;
$test$;
set local role authenticated;
do $test$ declare fixture record;
begin
 for fixture in select * from before_overviews loop
  perform set_config('request.jwt.claim.sub',fixture.actor::text,true);
  perform pg_temp.assert_true(public.read_published_audit_overview(
   fixture.profile,fixture.engineering_scope,fixture.administrative_scope)=fixture.overview,
   'Cached overview is byte-for-byte JSON equivalent for ' || fixture.profile || coalesce(fixture.engineering_scope,fixture.administrative_scope,''));
 end loop;
end $test$;
set local "request.jwt.claim.sub"='d1ae0000-0000-4000-8000-000000000002';
select pg_temp.assert_true(public.read_published_audit_overview('AUDITOR_SEGURANCA')->'audits'->0->>'id'=pg_temp.id(501)::text
 and public.read_published_audit_overview('AUDITOR_QUALIDADE')->'audits'->0->>'id'=pg_temp.id(504)::text
 and jsonb_array_length(public.read_published_audit_overview('ENGENHARIA','EQUIPE_OBRA')->'audits')=2,
 'Cached findings preserve exact work/module/profile isolation');
select pg_temp.expect_error($sql$select public.read_published_audit_overview('ENGENHARIA','COORDENACAO')$sql$,'42501');
select pg_temp.expect_error($sql$select findings_summary from public.published_audits$sql$,'42501');
reset role;
do $test$ declare original text;
begin
 select definition into strict original from before_functions
 where signature='dialogo_private.published_audit_findings(jsonb,jsonb)';
 execute original;
end $test$;

-- The existing explicit INSERT shape needs no extra input: PostgreSQL computes
-- the projection for future publications and forbids supplied stale summaries.
insert into public.published_audits(id,work_id,modulo,model_id,audit_date,auditor_auth_user_id,auditor_name,final_score,
 catalog_version,catalog_revision_label,criteria,responses,evidence_files,report_file_name,source_file_name,published_at)
values (pg_temp.id(505),pg_temp.id(101),'QUALIDADE','quality-f175','2030-05-01',pg_temp.id(2),'Overview auditor',5,1,
 'Fixture R1',pg_temp.criteria(),pg_temp.responses(),'[]','new.pdf','new.pdf',clock_timestamp());
select pg_temp.assert_true((select findings_summary=b.findings
 from public.published_audits a cross join before_records b where a.id=pg_temp.id(505) and b.id=pg_temp.id(501)),
 'New publication automatically receives the same generated findings');
select pg_temp.expect_error($sql$
 insert into public.published_audits(id,findings_summary) values(pg_temp.id(506),'[]')
$sql$,'428C9');

set local role authenticated;
set local "request.jwt.claim.sub"='d1ae0000-0000-4000-8000-000000000003';
select pg_temp.assert_true(public.read_published_audit_overview('ENGENHARIA','COORDENACAO')->'audits'->0->>'id'=pg_temp.id(505)::text
 and public.read_published_audit_overview('ENGENHARIA','COORDENACAO')->'audits'->1->>'id'=pg_temp.id(501)::text
 and public.read_published_audit_overview('ENGENHARIA','COORDENACAO')->'audits'->2->>'id'=pg_temp.id(502)::text
 and jsonb_array_length(public.read_published_audit_overview('ENGENHARIA','COORDENACAO')->'findings')=21,
 'New publications are immediately included with the same date/id/finding order');
reset role;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
update public.access_works set ativo=false where id=pg_temp.id(101);
set local role authenticated;
set local "request.jwt.claim.sub"='d1ae0000-0000-4000-8000-000000000003';
select pg_temp.assert_true(public.read_published_audit_overview('ENGENHARIA','COORDENACAO')=
 '{"audits":[],"findings":[]}'::jsonb,
 'Work revocation invalidates cached summaries immediately');
reset role;
update public.access_accounts set ativo=false where auth_user_id=pg_temp.id(3);
set local role authenticated;
select pg_temp.expect_error($sql$select public.read_published_audit_overview('ENGENHARIA','COORDENACAO')$sql$,'42501');
reset role;
set local role anon;
select pg_temp.expect_error($sql$select public.read_published_audit_overview('ENGENHARIA','COORDENACAO')$sql$,'42501');
reset role;
set local role service_role;
select pg_temp.expect_error($sql$select public.read_published_audit_overview('ENGENHARIA','COORDENACAO')$sql$,'42501');
reset role;
rollback;

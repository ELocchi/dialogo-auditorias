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
  select ('d1b40000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
$test$;
create function pg_temp.findings(n integer) returns jsonb language sql immutable as $test$
  select jsonb_build_array(jsonb_build_object('id',pg_temp.id(n),'location','Fixture location',
    'description','FINDING_PRIVATE_TEXT_' || n,'correction','CORRECTION_PRIVATE_TEXT_' || n));
$test$;

insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 ('13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br','{"nome":"Follow-up admin fixture"}',clock_timestamp()),
 (pg_temp.id(2),'followup.workspace.owner@dialogo.com.br','{"nome":"Owner auditor fixture"}',clock_timestamp()),
 (pg_temp.id(3),'followup.workspace.other@dialogo.com.br','{"nome":"Other auditor fixture"}',clock_timestamp()),
 (pg_temp.id(4),'followup.workspace.coordination@dialogo.com.br','{"nome":"Coordination fixture"}',clock_timestamp()),
 (pg_temp.id(5),'followup.workspace.site@dialogo.com.br','{"nome":"Site team fixture"}',clock_timestamp());
select dialogo_private.bootstrap_first_administrator('13044e3f-e8d2-4b4b-9981-22a8de22c610',
 'emanuel.locchi@dialogo.com.br','Isolated follow-up workspace bootstrap');
update public.access_accounts set atuacao_administrativa='GERAL'
 where auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610';
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
insert into public.access_works(id,nome,created_by) select pg_temp.id(n),'Follow-up work ' || n,auth.uid()
 from generate_series(101,104) n;
set local role authenticated;
select public.approve_access_request_v3(pg_temp.id(2),array['AUDITOR_SEGURANCA','AUDITOR_QUALIDADE','ENGENHARIA'],'EQUIPE_OBRA',null,
 jsonb_build_array(
  jsonb_build_object('perfil','AUDITOR_SEGURANCA','obra_id',pg_temp.id(101),'modulo','SEGURANCA'),
  jsonb_build_object('perfil','AUDITOR_QUALIDADE','obra_id',pg_temp.id(101),'modulo','QUALIDADE'),
  jsonb_build_object('perfil','AUDITOR_QUALIDADE','obra_id',pg_temp.id(102),'modulo','QUALIDADE'),
  jsonb_build_object('perfil','AUDITOR_QUALIDADE','obra_id',pg_temp.id(103),'modulo','QUALIDADE'),
  jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(102),'modulo','SEGURANCA'),
  jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(102),'modulo','QUALIDADE')),'Auditor selected profile isolation');
select public.approve_access_request_v3(pg_temp.id(3),array['AUDITOR_SEGURANCA','AUDITOR_QUALIDADE'],null,null,
 jsonb_build_array(
  jsonb_build_object('perfil','AUDITOR_SEGURANCA','obra_id',pg_temp.id(101),'modulo','SEGURANCA'),
  jsonb_build_object('perfil','AUDITOR_QUALIDADE','obra_id',pg_temp.id(101),'modulo','QUALIDADE')),'Second auditor isolation');
select public.approve_access_request_v3(pg_temp.id(4),array['ENGENHARIA'],'COORDENACAO',null,
 jsonb_build_array(
  jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(101),'modulo','SEGURANCA'),
  jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(101),'modulo','QUALIDADE')),'Coordination current scope');
select public.approve_access_request_v3(pg_temp.id(5),array['ENGENHARIA'],'EQUIPE_OBRA',null,
 jsonb_build_array(
  jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(102),'modulo','SEGURANCA'),
  jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(102),'modulo','QUALIDADE')),'Site team current scope');
reset role;

-- Construct valid persisted records directly in this disposable fixture. Rows
-- deliberately cover revoked/nonselected scopes and historical reassignment.
insert into public.audit_visits(id,obra_id,modulo,modelo_id,visit_kind,auditor_auth_user_id,data_prevista,
 confirmation_status,confirmed_at,confirmed_by,created_by,updated_by,cancelled_at,cancelled_by)
select pg_temp.id(n),pg_temp.id(case n when 203 then 102 when 205 then 103 when 206 then 104 else 101 end),
 case when n in (202,211) then 'SEGURANCA' else 'QUALIDADE' end,
 case when n=208 then 'quality-f176' else null end,
 case when n=208 then 'AUDITORIA' else 'ACOMPANHAMENTO' end,
 pg_temp.id(case when n in (204,209,211) then 3 else 2 end),date '2030-03-01',
 'confirmed',timestamptz '2030-03-01 12:00:00+00',pg_temp.id(case when n in (204,209,211) then 3 else 2 end),
 '13044e3f-e8d2-4b4b-9981-22a8de22c610','13044e3f-e8d2-4b4b-9981-22a8de22c610',
 case when n=207 then timestamptz '2030-03-02 12:00:00+00' else null end,
 case when n=207 then '13044e3f-e8d2-4b4b-9981-22a8de22c610'::uuid else null end
from generate_series(201,211) n;
insert into public.follow_up_reports(id,visit_id,auditor_auth_user_id,title,participants,guidance,decisions,findings,created_at,updated_at)
select pg_temp.id(n+300),pg_temp.id(n),pg_temp.id(case when n in (204,211) then 3 else 2 end),
 'Report ' || n,'PARTICIPANTS_PRIVATE_' || n,'SUBJECTS_PRIVATE_' || n,'DECISIONS_PRIVATE_' || n,
 pg_temp.findings(n+100),timestamptz '2030-03-03 12:00:00+00'+n*interval '1 second',
 timestamptz '2030-03-03 12:00:00+00'+n*interval '1 second'
from generate_series(201,209) n;
insert into public.follow_up_reports(id,visit_id,auditor_auth_user_id,title,participants,guidance,decisions,findings,created_at,updated_at)
values(pg_temp.id(550),pg_temp.id(201),pg_temp.id(2),'Second immutable report',
 'SECOND_PARTICIPANTS_PRIVATE','SECOND_SUBJECTS_PRIVATE','SECOND_DECISIONS_PRIVATE',pg_temp.findings(350),
 '2030-03-04 12:00:00+00','2030-03-04 12:00:00+00');
insert into public.follow_up_finding_drafts(visit_id,auditor_auth_user_id,findings,revision,updated_at)
select pg_temp.id(n),pg_temp.id(case when n=204 then 3 else 2 end),pg_temp.findings(n+400),2,
 timestamptz '2030-03-05 12:00:00+00'+n*interval '1 second'
from generate_series(201,209) n;
insert into public.follow_up_finding_completions(visit_id,finding_id,auditor_auth_user_id)
select pg_temp.id(n),pg_temp.id(n+100),pg_temp.id(case when n=204 then 3 else 2 end)
from generate_series(201,209) n;
insert into public.follow_up_finding_completions(visit_id,finding_id,auditor_auth_user_id)
 values(pg_temp.id(204),pg_temp.id(999),pg_temp.id(2)),(pg_temp.id(201),pg_temp.id(998),pg_temp.id(3));
insert into public.follow_up_work_findings(id,work_id,auditor_auth_user_id,modulo,description,correction,photo_file_name,created_at,completed_at)
select pg_temp.id(n),pg_temp.id(case n when 403 then 102 when 405 then 103 when 406 then 104 when 408 then 102 else 101 end),
 pg_temp.id(case when n in (404,409) then 3 else 2 end),
 case when n in (402,408,409) then 'SEGURANCA' when n=410 then null else 'QUALIDADE' end,
 'Work finding ' || n,'Work correction ' || n,pg_temp.id(n)::text || '_' || pg_temp.id(n+1000)::text || '.jpg',
 timestamptz '2030-03-06 12:00:00+00'+n*interval '1 second',
 case when n=407 then timestamptz '2030-03-07 12:00:00+00' else null end
from generate_series(401,410) n;
update public.access_works set ativo=false where id=pg_temp.id(103);

-- Existing readers remain the parity oracle for selection, findings, revisions,
-- timestamps and ordering. Only text fields unused by these screens disappear.
create function pg_temp.compact_reports(p_profile text,p_engineering boolean default false)
returns jsonb language sql as $test$
  select coalesce(jsonb_agg(case when p_engineering then
    jsonb_build_object('id',r->'id','title',r->'title','visitId',r->'visitId','updatedAt',r->'updatedAt')
    else r-array['participants','subjects','decisions'] end order by r->>'updatedAt' desc,r->>'id' desc),'[]'::jsonb)
  from jsonb_array_elements(public.read_follow_up_reports(p_profile)) r;
$test$;
select pg_temp.assert_true((select bool_and(provolatile='s') from pg_proc where oid in (
 'public.read_follow_up_workspace(text,text,text)'::regprocedure,
 'public.read_follow_up_report_index(text,text,text)'::regprocedure,
 'public.can_read_follow_up_visit_photos(uuid,text,text,text)'::regprocedure)),
 'Every new read is declared STABLE and usable by read-only PostgREST requests');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.follow_up_reports','SELECT')
 and not has_table_privilege('authenticated','public.follow_up_finding_drafts','SELECT'),
 'Optimized readers do not open direct private report/draft table access');

set local role authenticated;
set local "request.jwt.claim.sub"='d1b40000-0000-4000-8000-000000000002';
select pg_temp.assert_true(public.read_follow_up_workspace('AUDITOR_QUALIDADE')->'reports'=pg_temp.compact_reports('AUDITOR_QUALIDADE')
 and public.read_follow_up_workspace('AUDITOR_QUALIDADE')->'drafts'=public.read_follow_up_finding_drafts('AUDITOR_QUALIDADE'),
 'Quality bundle preserves every authorized legacy report/draft value and ordering');
select pg_temp.assert_true(public.read_follow_up_workspace('AUDITOR_SEGURANCA')->'reports'=pg_temp.compact_reports('AUDITOR_SEGURANCA')
 and public.read_follow_up_workspace('AUDITOR_SEGURANCA')->'drafts'=public.read_follow_up_finding_drafts('AUDITOR_SEGURANCA'),
 'Safety bundle preserves every authorized legacy report/draft value and ordering');
select pg_temp.assert_true(public.read_follow_up_workspace('AUDITOR_QUALIDADE')->>'available'='true'
 and jsonb_array_length(public.read_follow_up_workspace('AUDITOR_QUALIDADE')->'reports')=3
 and jsonb_array_length(public.read_follow_up_workspace('AUDITOR_QUALIDADE')->'drafts')=2
 and (select array_agg(key order by key) from jsonb_object_keys(public.read_follow_up_workspace('AUDITOR_QUALIDADE')) key)
   =array['available','completed','drafts','reports','workFindings'],
 'One workspace RPC returns all four complete projections without extra fields');
select pg_temp.assert_true(public.read_follow_up_workspace('AUDITOR_QUALIDADE')->'completed'=jsonb_build_array(
 pg_temp.id(201)::text || ':' || pg_temp.id(301)::text,pg_temp.id(203)::text || ':' || pg_temp.id(303)::text)
 and public.read_follow_up_workspace('AUDITOR_SEGURANCA')->'completed'=jsonb_build_array(pg_temp.id(202)::text || ':' || pg_temp.id(302)::text),
 'Completions exclude other owners, other selected disciplines, cancelled visits, inactive works and revoked grants');
select pg_temp.assert_true((select jsonb_agg(r->>'id' order by r->>'id')
 from jsonb_array_elements(public.read_follow_up_workspace('AUDITOR_QUALIDADE')->'workFindings') r)
 =jsonb_build_array(pg_temp.id(401),pg_temp.id(403))
 and (select jsonb_agg(r->>'id') from jsonb_array_elements(public.read_follow_up_workspace('AUDITOR_SEGURANCA')->'workFindings') r)
 =jsonb_build_array(pg_temp.id(402)),
 'Work findings preserve selected own active noncompleted work/module records and exclude ambiguous legacy modules');
select pg_temp.assert_true(not exists(select 1 from jsonb_array_elements(public.read_follow_up_workspace('AUDITOR_QUALIDADE')->'reports') r
 where r ?| array['participants','subjects','decisions'])
 and public.read_follow_up_workspace('AUDITOR_QUALIDADE')::text not like '%PARTICIPANTS_PRIVATE%'
 and public.read_follow_up_workspace('AUDITOR_QUALIDADE')::text not like '%SUBJECTS_PRIVATE%'
 and public.read_follow_up_workspace('AUDITOR_QUALIDADE')::text not like '%DECISIONS_PRIVATE%'
 and public.read_follow_up_workspace('AUDITOR_QUALIDADE')::text like '%FINDING_PRIVATE_TEXT_301%',
 'Auditor summary retains required finding descriptions while omitting full report text');

-- A read-only transaction rejects hidden row-locking authorization helpers.
savepoint followup_read_only;
set local transaction_read_only=on;
select pg_temp.assert_true(public.read_follow_up_workspace('AUDITOR_QUALIDADE')->>'available'='true',
 'Workspace reads in a real READ ONLY transaction without calling legacy locking readers');
select pg_temp.assert_true(public.can_read_follow_up_visit_photos(pg_temp.id(201),'AUDITOR_QUALIDADE')
 and public.can_read_follow_up_visit_photos(pg_temp.id(203),'AUDITOR_QUALIDADE')
 and public.can_read_follow_up_visit_photos(pg_temp.id(210),'AUDITOR_QUALIDADE')
 and public.can_read_follow_up_visit_photos(pg_temp.id(202),'AUDITOR_SEGURANCA'),
 'Single-visit photo authorization reads confirmed authorized own follow-ups, including one with no saved report');
select pg_temp.assert_true(not public.can_read_follow_up_visit_photos(pg_temp.id(202),'AUDITOR_QUALIDADE')
 and not public.can_read_follow_up_visit_photos(pg_temp.id(204),'AUDITOR_QUALIDADE')
 and not public.can_read_follow_up_visit_photos(pg_temp.id(205),'AUDITOR_QUALIDADE')
 and not public.can_read_follow_up_visit_photos(pg_temp.id(206),'AUDITOR_QUALIDADE')
 and not public.can_read_follow_up_visit_photos(pg_temp.id(207),'AUDITOR_QUALIDADE')
 and not public.can_read_follow_up_visit_photos(pg_temp.id(208),'AUDITOR_QUALIDADE')
 and not public.can_read_follow_up_visit_photos(pg_temp.id(209),'AUDITOR_QUALIDADE')
 and not public.can_read_follow_up_visit_photos(pg_temp.id(999),'AUDITOR_QUALIDADE')
 and not public.can_read_follow_up_visit_photos(null,'AUDITOR_QUALIDADE'),
 'Photo reads deny opposite discipline, another owner, inactive/ungranted work, cancelled/audit/reassigned/missing visit');
select pg_temp.assert_true(public.read_follow_up_report_index('ENGENHARIA','EQUIPE_OBRA')->>'available'='true'
 and jsonb_array_length(public.read_follow_up_report_index('ENGENHARIA','EQUIPE_OBRA')->'reports')=1,
 'Current engineering scope is independent from the same identity auditor grants and also works READ ONLY');
rollback to savepoint followup_read_only;
release savepoint followup_read_only;

select pg_temp.expect_error($sql$select public.read_follow_up_workspace('ENGENHARIA','EQUIPE_OBRA')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_follow_up_workspace('AUDITOR_QUALIDADE','EQUIPE_OBRA')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_follow_up_workspace('AUDITOR_QUALIDADE',null,'GERAL')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_follow_up_workspace(null)$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_follow_up_report_index('AUDITOR_QUALIDADE')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_follow_up_report_index('ENGENHARIA','COORDENACAO')$sql$,'42501');
select pg_temp.expect_error($sql$select public.can_read_follow_up_visit_photos(pg_temp.id(201),'ENGENHARIA','EQUIPE_OBRA')$sql$,'42501');

set local "request.jwt.claim.sub"='d1b40000-0000-4000-8000-000000000003';
select pg_temp.assert_true(jsonb_array_length(public.read_follow_up_workspace('AUDITOR_QUALIDADE')->'reports')=1
 and jsonb_array_length(public.read_follow_up_workspace('AUDITOR_QUALIDADE')->'drafts')=1
 and public.read_follow_up_workspace('AUDITOR_QUALIDADE')->'completed'=jsonb_build_array(pg_temp.id(204)::text || ':' || pg_temp.id(304)::text)
 and public.read_follow_up_workspace('AUDITOR_QUALIDADE')->'workFindings'->0->>'id'=pg_temp.id(404)::text
 and not public.can_read_follow_up_visit_photos(pg_temp.id(201),'AUDITOR_QUALIDADE'),
 'Another valid auditor sees only its own data even on the same authorized work');
set local "request.jwt.claim.sub"='d1b40000-0000-4000-8000-000000000004';
select pg_temp.assert_true(public.read_follow_up_report_index('ENGENHARIA','COORDENACAO')->'reports'=pg_temp.compact_reports('ENGENHARIA',true)
 and jsonb_array_length(public.read_follow_up_report_index('ENGENHARIA','COORDENACAO')->'reports')=5,
 'Engineering index preserves all reports from authorized works for coordination');
select pg_temp.assert_true(not exists(select 1 from jsonb_array_elements(public.read_follow_up_report_index('ENGENHARIA','COORDENACAO')->'reports') r
 where (select array_agg(key order by key) from jsonb_object_keys(r) key)<>array['id','title','updatedAt','visitId'])
 and public.read_follow_up_report_index('ENGENHARIA','COORDENACAO')::text not like '%PRIVATE%',
 'Engineering index includes only navigation metadata, with no finding or full report text');
select pg_temp.expect_error($sql$select public.read_follow_up_report_index('ENGENHARIA','EQUIPE_OBRA')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_follow_up_report_index('ENGENHARIA',null)$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_follow_up_report_index('ENGENHARIA','COORDENACAO','GERAL')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_follow_up_workspace('AUDITOR_QUALIDADE')$sql$,'42501');
set local "request.jwt.claim.sub"='d1b40000-0000-4000-8000-000000000005';
select pg_temp.assert_true(public.read_follow_up_report_index('ENGENHARIA','EQUIPE_OBRA')->'reports'=pg_temp.compact_reports('ENGENHARIA',true)
 and public.read_follow_up_report_index('ENGENHARIA','EQUIPE_OBRA')->'reports'->0->>'visitId'=pg_temp.id(203)::text
 and jsonb_array_length(public.read_follow_up_report_index('ENGENHARIA','EQUIPE_OBRA')->'reports')=1,
 'Engineering site team sees its own work scope and no coordination work grants');
select pg_temp.expect_error($sql$select public.read_follow_up_report_index('ENGENHARIA','COORDENACAO')$sql$,'42501');

-- Authorization changes are visible on the next read; no returned dataset acts
-- as a reusable credential for storage or for the other selected profile.
reset role;
create temporary table followup_saved_grant as select * from public.access_grants
 where auth_user_id=pg_temp.id(2) and perfil='AUDITOR_QUALIDADE' and obra_id=pg_temp.id(101) and modulo='QUALIDADE';
delete from public.access_grants where auth_user_id=pg_temp.id(2) and perfil='AUDITOR_QUALIDADE'
 and obra_id=pg_temp.id(101) and modulo='QUALIDADE';
set local role authenticated;
set local "request.jwt.claim.sub"='d1b40000-0000-4000-8000-000000000002';
select pg_temp.assert_true(jsonb_array_length(public.read_follow_up_workspace('AUDITOR_QUALIDADE')->'reports')=1
 and public.read_follow_up_workspace('AUDITOR_QUALIDADE')->'completed'=jsonb_build_array(pg_temp.id(203)::text || ':' || pg_temp.id(303)::text)
 and jsonb_array_length(public.read_follow_up_workspace('AUDITOR_QUALIDADE')->'workFindings')=1
 and not public.can_read_follow_up_visit_photos(pg_temp.id(201),'AUDITOR_QUALIDADE')
 and public.can_read_follow_up_visit_photos(pg_temp.id(202),'AUDITOR_SEGURANCA'),
 'Revoking Quality does not borrow Safety grants and immediately removes photos, records and completions');
reset role;
insert into public.access_grants select * from pg_temp.followup_saved_grant;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
update public.access_works set ativo=false where id=pg_temp.id(101);
set local role authenticated;
set local "request.jwt.claim.sub"='d1b40000-0000-4000-8000-000000000002';
select pg_temp.assert_true(jsonb_array_length(public.read_follow_up_workspace('AUDITOR_QUALIDADE')->'reports')=1
 and public.read_follow_up_workspace('AUDITOR_SEGURANCA')->'reports'='[]'::jsonb
 and not public.can_read_follow_up_visit_photos(pg_temp.id(201),'AUDITOR_QUALIDADE'),
 'Deactivating a work invalidates each auditor projection and its photo access');
set local "request.jwt.claim.sub"='d1b40000-0000-4000-8000-000000000004';
select pg_temp.assert_true(public.read_follow_up_report_index('ENGENHARIA','COORDENACAO')->'reports'='[]'::jsonb,
 'Deactivating a work immediately removes engineering metadata');
reset role;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
update public.audit_visits set cancelled_at=clock_timestamp(),cancelled_by='13044e3f-e8d2-4b4b-9981-22a8de22c610'
 where id=pg_temp.id(203);
set local role authenticated;
set local "request.jwt.claim.sub"='d1b40000-0000-4000-8000-000000000002';
select pg_temp.assert_true(public.read_follow_up_workspace('AUDITOR_QUALIDADE')->'reports'='[]'::jsonb
 and public.read_follow_up_workspace('AUDITOR_QUALIDADE')->'drafts'='[]'::jsonb
 and public.read_follow_up_workspace('AUDITOR_QUALIDADE')->'completed'='[]'::jsonb
 and not public.can_read_follow_up_visit_photos(pg_temp.id(203),'AUDITOR_QUALIDADE'),
 'Cancelling a visit removes its reports, drafts, completion keys and photos without deleting history');
set local "request.jwt.claim.sub"='d1b40000-0000-4000-8000-000000000005';
select pg_temp.assert_true(public.read_follow_up_report_index('ENGENHARIA','EQUIPE_OBRA')->'reports'='[]'::jsonb,
 'Cancelled visits disappear from engineering index too');

reset role;
update auth.users set banned_until=clock_timestamp()+interval '1 day' where id=pg_temp.id(2);
set local role authenticated;
set local "request.jwt.claim.sub"='d1b40000-0000-4000-8000-000000000002';
select pg_temp.expect_error($sql$select public.read_follow_up_workspace('AUDITOR_QUALIDADE')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_follow_up_report_index('ENGENHARIA','EQUIPE_OBRA')$sql$,'42501');
select pg_temp.expect_error($sql$select public.can_read_follow_up_visit_photos(pg_temp.id(203),'AUDITOR_QUALIDADE')$sql$,'42501');
reset role;
update auth.users set banned_until=clock_timestamp()-interval '1 day' where id=pg_temp.id(2);
set local role authenticated;
select pg_temp.assert_true(public.read_follow_up_workspace('AUDITOR_QUALIDADE')->>'available'='true',
 'Expired bans require a fresh authorization read and allow the remaining authorized empty history');
reset role;
update public.access_accounts set ativo=false where auth_user_id=pg_temp.id(2);
set local role authenticated;
select pg_temp.expect_error($sql$select public.read_follow_up_workspace('AUDITOR_QUALIDADE')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_follow_up_report_index('ENGENHARIA','EQUIPE_OBRA')$sql$,'42501');
select pg_temp.expect_error($sql$select public.can_read_follow_up_visit_photos(pg_temp.id(203),'AUDITOR_QUALIDADE')$sql$,'42501');
reset role;
set local role anon;
select pg_temp.expect_error($sql$select public.read_follow_up_workspace('AUDITOR_QUALIDADE')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_follow_up_report_index('ENGENHARIA','EQUIPE_OBRA')$sql$,'42501');
select pg_temp.expect_error($sql$select public.can_read_follow_up_visit_photos(pg_temp.id(203),'AUDITOR_QUALIDADE')$sql$,'42501');
reset role;
set local role service_role;
select pg_temp.expect_error($sql$select public.read_follow_up_workspace('AUDITOR_QUALIDADE')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_follow_up_report_index('ENGENHARIA','EQUIPE_OBRA')$sql$,'42501');
select pg_temp.expect_error($sql$select public.can_read_follow_up_visit_photos(pg_temp.id(203),'AUDITOR_QUALIDADE')$sql$,'42501');
reset role;
rollback;

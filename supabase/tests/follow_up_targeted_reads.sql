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
 pg_temp.findings(n+100) || case when n=201 then pg_temp.findings(401) || pg_temp.findings(402)
   || pg_temp.findings(404) || pg_temp.findings(407) else '[]'::jsonb end,
 timestamptz '2030-03-03 12:00:00+00'+n*interval '1 second',
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

-- Completed work findings remain evidence of the immutable report. Other
-- authors/discipline must never become PDF attachments on the same work.
create function pg_temp.photo_name(n integer) returns text language sql immutable as $test$
 select pg_temp.id(n)::text || '_' || pg_temp.id(9001)::text || '.jpg';
$test$;
insert into storage.objects(id,bucket_id,name)
select pg_temp.id(8000+n),'follow-up-photos',
 pg_temp.id(case when n=204 then 3 else 2 end)::text || '/' || pg_temp.id(n)::text || '/' || pg_temp.photo_name(n+100)
from generate_series(201,209) n;
insert into storage.objects(id,bucket_id,name) values
 (pg_temp.id(8801),'follow-up-photos',pg_temp.id(2)::text || '/' || pg_temp.id(201)::text || '/' || pg_temp.photo_name(601)),
 (pg_temp.id(8802),'follow-up-photos',pg_temp.id(2)::text || '/' || pg_temp.id(201)::text || '/' || pg_temp.photo_name(777));
create function pg_temp.photo(v integer,f integer,p text default 'AUDITOR_QUALIDADE') returns boolean language sql as $test$
 select public.can_read_follow_up_finding_photo(pg_temp.id(v),pg_temp.id(f),pg_temp.photo_name(f),p,null,null);
$test$;
create function pg_temp.legacy_report(v integer,r integer,p text default 'AUDITOR_QUALIDADE') returns jsonb language sql as $test$
 select item from jsonb_array_elements(public.read_follow_up_reports(p)) item
 where item->>'visitId'=pg_temp.id(v)::text and item->>'id'=pg_temp.id(r)::text;
$test$;
select pg_temp.assert_true((select bool_and(provolatile='s') from pg_proc where oid in (
 'public.read_follow_up_visit(uuid,text,text,text)'::regprocedure,
 'public.read_follow_up_report_detail(uuid,text,text,text,uuid)'::regprocedure,
 'public.can_read_follow_up_finding_photo(uuid,uuid,text,text,text,text)'::regprocedure)),
 'All exact-resource readers are STABLE');
set local role authenticated;
set local "request.jwt.claim.sub"='d1b40000-0000-4000-8000-000000000002';
select pg_temp.assert_true(public.read_follow_up_visit(pg_temp.id(201),'AUDITOR_QUALIDADE')->>'available'='true'
 and public.read_follow_up_visit(pg_temp.id(201),'AUDITOR_QUALIDADE')->'visit'->>'id'=pg_temp.id(201)::text
 and public.read_follow_up_visit(pg_temp.id(201),'AUDITOR_QUALIDADE')->'visit'->>'workId'=pg_temp.id(101)::text
 and jsonb_array_length(public.read_follow_up_visit(pg_temp.id(201),'AUDITOR_QUALIDADE')->'reports')=2,
 'Editor snapshot contains exactly its own visit and two reports');
select pg_temp.assert_true((select jsonb_agg(item order by item->>'updatedAt' desc,item->>'id' desc)
 from jsonb_array_elements(public.read_follow_up_reports('AUDITOR_QUALIDADE')) item where item->>'visitId'=pg_temp.id(201)::text)
 =public.read_follow_up_visit(pg_temp.id(201),'AUDITOR_QUALIDADE')->'reports'
 and (select item from jsonb_array_elements(public.read_follow_up_finding_drafts('AUDITOR_QUALIDADE')) item
 where item->>'visitId'=pg_temp.id(201)::text)=public.read_follow_up_visit(pg_temp.id(201),'AUDITOR_QUALIDADE')->'draft',
 'All exact report/draft fields match legacy readers, including full text and revision');
select pg_temp.assert_true((select jsonb_agg(item->>'id' order by item->>'id')
 from jsonb_array_elements(public.read_follow_up_visit(pg_temp.id(201),'AUDITOR_QUALIDADE')->'workFindings') item)
 =jsonb_build_array(pg_temp.id(401)), 'Editor gets only active own findings for this work and discipline');
select pg_temp.assert_true(public.read_follow_up_visit(pg_temp.id(202),'AUDITOR_SEGURANCA')->'visit'->>'module'='safety'
 and public.read_follow_up_visit(pg_temp.id(202),'AUDITOR_SEGURANCA')->'reports'->0=pg_temp.legacy_report(202,502,'AUDITOR_SEGURANCA'),
 'Safety projection preserves the selected discipline');
select pg_temp.assert_true(public.read_follow_up_report_detail(pg_temp.id(201),'AUDITOR_QUALIDADE',null,null,pg_temp.id(501))->'report'
 =pg_temp.legacy_report(201,501), 'Detail selects the exact requested immutable report');
select pg_temp.assert_true((select jsonb_agg(item->>'findingId' order by item->>'findingId') from
 jsonb_array_elements(public.read_follow_up_report_detail(pg_temp.id(201),'AUDITOR_QUALIDADE',null,null,pg_temp.id(501))->'workPhotos') item)
 =jsonb_build_array(pg_temp.id(401),pg_temp.id(407)),
 'PDF attaches only selected own work photos, including completed findings, excluding wrong discipline/owner');
select pg_temp.assert_true(public.read_follow_up_report_detail(pg_temp.id(201),'AUDITOR_QUALIDADE')->'report'='null'::jsonb
 and public.read_follow_up_report_detail(pg_temp.id(201),'AUDITOR_QUALIDADE',null,null,pg_temp.id(503))->'report'='null'::jsonb
 and public.read_follow_up_report_detail(pg_temp.id(201),'AUDITOR_QUALIDADE',null,null,pg_temp.id(999))->'workPhotos'='[]'::jsonb
 and public.read_follow_up_report_detail(pg_temp.id(203),'AUDITOR_QUALIDADE')->'report'->>'id'=pg_temp.id(503)::text,
 'Implicit report selection only succeeds for a single report; cross-visit/absent IDs disclose nothing');
select pg_temp.assert_true(public.read_follow_up_visit(pg_temp.id(210),'AUDITOR_QUALIDADE')->'reports'='[]'::jsonb
 and public.read_follow_up_visit(pg_temp.id(210),'AUDITOR_QUALIDADE')->'draft'='null'::jsonb
 and public.read_follow_up_report_detail(pg_temp.id(210),'AUDITOR_QUALIDADE')->'report'='null'::jsonb,
 'An authorized visit without report/draft remains available to create its first report');
-- The removed duplicate agenda read never supplied write authority. The
-- existing writer still rejects an otherwise valid snapshot with a future date.
select pg_temp.expect_error($sql$select public.save_follow_up_report('AUDITOR_QUALIDADE',pg_temp.id(201),0,
 'Fixture report','Participants','Subjects','Decisions',pg_temp.findings(301))$sql$,'42501');

do $test$ declare n integer; item jsonb; begin
 foreach n in array array[202,204,205,206,207,208,209,999] loop
  item:=public.read_follow_up_visit(pg_temp.id(n),'AUDITOR_QUALIDADE');
  perform pg_temp.assert_true(item->>'available'='true' and item->'visit'='null'::jsonb
   and item->'reports'='[]'::jsonb and item->'draft'='null'::jsonb and item->'workFindings'='[]'::jsonb,
   'Wrong discipline/owner, inactive/ungranted work, cancelled/audit/reassigned/missing visit is absent: ' || n);
  item:=public.read_follow_up_report_detail(pg_temp.id(n),'AUDITOR_QUALIDADE',null,null,pg_temp.id(n+300));
  perform pg_temp.assert_true(item->'visit'='null'::jsonb and item->'report'='null'::jsonb and item->'workPhotos'='[]'::jsonb,
   'Detail cannot disclose data from a denied visit: ' || n);
 end loop;
end $test$;
select pg_temp.assert_true(pg_temp.photo(201,301) and pg_temp.photo(201,601)
 and pg_temp.photo(202,302,'AUDITOR_SEGURANCA'), 'Both report and draft photos authorize their exact stored object');
select pg_temp.assert_true(not pg_temp.photo(201,777) and not pg_temp.photo(201,350)
 and not pg_temp.photo(202,302) and not pg_temp.photo(204,304) and not pg_temp.photo(205,305)
 and not pg_temp.photo(206,306) and not pg_temp.photo(207,307) and not pg_temp.photo(208,308)
 and not pg_temp.photo(209,309), 'Orphan object, missing object and all denied visits never authorize photos');
select pg_temp.assert_true(not public.can_read_follow_up_finding_photo(pg_temp.id(201),pg_temp.id(301),pg_temp.photo_name(601),'AUDITOR_QUALIDADE')
 and not public.can_read_follow_up_finding_photo(pg_temp.id(201),pg_temp.id(301),'../file.jpg','AUDITOR_QUALIDADE'),
 'Filename must match its finding and cannot escape the authorized folder');

savepoint exact_read_only;
set local transaction_read_only=on;
select pg_temp.assert_true(public.read_follow_up_visit(pg_temp.id(201),'AUDITOR_QUALIDADE')->>'available'='true'
 and public.read_follow_up_report_detail(pg_temp.id(201),'AUDITOR_QUALIDADE',null,null,pg_temp.id(501))->'report'->>'id'=pg_temp.id(501)::text
 and pg_temp.photo(201,301), 'All three functions actually execute in a READ ONLY transaction');
rollback to savepoint exact_read_only;
release savepoint exact_read_only;

select pg_temp.expect_error($sql$select public.read_follow_up_visit(pg_temp.id(201),'ENGENHARIA','EQUIPE_OBRA')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_follow_up_visit(pg_temp.id(201),'AUDITOR_QUALIDADE','COORDENACAO')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_follow_up_report_detail(pg_temp.id(201),'ENGENHARIA','COORDENACAO')$sql$,'42501');
set local "request.jwt.claim.sub"='d1b40000-0000-4000-8000-000000000004';
select pg_temp.assert_true(public.read_follow_up_report_detail(pg_temp.id(201),'ENGENHARIA','COORDENACAO',null,pg_temp.id(501))->'report'
 =pg_temp.legacy_report(201,501,'ENGENHARIA')
 and public.read_follow_up_report_detail(pg_temp.id(203),'ENGENHARIA','COORDENACAO')->'visit'='null'::jsonb,
 'Coordination detail preserves full report and restricts exact work/module grant');
select pg_temp.expect_error($sql$select public.read_follow_up_report_detail(pg_temp.id(201),'ENGENHARIA','EQUIPE_OBRA')$sql$,'42501');
select pg_temp.expect_error($sql$select pg_temp.photo(201,301,'ENGENHARIA')$sql$,'42501');
set local "request.jwt.claim.sub"='d1b40000-0000-4000-8000-000000000005';
select pg_temp.assert_true(public.read_follow_up_report_detail(pg_temp.id(203),'ENGENHARIA','EQUIPE_OBRA')->'report'->>'id'=pg_temp.id(503)::text
 and public.read_follow_up_report_detail(pg_temp.id(201),'ENGENHARIA','EQUIPE_OBRA')->'visit'='null'::jsonb,
 'Site team detail does not borrow coordination work grants');

-- Object deletion and finding deletion are checked again before any warm cache.
reset role;
delete from storage.objects where id=pg_temp.id(8201);
set local role authenticated;
set local "request.jwt.claim.sub"='d1b40000-0000-4000-8000-000000000002';
select pg_temp.assert_true(not pg_temp.photo(201,301) and pg_temp.photo(201,601), 'Deleted object is denied even while its report finding still exists');
reset role;
update public.follow_up_finding_drafts set findings='[]'::jsonb where visit_id=pg_temp.id(201);
set local role authenticated;
select pg_temp.assert_true(not pg_temp.photo(201,601), 'Deleted draft finding no longer authorizes its remaining object');
reset role;
delete from public.access_grants where auth_user_id=pg_temp.id(2) and perfil='AUDITOR_QUALIDADE'
 and obra_id=pg_temp.id(101) and modulo='QUALIDADE';
set local role authenticated;
select pg_temp.assert_true(public.read_follow_up_visit(pg_temp.id(201),'AUDITOR_QUALIDADE')->'visit'='null'::jsonb
 and public.read_follow_up_report_detail(pg_temp.id(201),'AUDITOR_QUALIDADE',null,null,pg_temp.id(501))->'report'='null'::jsonb
 and not pg_temp.photo(201,301), 'Revocation invalidates each exact-resource reader on its next call');
reset role;
update auth.users set banned_until=clock_timestamp()+interval '1 day' where id=pg_temp.id(2);
set local role authenticated;
select pg_temp.expect_error($sql$select public.read_follow_up_visit(pg_temp.id(203),'AUDITOR_QUALIDADE')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_follow_up_report_detail(pg_temp.id(203),'AUDITOR_QUALIDADE')$sql$,'42501');
select pg_temp.expect_error($sql$select pg_temp.photo(203,303)$sql$,'42501');
reset role;
update auth.users set banned_until=clock_timestamp()-interval '1 day' where id=pg_temp.id(2);
set local role authenticated;
select pg_temp.assert_true(public.read_follow_up_visit(pg_temp.id(203),'AUDITOR_QUALIDADE')->'visit'->>'id'=pg_temp.id(203)::text,
 'An expired ban authorizes through current account state');
reset role;
update public.access_accounts set ativo=false where auth_user_id=pg_temp.id(2);
set local role authenticated;
select pg_temp.expect_error($sql$select public.read_follow_up_visit(pg_temp.id(203),'AUDITOR_QUALIDADE')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_follow_up_report_detail(pg_temp.id(203),'AUDITOR_QUALIDADE')$sql$,'42501');
select pg_temp.expect_error($sql$select pg_temp.photo(203,303)$sql$,'42501');
reset role;
set local role anon;
select pg_temp.expect_error($sql$select public.read_follow_up_visit(pg_temp.id(203),'AUDITOR_QUALIDADE')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_follow_up_report_detail(pg_temp.id(203),'AUDITOR_QUALIDADE')$sql$,'42501');
select pg_temp.expect_error($sql$select pg_temp.photo(203,303)$sql$,'42501');
reset role;
set local role service_role;
select pg_temp.expect_error($sql$select public.read_follow_up_visit(pg_temp.id(203),'AUDITOR_QUALIDADE')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_follow_up_report_detail(pg_temp.id(203),'AUDITOR_QUALIDADE')$sql$,'42501');
select pg_temp.expect_error($sql$select pg_temp.photo(203,303)$sql$,'42501');
reset role;
rollback;

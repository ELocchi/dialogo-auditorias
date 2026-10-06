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
update public.access_requests set email_confirmado_em=clock_timestamp() where status_acesso='PENDENTE_APROVACAO';
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


-- Deliberately large synthetic history with equal timestamps exercises tie-breaking.
insert into public.follow_up_work_findings(id,work_id,auditor_auth_user_id,modulo,description,correction,photo_file_name,created_at)
select pg_temp.id(n),pg_temp.id(101),pg_temp.id(2),'QUALIDADE','Apontamento '||n,'Orientação '||n,
 pg_temp.id(n)::text||'_'||pg_temp.id(n+10000)::text||'.jpg','2030-03-10T12:00:00Z'
from generate_series(1000,2499) n;
set local role authenticated;
set local "request.jwt.claim.sub"='d1b40000-0000-4000-8000-000000000002';
select pg_temp.assert_true(not has_function_privilege('anon','public.read_follow_up_list_page(text,text,text,text,integer,uuid,text,text,jsonb,uuid,uuid[])','EXECUTE'),'Anonymous caller denied');
select pg_temp.expect_error($q$select public.read_follow_up_list_page('AUDITOR_QUALIDADE',p_size=>1000)$q$,'22023');
select pg_temp.expect_error($q$select public.read_follow_up_list_page('AUDITOR_QUALIDADE',p_cursor=>'{}')$q$,'22023');
select pg_temp.expect_error($q$select public.read_follow_up_list_page('ADMINISTRATIVO')$q$,'42501');
create temp table observed(key text primary key);
grant all on observed to authenticated;
do $test$
declare result jsonb; cursor jsonb; pages integer:=0; count_rows integer:=0; row jsonb;
begin
 loop
  result:=public.read_follow_up_list_page('AUDITOR_QUALIDADE',p_kind=>'work-findings',p_cursor=>cursor);
  perform pg_temp.assert_true(jsonb_array_length(result->'items')<=20,'At most 20 rows per page');
  for row in select * from jsonb_array_elements(result->'items') loop
    insert into observed values(row->>'key'); count_rows:=count_rows+1;
    perform pg_temp.assert_true(row->>'module'='quality','Discipline never crosses');
  end loop;
  pages:=pages+1;
  exit when not (result->>'hasMore')::boolean;
  cursor:=result->'nextCursor';
  if pages>100 then raise exception 'Cursor failed to progress';end if;
 end loop;
 perform pg_temp.assert_true(count_rows=1502,'Every authorized finding exactly once, including timestamp ties');
 perform pg_temp.assert_true(pages=76,'No full-history prefetch needed');
end $test$;
select pg_temp.assert_true(jsonb_array_length(public.read_follow_up_list_page('AUDITOR_QUALIDADE',p_kind=>'work-findings',p_search=>'Apontamento 1234')->'items')=1,'Search occurs before pagination');
select pg_temp.assert_true(jsonb_array_length(public.read_follow_up_list_page('AUDITOR_QUALIDADE',p_kind=>'work-findings',p_work_id=>pg_temp.id(104))->'items')=0,'Unauthorized work returns no data');
select pg_temp.assert_true(jsonb_array_length(public.read_follow_up_list_page('AUDITOR_QUALIDADE',p_kind=>'reports')->'items')=3,'Scheduled reports are independent from all-agenda fetch');
select pg_temp.assert_true(not (public.read_follow_up_list_page('AUDITOR_QUALIDADE',p_kind=>'reports')::text like '%PRIVATE_%'),'Report list omits all prose and findings');
select pg_temp.assert_true(jsonb_array_length(public.read_follow_up_list_page('AUDITOR_QUALIDADE',p_kind=>'findings',p_search=>'FINDING_PRIVATE_TEXT_601')->'items')=1,'Draft and report findings are merged before filtering');
select pg_temp.assert_true(jsonb_array_length(public.read_follow_up_list_page('AUDITOR_QUALIDADE',p_kind=>'findings',p_search=>'FINDING_PRIVATE_TEXT_301')->'items')=0,'Completed findings remain excluded');
select jsonb_build_object('beforeRows',jsonb_array_length(old->'workFindings'),'afterRows',jsonb_array_length(new->'items'),
 'beforeBytes',octet_length(old::text),'afterBytes',octet_length(new::text)) as list_metrics
from (select public.read_follow_up_workspace('AUDITOR_QUALIDADE') old,
 public.read_follow_up_list_page('AUDITOR_QUALIDADE',p_kind=>'work-findings') new) measured;
set local "request.jwt.claim.sub"='d1b40000-0000-4000-8000-000000000005';
select pg_temp.assert_true(jsonb_array_length(public.read_follow_up_list_page('ENGENHARIA','EQUIPE_OBRA',p_kind=>'work-findings',p_work_id=>pg_temp.id(101))->'items')=0,'Engineering selected scope checked in database');

-- New agenda window: full selected month, no visits from the other 59 months.
reset role;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
insert into public.audit_visits(id,obra_id,modulo,modelo_id,visit_kind,auditor_auth_user_id,data_prevista,created_by,updated_by)
select pg_temp.id(10000+n),pg_temp.id(101),'QUALIDADE','quality-f176','AUDITORIA',pg_temp.id(2),
 date '2028-01-01'+(n%60)*interval '1 month',
 '13044e3f-e8d2-4b4b-9981-22a8de22c610','13044e3f-e8d2-4b4b-9981-22a8de22c610'
from generate_series(1,1200) n;
set local role authenticated;
set local "request.jwt.claim.sub"='d1b40000-0000-4000-8000-000000000002';
select pg_temp.assert_true((select bool_and(v->>'date' like '2030-03-%') from jsonb_array_elements(
 public.read_audit_agenda_month('2030-03-01','AUDITOR_QUALIDADE')->'snapshot'->'visits') v),'Calendar only projects selected month');
select pg_temp.assert_true(jsonb_array_length(public.read_audit_agenda_month('2028-01-01','AUDITOR_QUALIDADE')->'snapshot'->'visits')=20,'Can navigate to historical month without truncating it');
select pg_temp.assert_true((public.read_audit_agenda_month('2028-01-01','AUDITOR_QUALIDADE',p_known_revision=>
 public.read_audit_agenda_month('2028-01-01','AUDITOR_QUALIDADE')->>'revision')->>'unchanged')::boolean,'Month retains conditional refresh');
select pg_temp.assert_true(not (public.read_audit_agenda_month('2028-02-01','AUDITOR_QUALIDADE',p_known_revision=>
 public.read_audit_agenda_month('2028-01-01','AUDITOR_QUALIDADE')->>'revision')->>'unchanged')::boolean,'Revision bound to month');
select pg_temp.expect_error($q$select public.read_audit_agenda_month('2030-03-02','AUDITOR_QUALIDADE')$q$,'22023');
select pg_temp.expect_error($q$select public.read_team_profile_page()$q$,'42501');
select pg_temp.expect_error($q$select public.read_access_decision_page(pg_temp.id(2))$q$,'42501');
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select pg_temp.assert_true((public.read_team_profile_page(p_search=>'followup.workspace.owner')->>'total')::int=1,'Team search counts before paging');
select pg_temp.assert_true(jsonb_array_length(public.read_team_profile_page(p_page=>2)->'profiles')=0,'Team out of range explicit empty');
select pg_temp.assert_true(jsonb_array_length(public.read_team_profile_page(p_ids=>array[pg_temp.id(2)])->'profiles')=1,'Selected team members fetched by ID');
select pg_temp.assert_true((select bool_and(jsonb_array_length(u->'decisions')<=1) from jsonb_array_elements(public.read_access_administration_page('history')->'users') u),'Account list only latest decision');
select pg_temp.assert_true(jsonb_array_length(public.read_access_decision_page(pg_temp.id(2))->'decisions')>=1,'Expanded history remains reachable');
select jsonb_build_object('beforeRows',jsonb_array_length(old->'snapshot'->'visits'),'afterRows',jsonb_array_length(new->'snapshot'->'visits'),
 'beforeBytes',octet_length(old::text),'afterBytes',octet_length(new::text)) as agenda_list_metrics
from (select public.read_compact_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL') old,
 public.read_audit_agenda_month('2028-01-01','ADMINISTRATIVO',null,'GERAL') new) measured;

set local "request.jwt.claim.sub"='d1b40000-0000-4000-8000-000000000002';
select pg_temp.assert_true(public.read_follow_up_editor_header(pg_temp.id(201),'AUDITOR_QUALIDADE')->'reports'='[]'::jsonb,'Editor header never loads report bodies');
select pg_temp.assert_true((public.read_follow_up_editor_header(pg_temp.id(201),'AUDITOR_QUALIDADE')->>'hasReports')::boolean,'Index knows reports exist without loading them');
select pg_temp.assert_true(jsonb_array_length(public.read_follow_up_finding_context(pg_temp.id(201),pg_temp.id(350),'AUDITOR_QUALIDADE')->'reports')=1,'Mutation checks only one matching immutable report');
select pg_temp.assert_true(public.read_follow_up_finding_context(pg_temp.id(204),pg_temp.id(304),'AUDITOR_QUALIDADE')->'visit'='null'::jsonb,'Other auditor finding context denied');
select pg_temp.assert_true(jsonb_array_length(public.read_follow_up_list_page('AUDITOR_QUALIDADE',p_kind=>'findings',p_work_id=>pg_temp.id(101),p_visit_id=>pg_temp.id(201),p_ids=>array[pg_temp.id(1001),pg_temp.id(401)])->'items')=2,'Save reads only selected IDs');
select pg_temp.assert_true(jsonb_array_length(public.read_follow_up_list_page('AUDITOR_QUALIDADE',p_kind=>'work-findings',p_size=>10)->'items')=10,'10-row page');
select pg_temp.assert_true(jsonb_array_length(public.read_follow_up_list_page('AUDITOR_QUALIDADE',p_kind=>'work-findings',p_size=>50)->'items')=50,'50-row page');
create temp table first_page as select public.read_follow_up_list_page('AUDITOR_QUALIDADE',p_kind=>'work-findings') value;
reset role;
insert into public.follow_up_work_findings(id,work_id,auditor_auth_user_id,modulo,description,correction,photo_file_name,created_at)
values(pg_temp.id(2500),pg_temp.id(101),pg_temp.id(2),'QUALIDADE','New after cursor','Correction after cursor',pg_temp.id(2500)::text||'_'||pg_temp.id(9000)::text||'.jpg','2030-03-11T12:00:00Z');
set local role authenticated;
select pg_temp.assert_true(not exists(select 1 from jsonb_array_elements((select value->'items' from first_page)) previous
 join jsonb_array_elements(public.read_follow_up_list_page('AUDITOR_QUALIDADE',p_kind=>'work-findings',p_cursor=>(select value->'nextCursor' from first_page))->'items') next on previous->>'key'=next->>'key'),'Insert between pages does not repeat records');
reset role;
delete from public.access_grants where auth_user_id=pg_temp.id(2) and obra_id=pg_temp.id(101) and perfil='AUDITOR_QUALIDADE';
set local role authenticated;
select pg_temp.assert_true(jsonb_array_length(public.read_follow_up_list_page('AUDITOR_QUALIDADE',p_kind=>'work-findings',p_work_id=>pg_temp.id(101),p_cursor=>(select value->'nextCursor' from first_page))->'items')=0,'Every page rechecks revoked work authorization');
-- Many immutable events for one account must not inflate the account list.
reset role;
insert into public.access_decisions select (jsonb_populate_record(null::public.access_decisions,to_jsonb(d)||jsonb_build_object('id',pg_temp.id(20000+n),'decision_type','VINCULO_OBRA','decided_at',timestamptz '2030-01-01T12:00:00Z'+n*interval '1 second'))).*
from (select * from public.access_decisions where auth_user_id=pg_temp.id(2) limit 1) d cross join generate_series(1,50) n;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
set local role authenticated;
select pg_temp.assert_true(jsonb_array_length(public.read_access_decision_page(pg_temp.id(2),1)->'decisions')=20,'First account history page capped at 20');
select pg_temp.assert_true(jsonb_array_length(public.read_access_decision_page(pg_temp.id(2),3)->'decisions')=11,'Last history page exposes all remaining events');
select pg_temp.assert_true((select bool_and(jsonb_array_length(u->'decisions')<=1) from jsonb_array_elements(public.read_access_administration_page('history')->'users') u),'Account cards still only contain latest event');
rollback;

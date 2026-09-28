-- B.39: compact calendar parity and exact on-demand visit authorization.
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
  select ('d1ac3900-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
$test$;
-- Expected summaries are derived independently from the legacy public reader.
create function pg_temp.expected_compact(data jsonb) returns jsonb language sql immutable as $test$
  select jsonb_build_object('auditors',data->'auditors','visits',coalesce((select jsonb_agg(
    (value-array['note','history']) || jsonb_build_object('lastChangedAt',
      coalesce(value->'history'->-1->'changedAt',value->'createdAt')) order by value->>'date',value->>'createdAt',value->>'id')
    from jsonb_array_elements(data->'visits') with ordinality),'[]'::jsonb));
$test$;
-- The new opaque version is checked separately from the legacy payload, which
-- never included event IDs. Do not duplicate its hashing algorithm in the test.
create function pg_temp.without_versions(data jsonb) returns jsonb language sql immutable as $test$
  select jsonb_set(data,'{visits}',coalesce((select jsonb_agg(value-'detailVersion' order by ordinality)
    from jsonb_array_elements(data->'visits') with ordinality),'[]'::jsonb));
$test$;
create function pg_temp.assert_view(p_profile text,p_engineering text default null,p_administrative text default null)
returns void language plpgsql as $test$
declare v_full jsonb; v_compact jsonb; v_visit jsonb; v_detail jsonb;
begin
  v_full := public.read_audit_agenda_if_changed(p_profile,p_engineering,p_administrative)->'snapshot';
  v_compact := public.read_compact_audit_agenda_if_changed(p_profile,p_engineering,p_administrative)->'snapshot';
  perform pg_temp.assert_true(pg_temp.without_versions(v_compact) = pg_temp.expected_compact(v_full),'Full calendar and auditor parity for ' || p_profile || coalesce(p_engineering,p_administrative,''));
  for v_visit in select value from jsonb_array_elements(v_full->'visits') loop
    v_detail := public.read_audit_agenda_visit_detail(p_profile,(v_visit->>'id')::uuid,p_engineering,p_administrative);
    perform pg_temp.assert_true(v_detail-array['lastChangedAt','detailVersion']=v_visit,'Exact full detail equals legacy visit ' || (v_visit->>'id'));
    perform pg_temp.assert_true(v_detail->'lastChangedAt'=coalesce(v_visit->'history'->-1->'changedAt',v_visit->'createdAt'),'Notification timestamp equals last historical revision');
    perform pg_temp.assert_true(v_detail->>'detailVersion' ~ '^[0-9a-f]{32}$'
      and v_detail->>'detailVersion'=(select value->>'detailVersion' from jsonb_array_elements(v_compact->'visits')
        where value->>'id'=v_detail->>'id'),'Compact and full detail share an opaque per-visit version');
  end loop;
end $test$;

insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 ('13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br','{"nome":"Agenda admin"}',clock_timestamp()),
 (pg_temp.id(2),'compact.auditor@dialogo.com.br','{"nome":"Both auditor disciplines"}',clock_timestamp()),
 (pg_temp.id(3),'compact.other@dialogo.com.br','{"nome":"Other auditor"}',clock_timestamp()),
 (pg_temp.id(4),'compact.coordination@dialogo.com.br','{"nome":"Coordination"}',clock_timestamp()),
 (pg_temp.id(5),'compact.team@dialogo.com.br','{"nome":"Site team"}',clock_timestamp());
select dialogo_private.bootstrap_first_administrator('13044e3f-e8d2-4b4b-9981-22a8de22c610',
 'emanuel.locchi@dialogo.com.br','Isolated compact agenda bootstrap');
update public.access_accounts set atuacao_administrativa='GERAL'
 where auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610';
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
insert into public.access_works(id,nome,created_by) select pg_temp.id(n),'Agenda work ' || n,auth.uid() from generate_series(101,102) n;
set local role authenticated;
select public.approve_access_request_v3(pg_temp.id(2),array['AUDITOR_SEGURANCA','AUDITOR_QUALIDADE'],null,null,
 jsonb_build_array(
  jsonb_build_object('perfil','AUDITOR_SEGURANCA','obra_id',pg_temp.id(101),'modulo','SEGURANCA'),
  jsonb_build_object('perfil','AUDITOR_QUALIDADE','obra_id',pg_temp.id(101),'modulo','QUALIDADE')),'Auditor two disciplines');
select public.approve_access_request_v3(pg_temp.id(3),array['AUDITOR_SEGURANCA'],null,null,
 jsonb_build_array(jsonb_build_object('perfil','AUDITOR_SEGURANCA','obra_id',pg_temp.id(101),'modulo','SEGURANCA')),'Other auditor');
select public.approve_access_request_v3(pg_temp.id(4),array['ENGENHARIA'],'COORDENACAO',null,
 jsonb_build_array(
  jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(101),'modulo','SEGURANCA'),
  jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(101),'modulo','QUALIDADE')),'Coordination');
select public.approve_access_request_v3(pg_temp.id(5),array['ENGENHARIA'],'EQUIPE_OBRA',null,
 jsonb_build_array(
  jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(102),'modulo','SEGURANCA'),
  jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(102),'modulo','QUALIDADE')),'Site team fixture');
reset role;
-- Valid persisted rows cover assignment-only audit, ordinary follow-up grant,
-- another auditor, foreign work and both modules. No production fixtures.
insert into public.audit_visits(id,obra_id,modulo,modelo_id,visit_kind,auditor_auth_user_id,data_prevista,
 observacao,created_by,updated_by,created_at)
select pg_temp.id(n),pg_temp.id(case when n=205 then 102 else 101 end),
 case when n=202 then 'QUALIDADE' else 'SEGURANCA' end,
 case when n=203 then null when n=202 then 'quality-f175' else 'security-it07-r02' end,
 case when n=203 then 'ACOMPANHAMENTO' else 'AUDITORIA' end,
 pg_temp.id(case when n=204 then 3 else 2 end),date '2030-03-01'+(n-201),
 'PRIVATE_VISIT_' || n || repeat('n',1900),auth.uid(),auth.uid(),timestamptz '2030-01-01 12:00:00+00'
from generate_series(201,205) n;
insert into public.audit_visit_events(visit_id,revision,event_type,before_snapshot,after_snapshot,actor_auth_user_id,occurred_at)
select pg_temp.id(201),n,'rescheduled','{"data_prevista":"2030-02-01"}',
 jsonb_build_object('data_prevista','2030-03-01','observacao','PRIVATE_HISTORY_' || n || repeat('h',1900)),
 auth.uid(),timestamptz '2030-02-01 12:00:00+00'+(40-n)*interval '1 minute'
from generate_series(2,31) n;

set local role authenticated;
select pg_temp.assert_view('ADMINISTRATIVO',null,'GERAL');
select pg_temp.assert_view('ADMINISTRATIVO',null,'SEGURANCA');
select pg_temp.assert_view('ADMINISTRATIVO',null,'QUALIDADE');
select pg_temp.assert_true(public.read_audit_agenda_visit_detail('ADMINISTRATIVO',pg_temp.id(201),null,'QUALIDADE') is null,'Selected administrative module excludes opposite detail');
select pg_temp.assert_true(public.read_audit_agenda_visit_detail('ADMINISTRATIVO',pg_temp.id(999),null,'GERAL') is null,'Unknown visit has no detail');
select pg_temp.assert_true(public.read_audit_agenda_visit_detail('ADMINISTRATIVO',null,null,'GERAL') is null,'Null visit never expands into full agenda');
select set_config('dialogo.test.compact_revision',public.read_compact_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL')->>'revision',true);
select set_config('dialogo.test.detail_version',public.read_audit_agenda_visit_detail('ADMINISTRATIVO',pg_temp.id(201),null,'GERAL')->>'detailVersion',true);
select pg_temp.assert_true(public.read_compact_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL',current_setting('dialogo.test.compact_revision'))=
 jsonb_build_object('unchanged',true,'revision',current_setting('dialogo.test.compact_revision')),'Unchanged response has only token');
select pg_temp.assert_true(public.read_compact_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL',
 public.read_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL')->>'revision')->>'unchanged'='false','Legacy full token cannot hide first compact response');
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
select pg_temp.assert_view('AUDITOR_SEGURANCA');
select pg_temp.assert_view('AUDITOR_QUALIDADE');
select pg_temp.assert_true(public.read_audit_agenda_visit_detail('AUDITOR_SEGURANCA',pg_temp.id(205)) is not null,'Assigned audit remains visible without day-to-day work grant');
select pg_temp.assert_true(public.read_audit_agenda_visit_detail('AUDITOR_SEGURANCA',pg_temp.id(204)) is null,'Other auditor detail is private even in same work');
select pg_temp.assert_true(public.read_audit_agenda_visit_detail('AUDITOR_QUALIDADE',pg_temp.id(201)) is null,'Other selected auditor discipline has no detail');
select set_config('request.jwt.claim.sub',pg_temp.id(4)::text,true);
select pg_temp.assert_view('ENGENHARIA','COORDENACAO');
select pg_temp.assert_true(public.read_audit_agenda_visit_detail('ENGENHARIA',pg_temp.id(205),'COORDENACAO') is null,'Coordination excludes foreign work');
select pg_temp.expect_error($sql$select public.read_audit_agenda_visit_detail('ENGENHARIA',pg_temp.id(201),'EQUIPE_OBRA')$sql$,'42501');
select set_config('request.jwt.claim.sub',pg_temp.id(5)::text,true);
select pg_temp.assert_view('ENGENHARIA','EQUIPE_OBRA');
select pg_temp.assert_true(public.read_audit_agenda_visit_detail('ENGENHARIA',pg_temp.id(201),'EQUIPE_OBRA') is null,'Site team excludes foreign work');
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
reset role;

-- Initial and changed compact reads and one-visit detail never call either
-- legacy all-visit projection. Unchanged also skips the new projection.
savepoint projection_probe;
create or replace function public.read_audit_agenda(p_profile text,p_engineering_scope text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $test$
begin raise exception 'legacy_full_agenda_was_built'; end; $test$;
create or replace function public.read_audit_agenda_if_changed(p_profile text,p_engineering_scope text default null,p_administrative_scope text default null,p_known_revision text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $test$
begin raise exception 'legacy_full_conditional_was_built'; end; $test$;
set local role authenticated;
select pg_temp.assert_true(jsonb_array_length(public.read_compact_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL')->'snapshot'->'visits')=5,'Compact changed read independent of legacy prose');
select pg_temp.assert_true(public.read_audit_agenda_visit_detail('ADMINISTRATIVO',pg_temp.id(201),null,'GERAL')->>'note' like 'PRIVATE_VISIT_201%','Targeted detail independent of legacy whole agenda');
reset role;
create or replace function dialogo_private.project_selected_agenda_visits(p_profile text,p_engineering_scope text,p_administrative_scope text,p_visit_id uuid,p_compact boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $test$
begin raise exception 'new_projection_was_built'; end; $test$;
set local role authenticated;
select pg_temp.assert_true(public.read_compact_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL',current_setting('dialogo.test.compact_revision'))->>'unchanged'='true','Unchanged compact poll builds no projection');
rollback to savepoint projection_probe;
release savepoint projection_probe;

savepoint narrowed_administration;
update public.access_accounts set atuacao_administrativa='SEGURANCA' where auth_user_id=auth.uid();
set local role authenticated;
select pg_temp.assert_view('ADMINISTRATIVO',null,'SEGURANCA');
select pg_temp.expect_error($sql$select public.read_compact_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL',current_setting('dialogo.test.compact_revision'))$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_audit_agenda_visit_detail('ADMINISTRATIVO',pg_temp.id(202),null,'QUALIDADE')$sql$,'42501');
rollback to savepoint narrowed_administration;
release savepoint narrowed_administration;
savepoint revoke_grants;
delete from public.access_grants where auth_user_id in (pg_temp.id(2),pg_temp.id(4));
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
select pg_temp.assert_view('AUDITOR_SEGURANCA');
select pg_temp.assert_true(public.read_audit_agenda_visit_detail('AUDITOR_SEGURANCA',pg_temp.id(201)) is not null,'Audit assignment survives revoked general work grant');
select pg_temp.assert_true(public.read_audit_agenda_visit_detail('AUDITOR_SEGURANCA',pg_temp.id(203)) is null,'Follow-up loses detail immediately after grant revocation');
select set_config('request.jwt.claim.sub',pg_temp.id(4)::text,true);
select pg_temp.assert_true(public.read_compact_audit_agenda_if_changed('ENGENHARIA','COORDENACAO')->'snapshot'->'visits'='[]'::jsonb
 and public.read_audit_agenda_visit_detail('ENGENHARIA',pg_temp.id(201),'COORDENACAO') is null,'Coordination compact and detail immediately lose revoked work');
rollback to savepoint revoke_grants;
release savepoint revoke_grants;
savepoint revoke_identity;
update public.access_accounts set ativo=false where auth_user_id=auth.uid();
set local role authenticated;
select pg_temp.expect_error($sql$select public.read_compact_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL',current_setting('dialogo.test.compact_revision'))$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_audit_agenda_visit_detail('ADMINISTRATIVO',pg_temp.id(201),null,'GERAL')$sql$,'42501');
rollback to savepoint revoke_identity;
release savepoint revoke_identity;
savepoint revoke_profile;
update public.access_accounts set perfil='AUDITOR_QUALIDADE',perfis=array['AUDITOR_QUALIDADE'] where auth_user_id=pg_temp.id(2);
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
select pg_temp.expect_error($sql$select public.read_compact_audit_agenda_if_changed('AUDITOR_SEGURANCA')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_audit_agenda_visit_detail('AUDITOR_SEGURANCA',pg_temp.id(201))$sql$,'42501');
rollback to savepoint revoke_profile;
release savepoint revoke_profile;
savepoint inactive_work;
update public.access_works set ativo=false where id=pg_temp.id(101);
set local role authenticated;
select pg_temp.assert_view('ADMINISTRATIVO',null,'GERAL');
select pg_temp.assert_true(public.read_audit_agenda_visit_detail('ADMINISTRATIVO',pg_temp.id(201),null,'GERAL') is null,'Inactive work loses detail');
rollback to savepoint inactive_work;
release savepoint inactive_work;
savepoint cancelled_visit;
update public.audit_visits set cancelled_at=clock_timestamp(),cancelled_by=auth.uid() where id=pg_temp.id(201);
set local role authenticated;
select pg_temp.assert_view('ADMINISTRATIVO',null,'GERAL');
select pg_temp.assert_true(public.read_audit_agenda_visit_detail('ADMINISTRATIVO',pg_temp.id(201),null,'GERAL') is null,'Cancelled visit loses detail');
rollback to savepoint cancelled_visit;
release savepoint cancelled_visit;
savepoint published_visit;
insert into public.published_audits(id,work_id,modulo,model_id,audit_date,auditor_auth_user_id,auditor_name,final_score,
 catalog_version,catalog_revision_label,criteria,responses,evidence_files,report_file_name,source_file_name,published_at)
values(pg_temp.id(501),pg_temp.id(101),'QUALIDADE','quality-f175','2030-03-02',pg_temp.id(2),'Both auditor disciplines',8,1,'Fixture R1',
 '[{"id":"c1","code":"01.01","title":"Fixture","text":"Fixture","group":"1. Group","subgroup":"","source":"Fixture","locator":"1","documentedWeight":1,"orientations":[],"verificationRule":"Conforme/Não Conforme"}]',
 '{"c1":{"answer":"Conforme","note":"","photos":[]}}','[]','fixture.pdf','fixture.pdf',clock_timestamp());
set local role authenticated;
select pg_temp.assert_view('ADMINISTRATIVO',null,'GERAL');
select pg_temp.assert_true(public.read_audit_agenda_visit_detail('ADMINISTRATIVO',pg_temp.id(202),null,'GERAL') is null,'Published visit loses detail');
rollback to savepoint published_visit;
release savepoint published_visit;

-- Event-only changes invalidate even when an imported row did not bump the
-- visit revision. Notification time follows the event order, not max(timestamp).
savepoint history_invalidation;
insert into public.audit_visit_events(visit_id,revision,event_type,before_snapshot,after_snapshot,actor_auth_user_id,occurred_at)
values(pg_temp.id(201),32,'rescheduled','{"data_prevista":"2030-02-01"}',
 '{"data_prevista":"2030-03-01","observacao":"NEW_PRIVATE_HISTORY"}',auth.uid(),timestamptz '2030-01-31 12:00:00+00');
set local role authenticated;
select pg_temp.assert_true(public.read_compact_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL',current_setting('dialogo.test.compact_revision'))->>'unchanged'='false',
 'New immutable event invalidates compact token without visit metadata mutation');
select pg_temp.assert_true(public.read_audit_agenda_visit_detail('ADMINISTRATIVO',pg_temp.id(201),null,'GERAL')->>'detailVersion'
 <>current_setting('dialogo.test.detail_version'),'New immutable event changes the per-visit detail version');
select pg_temp.assert_view('ADMINISTRATIVO',null,'GERAL');
select pg_temp.assert_true((public.read_audit_agenda_visit_detail('ADMINISTRATIVO',pg_temp.id(201),null,'GERAL')->>'lastChangedAt')::timestamptz=timestamptz '2030-01-31 12:00:00+00',
 'Latest revision timestamp wins even when earlier than another event timestamp');
rollback to savepoint history_invalidation;
release savepoint history_invalidation;
savepoint imported_older_history;
insert into public.audit_visit_events(visit_id,revision,event_type,before_snapshot,after_snapshot,actor_auth_user_id,occurred_at)
values(pg_temp.id(201),1,'rescheduled','{"data_prevista":"2030-01-01"}',
 '{"data_prevista":"2030-02-01","observacao":"OLDER_PRIVATE_HISTORY"}',auth.uid(),timestamptz '2029-12-01 12:00:00+00');
set local role authenticated;
select pg_temp.assert_true(public.read_audit_agenda_visit_detail('ADMINISTRATIVO',pg_temp.id(201),null,'GERAL')->>'detailVersion'
 <>current_setting('dialogo.test.detail_version')
 and (public.read_audit_agenda_visit_detail('ADMINISTRATIVO',pg_temp.id(201),null,'GERAL')->>'lastChangedAt')::timestamptz=timestamptz '2030-02-01 12:09:00+00',
 'Older imported event invalidates detail without changing schedule revision or notification time');
select pg_temp.assert_view('ADMINISTRATIVO',null,'GERAL');
rollback to savepoint imported_older_history;
release savepoint imported_older_history;

savepoint changed_note;
update public.audit_visits set observacao='CURRENT_PRIVATE_NOTE' where id=pg_temp.id(201);
set local role authenticated;
select pg_temp.assert_true(public.read_compact_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL',current_setting('dialogo.test.compact_revision'))->>'unchanged'='false'
 and public.read_audit_agenda_visit_detail('ADMINISTRATIVO',pg_temp.id(201),null,'GERAL')->>'note'='CURRENT_PRIVATE_NOTE','Changed prose invalidates compact revision and targeted detail is current');
select pg_temp.assert_true(public.read_audit_agenda_visit_detail('ADMINISTRATIVO',pg_temp.id(201),null,'GERAL')->>'detailVersion'
 <>current_setting('dialogo.test.detail_version'),'Note-only changes invalidate the per-visit detail version');
select pg_temp.assert_view('ADMINISTRATIVO',null,'GERAL');
rollback to savepoint changed_note;
release savepoint changed_note;
savepoint confirmed_visit;
update public.audit_visits set confirmation_status='confirmed',confirmed_at=clock_timestamp(),confirmed_by=auditor_auth_user_id where id=pg_temp.id(201);
set local role authenticated;
select pg_temp.assert_true(public.read_compact_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL',current_setting('dialogo.test.compact_revision'))->>'unchanged'='false'
 and public.read_audit_agenda_visit_detail('ADMINISTRATIVO',pg_temp.id(201),null,'GERAL')->>'confirmationStatus'='confirmed','Confirmation invalidates without schedule revision change');
rollback to savepoint confirmed_visit;
release savepoint confirmed_visit;
savepoint read_only_projection;
set local role authenticated;
set local transaction_read_only=on;
select pg_temp.assert_view('ADMINISTRATIVO',null,'GERAL');
select pg_temp.assert_true(public.read_compact_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL',current_setting('dialogo.test.compact_revision'))->>'unchanged'='true','Both paths execute in a read-only transaction without locks or writes');
rollback to savepoint read_only_projection;
release savepoint read_only_projection;

-- A complete calendar remains available beyond PostgREST's usual row cap.
savepoint large_calendar;
insert into public.audit_visits(id,obra_id,modulo,modelo_id,auditor_auth_user_id,data_prevista,observacao,created_by,updated_by)
select pg_temp.id(1000+n),pg_temp.id(101),'SEGURANCA','security-it07-r02',pg_temp.id(2),date '2030-03-01',repeat('n',1900),auth.uid(),auth.uid()
from generate_series(1,1001) n;
set local role authenticated;
select pg_temp.assert_true(jsonb_array_length(public.read_compact_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL')->'snapshot'->'visits')=1006,'Compact calendar has all 1006 visits');
select pg_temp.assert_true(pg_temp.without_versions(public.read_compact_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL')->'snapshot')=
 pg_temp.expected_compact(public.read_audit_agenda('ADMINISTRATIVO')),'Large calendar summary parity without truncation');
select jsonb_build_object('visits',1006,
 'fullBytes',octet_length((public.read_audit_agenda('ADMINISTRATIVO'))::text),
 'compactBytes',octet_length((public.read_compact_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL')->'snapshot')::text),
 'oneDetailBytes',octet_length(public.read_audit_agenda_visit_detail('ADMINISTRATIVO',pg_temp.id(1001),null,'GERAL')::text)) as compact_agenda_fixture_metrics;
select pg_temp.assert_true(octet_length((public.read_compact_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL')->'snapshot')::text)
 < octet_length(public.read_audit_agenda('ADMINISTRATIVO')::text)/2,'Large note/history fixture sends less than half of legacy JSON');
rollback to savepoint large_calendar;
release savepoint large_calendar;

select pg_temp.assert_true(not has_function_privilege('anon','public.read_compact_audit_agenda_if_changed(text,text,text,text)','execute')
 and not has_function_privilege('service_role','public.read_audit_agenda_visit_detail(text,uuid,text,text)','execute')
 and not has_function_privilege('authenticated','dialogo_private.project_selected_agenda_visits(text,text,text,uuid,boolean)','execute'),'Private helpers and public RPC grants remain restricted');
select pg_temp.assert_true((select count(*)=2 from pg_proc where oid in (
 'public.read_compact_audit_agenda_if_changed(text,text,text,text)'::regprocedure,
 'public.read_audit_agenda_visit_detail(text,uuid,text,text)'::regprocedure)
 and provolatile='s' and prosecdef and proconfig=array['search_path=""']),'Both new reads are STABLE with empty search path');
set local role anon;
select pg_temp.expect_error($sql$select public.read_compact_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_audit_agenda_visit_detail('ADMINISTRATIVO',pg_temp.id(201),null,'GERAL')$sql$,'42501');
reset role;
set local "request.jwt.claim.sub"='';
set local role authenticated;
select pg_temp.expect_error($sql$select public.read_audit_agenda_visit_detail('ADMINISTRATIVO',pg_temp.id(201),null,'GERAL')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_compact_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL')$sql$,'42501');
reset role;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';

-- Eligibility and notification timestamps remain live across request boundaries.
update auth.users set banned_until=clock_timestamp()+interval '10 minutes' where id=pg_temp.id(2);
set local role authenticated;
select pg_temp.assert_view('ADMINISTRATIVO',null,'GERAL');
select set_config('dialogo.test.banned_compact_revision',public.read_compact_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL')->>'revision',true);
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
select pg_temp.expect_error($sql$select public.read_audit_agenda_visit_detail('AUDITOR_SEGURANCA',pg_temp.id(201))$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_compact_audit_agenda_if_changed('AUDITOR_SEGURANCA')$sql$,'42501');
reset role;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
update auth.users set banned_until=clock_timestamp()+interval '200 milliseconds' where id=pg_temp.id(2);
-- COMPACT_AGENDA_BAN_EXPIRY_BOUNDARY

set local role authenticated;
select pg_temp.assert_true(public.read_compact_audit_agenda_if_changed('ADMINISTRATIVO',null,'GERAL',current_setting('dialogo.test.banned_compact_revision'))->>'unchanged'='false','Ban expiry without writes invalidates compact token');
select pg_temp.assert_view('ADMINISTRATIVO',null,'GERAL');
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
select pg_temp.assert_true(public.read_audit_agenda_visit_detail('AUDITOR_SEGURANCA',pg_temp.id(201)) is not null,'Expired ban restores currently authorized detail');
reset role;
rollback;

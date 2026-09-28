-- B.38 isolated PostgreSQL regression. Never execute against a hosted database.
begin;
do $test$ begin
  if current_setting('dialogo.test_database',true) is distinct from 'isolated-local'
    or session_user <> 'postgres' or exists(select 1 from auth.users) then
    raise exception 'Requires empty disposable local database';
  end if;
end $test$;
create function pg_temp.assert_true(result boolean,label text) returns void language plpgsql as $test$
begin if result is distinct from true then raise exception 'Failed: %',label; end if; end $test$;
create function pg_temp.expect_error(statement text,expected_code text) returns void language plpgsql as $test$
declare received text;
begin
  begin execute statement;
  exception when others then
    get stacked diagnostics received=returned_sqlstate;
    if received=expected_code then return; end if;
    raise exception 'Expected SQLSTATE %, got %: %',expected_code,received,sqlerrm;
  end;
  raise exception 'Expected SQLSTATE %, statement succeeded: %',expected_code,statement;
end $test$;
create function pg_temp.id(n integer) returns uuid language sql immutable as $test$
  select ('d1b80000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
$test$;
create function pg_temp.visit(n integer,kind text default 'audit',discipline text default 'safety')
returns jsonb language sql immutable as $test$
  select jsonb_build_object('requestId',pg_temp.id(n),'workId',pg_temp.id(101),
    'auditorId',pg_temp.id(case discipline when 'safety' then 2 else 3 end),
    'module',discipline,'kind',kind,'modelId',case when kind='follow_up' then null
      when discipline='safety' then 'security-it07-r02' else 'quality-f175' end,
    'date','2030-02-20','note','Synthetic batch fixture');
$test$;

insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 ('13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br','{"nome":"Batch admin"}',clock_timestamp()),
 (pg_temp.id(2),'batch.safety@dialogo.com.br','{"nome":"Batch safety"}',clock_timestamp()),
 (pg_temp.id(3),'batch.quality@dialogo.com.br','{"nome":"Batch quality"}',clock_timestamp()),
 (pg_temp.id(4),'batch.limited@dialogo.com.br','{"nome":"Batch quality admin"}',clock_timestamp());
select dialogo_private.bootstrap_first_administrator('13044e3f-e8d2-4b4b-9981-22a8de22c610',
 'emanuel.locchi@dialogo.com.br','Isolated batch agenda bootstrap');
update public.access_accounts set atuacao_administrativa='GERAL'
 where auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610';
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
insert into public.access_works(id,nome,created_by) values(pg_temp.id(101),'Batch work',auth.uid());
set local role authenticated;
select public.approve_access_request_v3(pg_temp.id(2),array['AUDITOR_SEGURANCA'],null,null,
 jsonb_build_array(jsonb_build_object('perfil','AUDITOR_SEGURANCA','obra_id',pg_temp.id(101),'modulo','SEGURANCA')),
 'Safety follow-up grant');
select public.approve_access_request_v3(pg_temp.id(3),array['AUDITOR_QUALIDADE'],null,null,
 jsonb_build_array(jsonb_build_object('perfil','AUDITOR_QUALIDADE','obra_id',pg_temp.id(101),'modulo','QUALIDADE')),
 'Quality audit nominee');
select public.approve_access_request_v3(pg_temp.id(4),array['ADMINISTRATIVO'],null,'QUALIDADE','[]','Limited quality administrator');
reset role;
delete from public.access_grants where auth_user_id=pg_temp.id(3);

select pg_temp.assert_true(has_function_privilege('authenticated','public.create_agenda_visits_batch(jsonb)','EXECUTE')
 and not has_function_privilege('anon','public.create_agenda_visits_batch(jsonb)','EXECUTE')
 and not has_function_privilege('service_role','public.create_agenda_visits_batch(jsonb)','EXECUTE')
 and (select prosecdef and proconfig @> array['search_path=""'] from pg_proc
   where oid='public.create_agenda_visits_batch(jsonb)'::regprocedure),
 'Only authenticated callers enter the batch with an empty SECURITY DEFINER search path');

set local role authenticated;
select set_config('dialogo.b38.ids',public.create_agenda_visits_batch(jsonb_build_array(pg_temp.visit(11),pg_temp.visit(12,'follow_up')))::text,true);
select pg_temp.assert_true(public.create_agenda_visits_batch(jsonb_build_array(pg_temp.visit(11),pg_temp.visit(12,'follow_up')))
 =current_setting('dialogo.b38.ids')::uuid[],'Complete retry returns the original IDs');
select pg_temp.assert_true(public.create_agenda_visits_batch(jsonb_build_array(pg_temp.visit(12,'follow_up'),pg_temp.visit(11)))
 =array[(current_setting('dialogo.b38.ids')::uuid[])[2],(current_setting('dialogo.b38.ids')::uuid[])[1]],
 'Result order matches input even when replay lock order is sorted');
reset role;
select pg_temp.assert_true((select count(*)=2 from public.audit_visits)
 and (select count(*)=2 from public.audit_visit_events)
 and (select count(*)=2 from dialogo_private.audit_visit_operations),
 'Batch and retries insert exactly one visit, event and replay record per row');
select pg_temp.assert_true((select count(*)=1 from public.audit_visits where visit_kind='AUDITORIA' and modelo_id='security-it07-r02')
 and (select count(*)=1 from public.audit_visits where visit_kind='ACOMPANHAMENTO' and modelo_id is null),
 'Mixed audit and follow-up retain their distinct model and purpose');

set local role authenticated;
select pg_temp.expect_error($sql$select public.create_agenda_visits_batch('null')$sql$,'22023');
select pg_temp.expect_error($sql$select public.create_agenda_visits_batch('{}')$sql$,'22023');
select pg_temp.expect_error($sql$select public.create_agenda_visits_batch('[]')$sql$,'22023');
select pg_temp.expect_error($sql$select public.create_agenda_visits_batch(jsonb_build_array(pg_temp.visit(21),pg_temp.visit(21)))$sql$,'22023');
select pg_temp.expect_error($sql$select public.create_agenda_visits_batch(jsonb_build_array(pg_temp.visit(21)||'{"actor":"forged"}'))$sql$,'22023');
select pg_temp.expect_error($sql$select public.create_agenda_visits_batch(jsonb_build_array(pg_temp.visit(21)-'requestId'))$sql$,'22023');
select pg_temp.expect_error($sql$select public.create_agenda_visits_batch(jsonb_build_array(pg_temp.visit(21)||'{"requestId":"invalid"}'))$sql$,'22023');
select pg_temp.expect_error($sql$select public.create_agenda_visits_batch(jsonb_build_array(pg_temp.visit(21,'follow_up')||'{"modelId":"quality-f175"}'))$sql$,'22023');
select pg_temp.expect_error($sql$select public.create_agenda_visits_batch((select jsonb_agg(pg_temp.visit(n)) from generate_series(1000,1200)n))$sql$,'22023');
select pg_temp.expect_error($sql$select public.create_agenda_visits_batch(jsonb_build_array(pg_temp.visit(11)||'{"note":"Changed replay payload"}'))$sql$,'22023');
-- First row is inserted before the second fails authorization: the whole statement rolls back.
select pg_temp.expect_error($sql$select public.create_agenda_visits_batch(jsonb_build_array(pg_temp.visit(21),pg_temp.visit(22,'follow_up','quality'),pg_temp.visit(23)))$sql$,'42501');
select pg_temp.expect_error($sql$select public.create_agenda_visits_batch(jsonb_build_array(pg_temp.visit(21),pg_temp.visit(22)||'{"date":"2030-02-30"}'))$sql$,'22008');
reset role;
select pg_temp.assert_true((select count(*)=2 from public.audit_visits)
 and (select count(*)=2 from public.audit_visit_events)
 and (select count(*)=2 from dialogo_private.audit_visit_operations),
 'Invalid middle row rolls back visits, events and replay records without partial success');

set local role authenticated;
set local "request.jwt.claim.sub"='d1b80000-0000-4000-8000-000000000004';
select pg_temp.expect_error($sql$select public.create_agenda_visits_batch(jsonb_build_array(pg_temp.visit(31,'audit','quality'),pg_temp.visit(32)))$sql$,'42501');
set local "request.jwt.claim.sub"='d1b80000-0000-4000-8000-000000000002';
select pg_temp.expect_error($sql$select public.create_agenda_visits_batch(jsonb_build_array(pg_temp.visit(11)))$sql$,'42501');
set local "request.jwt.claim.sub"='';
select pg_temp.expect_error($sql$select public.create_agenda_visits_batch(jsonb_build_array(pg_temp.visit(11)))$sql$,'42501');
reset role;
select pg_temp.assert_true((select count(*)=2 from public.audit_visits),'Limited discipline, non-administrator and anonymous callers cannot add visits');

set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
update public.access_accounts set ativo=false where auth_user_id=auth.uid();
set local role authenticated;
select pg_temp.expect_error($sql$select public.create_agenda_visits_batch(jsonb_build_array(pg_temp.visit(11)))$sql$,'42501');
select pg_temp.expect_error($sql$select public.create_agenda_visits_batch(jsonb_build_array(pg_temp.visit(41)))$sql$,'42501');
reset role;
update public.access_accounts set ativo=true where auth_user_id=auth.uid();
update public.access_accounts set ativo=false where auth_user_id=pg_temp.id(2);
set local role authenticated;
select pg_temp.expect_error($sql$select public.create_agenda_visits_batch(jsonb_build_array(pg_temp.visit(11),pg_temp.visit(12,'follow_up')))$sql$,'42501');
select pg_temp.expect_error($sql$select public.create_agenda_visits_batch(jsonb_build_array(pg_temp.visit(41)))$sql$,'42501');
reset role;
update public.access_accounts set ativo=true where auth_user_id=pg_temp.id(2);
delete from public.access_grants where auth_user_id=pg_temp.id(2);
set local role authenticated;
select pg_temp.expect_error($sql$select public.create_agenda_visits_batch(jsonb_build_array(pg_temp.visit(11),pg_temp.visit(12,'follow_up')))$sql$,'42501');
select pg_temp.expect_error($sql$select public.create_agenda_visits_batch(jsonb_build_array(pg_temp.visit(42,'follow_up')))$sql$,'42501');
-- An audit nomination is still allowed without a follow-up work grant.
select pg_temp.assert_true(public.create_agenda_visits_batch(jsonb_build_array(pg_temp.visit(11)))
 =array[(current_setting('dialogo.b38.ids')::uuid[])[1]],'Audit replay retains profile nomination semantics after a work grant is removed');
reset role;
update public.access_works set ativo=false where id=pg_temp.id(101);
set local role authenticated;
select pg_temp.expect_error($sql$select public.create_agenda_visits_batch(jsonb_build_array(pg_temp.visit(11)))$sql$,'42501');
select pg_temp.expect_error($sql$select public.create_agenda_visits_batch(jsonb_build_array(pg_temp.visit(41)))$sql$,'42501');
reset role;
update public.access_works set ativo=true where id=pg_temp.id(101);

set local role authenticated;
select pg_temp.assert_true(cardinality(public.create_agenda_visits_batch((select jsonb_agg(pg_temp.visit(n,'audit','quality'))
 from generate_series(1000,1199)n)))=200,'Maximum batch supports nominees without follow-up grants');
select pg_temp.assert_true(cardinality(public.create_agenda_visits_batch((select jsonb_agg(pg_temp.visit(n,'audit','quality'))
 from generate_series(1000,1199)n)))=200,'Maximum batch retries retain the same visits');
reset role;
select pg_temp.assert_true((select count(*)=202 from public.audit_visits)
 and (select count(*)=202 from public.audit_visit_events)
 and (select count(*)=202 from dialogo_private.audit_visit_operations),
 'Two hundred visits commit once with no duplicate records after retry');
rollback;

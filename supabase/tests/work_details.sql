-- B5 isolated PostgreSQL upgrade suite. Never execute against hosted databases.
begin;
do $test$
begin
  if current_setting('dialogo.test_database', true) is distinct from 'isolated-local'
    or session_user <> 'postgres' or exists (select 1 from auth.users) then
    raise exception 'Requires empty, disposable local database and postgres session';
  end if;
end;
$test$;
create function pg_temp.assert_true(result boolean, test_name text)
returns void language plpgsql as $test$
begin
  if result is distinct from true then raise exception 'Failed: %', test_name; end if;
end;
$test$;
create function pg_temp.expect_error(statement text, expected_state text, expected_message text default null)
returns void language plpgsql as $test$
declare actual_state text; actual_message text;
begin
  begin execute statement;
  exception when others then
    get stacked diagnostics actual_state=returned_sqlstate, actual_message=message_text;
  end;
  if actual_state is distinct from expected_state
    or (expected_message is not null and actual_message is distinct from expected_message) then
    raise exception 'Expected % / %, got % / % for %',
      expected_state, expected_message, actual_state, actual_message, statement;
  end if;
end;
$test$;
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 ('13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br','{"nome":"SQL B5 admin fixture"}',clock_timestamp()),
 ('d1a50000-0000-4000-8000-000000000002','fixture.b5.auditor@dialogo.com.br','{"nome":"SQL B5 auditor"}',clock_timestamp()),
 ('d1a50000-0000-4000-8000-000000000003','fixture.b5.pending@dialogo.com.br','{"nome":"SQL B5 pending"}',clock_timestamp());
select dialogo_private.bootstrap_first_administrator('13044e3f-e8d2-4b4b-9981-22a8de22c610',
 'emanuel.locchi@dialogo.com.br','Synthetic local bootstrap for work detail suite');
insert into public.access_works(id,nome,created_by) values
 ('d1a50000-0000-4000-8000-000000000101','SQL B5 work alpha','13044e3f-e8d2-4b4b-9981-22a8de22c610'),
 ('d1a50000-0000-4000-8000-000000000102','SQL B5 work beta','13044e3f-e8d2-4b4b-9981-22a8de22c610');
set local role authenticated;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select public.approve_access_request_v2('d1a50000-0000-4000-8000-000000000002',array['AUDITOR_SEGURANCA'],null,
 '[{"perfil":"AUDITOR_SEGURANCA","obra_id":"d1a50000-0000-4000-8000-000000000101","modulo":"SEGURANCA"}]',
 'Synthetic local auditor grants before work details upgrade');
reset role;
set local "request.jwt.claim.sub"='';
create temporary table b5_original_works as select id,to_jsonb(w) payload from public.access_works w;
create temporary table b5_original_grants as select to_jsonb(g) payload from public.access_grants g;
create temporary table b5_original_accounts as select auth_user_id,to_jsonb(a) payload from public.access_accounts a;
create temporary table b5_original_requests as select auth_user_id,to_jsonb(r) payload from public.access_requests r;
create temporary table b5_original_auth as select id,to_jsonb(u) payload from auth.users u;
create temporary table b5_original_decisions as select id,to_jsonb(d) payload from public.access_decisions d;
commit;

-- MIGRATION_UPGRADE_BOUNDARY

begin;
create function pg_temp.work_payload(p_work uuid)
returns jsonb language sql as $test$
  select to_jsonb(w) - array['id','ativo','created_at','created_by','revisao','updated_at','updated_by']
    from public.access_works w where w.id=p_work;
$test$;
select pg_temp.assert_true(
 not exists (select 1 from b5_original_works o join public.access_works w using(id)
   where to_jsonb(w) - array['logradouro','numero','complemento','bairro','cidade','uf','cep',
    'responsavel_tecnico','registro_tecnico','coordenacao','observacoes','equipe_obra','revisao','updated_at','updated_by']
     is distinct from o.payload)
 and (select bool_and(revisao=0 and updated_at is null and updated_by is null and equipe_obra='[]'::jsonb
   and logradouro='' and numero='' and complemento='' and bairro='' and cidade='' and uf='' and cep=''
   and responsavel_tecnico='' and registro_tecnico='' and coordenacao='' and observacoes='') from public.access_works)
 and not exists (select 1 from public.access_work_changes), 'W01 migration preserves names/IDs/status and adds empty details only');
select pg_temp.assert_true(
 not exists(select 1 from b5_original_accounts o join public.access_accounts a using(auth_user_id) where to_jsonb(a) is distinct from o.payload)
 and not exists(select 1 from b5_original_requests o join public.access_requests r using(auth_user_id) where to_jsonb(r) is distinct from o.payload)
 and not exists(select 1 from b5_original_auth o join auth.users u using(id) where to_jsonb(u) is distinct from o.payload)
 and not exists(select 1 from b5_original_decisions o join public.access_decisions d using(id) where to_jsonb(d) is distinct from o.payload),
 'W02 migration preserves accounts, Auth, requests and access history');
select pg_temp.assert_true(
 (select public.access_administration_schema_version()=4)
 and not has_function_privilege('anon','public.update_access_work(uuid,integer,jsonb)','EXECUTE')
 and not has_function_privilege('service_role','public.update_access_work(uuid,integer,jsonb)','EXECUTE')
 and has_function_privilege('authenticated','public.update_access_work(uuid,integer,jsonb)','EXECUTE')
 and not has_table_privilege('authenticated','public.access_works','UPDATE')
 and not has_table_privilege('authenticated','public.access_work_changes','INSERT,UPDATE,DELETE,TRUNCATE')
 and not has_table_privilege('service_role','public.access_work_changes','INSERT,UPDATE,DELETE,TRUNCATE')
 and (select relrowsecurity from pg_class where oid='public.access_work_changes'::regclass), 'W03 RLS and explicit API privileges');

set local role authenticated;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
-- Exact no-op, including empty defaults, must not create history or revision.
select pg_temp.assert_true(public.update_access_work('d1a50000-0000-4000-8000-000000000101',0,
 pg_temp.work_payload('d1a50000-0000-4000-8000-000000000101')) =
 '{"obra_id":"d1a50000-0000-4000-8000-000000000101","revisao":0,"updated_at":null,"history_id":null,"changed":false}'::jsonb,
 'W04 unchanged form has no history');
select pg_temp.assert_true((public.update_access_work('d1a50000-0000-4000-8000-000000000101',0,
 pg_temp.work_payload('d1a50000-0000-4000-8000-000000000101') ||
 '{"nome":"  SQL B5 renamed alpha  ","logradouro":" Rua de teste ","numero":"100","complemento":"Bloco A", "bairro":"Bairro de teste","cidade":"São Paulo","uf":"sp","cep":"01001000","responsavel_tecnico":"Responsável de teste","registro_tecnico":"Registro de teste","coordenacao":"Coordenação de teste","observacoes":"Observação de teste","equipe_obra":[{"nome":" Pessoa da equipe ","funcao":" Função de teste "}]}')
 ->> 'changed')::boolean, 'W05 administrative update succeeds');
select pg_temp.assert_true(
 (select nome='SQL B5 renamed alpha' and logradouro='Rua de teste' and uf='SP' and revisao=1
  and updated_by='13044e3f-e8d2-4b4b-9981-22a8de22c610' and updated_at is not null
  and equipe_obra='[{"nome":"Pessoa da equipe","funcao":"Função de teste"}]'::jsonb
  from public.access_works where id='d1a50000-0000-4000-8000-000000000101')
 and (select count(*)=1 from public.access_work_changes)
 and (select before_snapshot->>'nome'='SQL B5 work alpha' and after_snapshot->>'nome'='SQL B5 renamed alpha'
  and (before_snapshot->>'revisao')::integer=0 and (after_snapshot->>'revisao')::integer=1
  and actor_snapshot->>'nome'='SQL B5 admin fixture'
  and actor_snapshot->>'email'='emanuel.locchi@dialogo.com.br'
  and actor_auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610'
  and (after_snapshot->>'updated_at')::timestamptz=changed_at
  from public.access_work_changes), 'W06 exact before/after snapshots and server-derived actor');
select pg_temp.assert_true((public.update_access_work('d1a50000-0000-4000-8000-000000000101',1,
 pg_temp.work_payload('d1a50000-0000-4000-8000-000000000101')) ->> 'changed')::boolean=false,
 'W07 second identical form remains revision one');
select pg_temp.expect_error($sql$select public.update_access_work('d1a50000-0000-4000-8000-000000000101',0,
 pg_temp.work_payload('d1a50000-0000-4000-8000-000000000101'))$sql$,'40001','work_revision_conflict');
select pg_temp.expect_error($sql$select public.update_access_work('d1a50000-0000-4000-8000-000000000101',-1,
 pg_temp.work_payload('d1a50000-0000-4000-8000-000000000101'))$sql$,'22023','invalid_work_revision');
select pg_temp.expect_error($sql$select public.update_access_work('d1a50000-0000-4000-8000-000000000999',0,
 pg_temp.work_payload('d1a50000-0000-4000-8000-000000000101'))$sql$,'P0002','work_not_found');
do $test$
declare patch jsonb;
begin
  for patch in select value from jsonb_array_elements('[
    {"id":"d1a50000-0000-4000-8000-000000000102"},{"ativo":false},{"created_by":"fake"},
    {"updated_by":"fake"},{"grants":[]},{"nome":"X"},{"numero":123},{"coordenacao":null},
    {"uf":"XX"},{"cep":"01001-000"},{"equipe_obra":null},{"equipe_obra":[{}]},
    {"equipe_obra":[{"nome":"Pessoa de teste","funcao":"","auth_user_id":"fake"}]},
    {"equipe_obra":[{"nome":"X","funcao":""}]},{"equipe_obra":[{"nome":"Pessoa de teste"}]}]') loop
    perform pg_temp.expect_error(format('select public.update_access_work(%L,1,pg_temp.work_payload(%L)||%L::jsonb)',
      'd1a50000-0000-4000-8000-000000000101','d1a50000-0000-4000-8000-000000000101',patch::text),
      '22023','invalid_work_details');
  end loop;
end;
$test$;
select pg_temp.expect_error($sql$select public.update_access_work('d1a50000-0000-4000-8000-000000000101',1,
 pg_temp.work_payload('d1a50000-0000-4000-8000-000000000101') - 'cep')$sql$,'22023','invalid_work_details');
select pg_temp.expect_error($sql$select public.update_access_work('d1a50000-0000-4000-8000-000000000101',1,
 pg_temp.work_payload('d1a50000-0000-4000-8000-000000000101') || jsonb_build_object('observacoes',repeat('a',2001)))$sql$,
 '22023','invalid_work_details');
select pg_temp.expect_error($sql$select public.update_access_work('d1a50000-0000-4000-8000-000000000101',1,
 pg_temp.work_payload('d1a50000-0000-4000-8000-000000000101') || jsonb_build_object('equipe_obra',
 (select jsonb_agg(jsonb_build_object('nome','Nome de teste','funcao','')) from generate_series(1,31))))$sql$,
 '22023','invalid_work_details');
select pg_temp.expect_error($sql$select public.update_access_work('d1a50000-0000-4000-8000-000000000101',1,
 pg_temp.work_payload('d1a50000-0000-4000-8000-000000000101') || '{"nome":"SQL B5 work beta"}')$sql$,'23505');

-- An auditor reads the details of the granted work only and cannot write or read admin history.
set local "request.jwt.claim.sub"='d1a50000-0000-4000-8000-000000000002';
select pg_temp.assert_true((select count(*)=1 from public.access_works)
 and (select cidade='São Paulo' and responsavel_tecnico='Responsável de teste' from public.access_works)
 and (select count(*)=0 from public.access_work_changes), 'W08 technical RLS retains exact work visibility');
select pg_temp.expect_error($sql$select public.update_access_work('d1a50000-0000-4000-8000-000000000101',1,
 pg_temp.work_payload('d1a50000-0000-4000-8000-000000000101'))$sql$,'42501','active_administrator_required');
select pg_temp.expect_error($sql$update public.access_works set nome='Forged write'$sql$,'42501');
set local "request.jwt.claim.sub"='d1a50000-0000-4000-8000-000000000003';
select pg_temp.assert_true((select count(*)=0 from public.access_works) and (select count(*)=0 from public.access_work_changes),
 'W09 pending account sees no work details or history');
select pg_temp.expect_error($sql$select public.update_access_work('d1a50000-0000-4000-8000-000000000101',0,'{}')$sql$,
 '42501','active_administrator_required');
reset role;

-- Failure to append history must roll the work update back atomically.
create function pg_temp.reject_work_history_insert() returns trigger language plpgsql as $test$
begin raise exception using errcode='P0055',message='Synthetic history insertion failure'; end;
$test$;
create trigger b5_synthetic_history_failure before insert on public.access_work_changes
 for each row execute function pg_temp.reject_work_history_insert();
set local role authenticated;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select pg_temp.expect_error($sql$select public.update_access_work('d1a50000-0000-4000-8000-000000000101',1,
 pg_temp.work_payload('d1a50000-0000-4000-8000-000000000101') || '{"nome":"Must roll back"}')$sql$,'P0055');
select pg_temp.assert_true((select nome='SQL B5 renamed alpha' and revisao=1 from public.access_works
 where id='d1a50000-0000-4000-8000-000000000101') and (select count(*)=1 from public.access_work_changes),
 'W10 history failure rolls back update and all rejected writes preserve revision');
select pg_temp.expect_error($sql$delete from public.access_work_changes$sql$,'42501');
select pg_temp.expect_error($sql$truncate public.access_work_changes$sql$,'42501');
reset role;
drop trigger b5_synthetic_history_failure on public.access_work_changes;
select pg_temp.expect_error($sql$update public.access_work_changes set actor_snapshot='{}'$sql$,'55000','work_history_is_immutable');
select pg_temp.expect_error($sql$delete from public.access_work_changes$sql$,'55000','work_history_is_immutable');
select pg_temp.expect_error($sql$truncate public.access_work_changes$sql$,'55000','work_history_is_immutable');

update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id='13044e3f-e8d2-4b4b-9981-22a8de22c610';
set local role authenticated;
select pg_temp.expect_error($sql$select public.update_access_work('d1a50000-0000-4000-8000-000000000101',1,'{}')$sql$,
 '42501','active_administrator_required');
select pg_temp.assert_true((select count(*)=0 from public.access_work_changes), 'W11 banned administrator cannot read history');
reset role;
update auth.users set banned_until=null where id='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select pg_temp.assert_true(
 (select jsonb_agg(payload order by payload::text) from b5_original_grants) is not distinct from
  (select jsonb_agg(to_jsonb(g) order by to_jsonb(g)::text) from public.access_grants g)
 and not exists(select 1 from b5_original_decisions o join public.access_decisions d using(id) where to_jsonb(d) is distinct from o.payload)
 and not exists(select 1 from b5_original_accounts o join public.access_accounts a using(auth_user_id) where to_jsonb(a) is distinct from o.payload)
 and not exists(select 1 from b5_original_requests o join public.access_requests r using(auth_user_id) where to_jsonb(r) is distinct from o.payload),
 'W12 editing descriptive people/names never changes grants/accounts/requests or old approvals');
-- Old creation RPC retains defaults and creates no edit history.
set local role authenticated;
select public.create_access_work('SQL B5 new work after migration');
select pg_temp.assert_true((select revisao=0 and updated_at is null and equipe_obra='[]'::jsonb
 from public.access_works where nome='SQL B5 new work after migration') and (select count(*)=1 from public.access_work_changes),
 'W13 old create RPC stays compatible with revision zero');
reset role;
rollback;

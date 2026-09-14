-- B4 isolated local upgrade test. Never execute against hosted databases.
begin;
do $test$
begin
  if current_setting('dialogo.test_database', true) is distinct from 'isolated-local'
    or session_user <> 'postgres' or exists(select 1 from auth.users)
    or exists(select 1 from public.access_decisions) then
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
      expected_state,expected_message,actual_state,actual_message,statement;
  end if;
end;
$test$;

insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 ('13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br','{"nome":"SQL designated fixture"}',clock_timestamp()),
 ('d1a40000-0000-4000-8000-000000000002','fixture.b4.team@dialogo.com.br','{"nome":"SQL legacy team"}',clock_timestamp()),
 ('d1a40000-0000-4000-8000-000000000003','fixture.b4.pending@dialogo.com.br','{"nome":"SQL pending"}',clock_timestamp());
select dialogo_private.bootstrap_first_administrator('13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br','Synthetic local bootstrap for scope upgrade');
insert into public.access_works(id,nome,created_by)
 select ('d1a40000-0000-4000-8000-'||lpad((100+i)::text,12,'0'))::uuid,'SQL B4 isolated work '||i,'13044e3f-e8d2-4b4b-9981-22a8de22c610'::uuid from generate_series(1,21) i;
select dialogo_private.configure_initial_account_profiles('13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br',
 (select array_agg(id order by id) from public.access_works),'Synthetic local four profiles before scope upgrade');
set local role authenticated;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select public.approve_access_request_v2('d1a40000-0000-4000-8000-000000000002',array['ENGENHARIA'],'EQUIPE_OBRA',
 '[{"perfil":"ENGENHARIA","obra_id":"d1a40000-0000-4000-8000-000000000101","modulo":"SEGURANCA"}]','Synthetic legacy single engineering team access');
reset role;
set local "request.jwt.claim.sub"='';
create temporary table b4_decisions as select id,to_jsonb(d) payload from public.access_decisions d;
create temporary table b4_accounts as select auth_user_id,to_jsonb(a) payload from public.access_accounts a;
create temporary table b4_requests as select auth_user_id,to_jsonb(r) payload from public.access_requests r;
create temporary table b4_grants as select auth_user_id,perfil,obra_id,modulo,to_jsonb(g) payload from public.access_grants g;
commit;
-- MIGRATION_UPGRADE_BOUNDARY
begin;
select pg_temp.assert_true(
 not exists(select 1 from b4_decisions o join public.access_decisions d using(id) where to_jsonb(d)-'atuacoes_engenharia' is distinct from o.payload or d.atuacoes_engenharia is not null)
 and not exists(select 1 from b4_accounts o join public.access_accounts a using(auth_user_id) where to_jsonb(a)-'atuacoes_engenharia' is distinct from o.payload or a.atuacoes_engenharia is distinct from array[a.atuacao_engenharia])
 and not exists(select 1 from b4_requests o join public.access_requests r using(auth_user_id) where to_jsonb(r) is distinct from o.payload)
 and not exists(select 1 from b4_grants o join public.access_grants g using(auth_user_id,perfil,obra_id,modulo) where to_jsonb(g) is distinct from o.payload),
 'E01 migration preserves all previous fields, history, requests and exact grants');

select pg_temp.expect_error($sql$update public.access_accounts set atuacoes_engenharia=array['ROOT'] where auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610'$sql$,'23514');
select pg_temp.expect_error($sql$update public.access_accounts set atuacoes_engenharia=array['COORDENACAO','COORDENACAO'] where auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610'$sql$,'23514');
select pg_temp.expect_error($sql$update public.access_accounts set atuacoes_engenharia=array['COORDENACAO','EQUIPE_OBRA'] where auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610'$sql$,'23514');
select pg_temp.expect_error($sql$update public.access_accounts set atuacoes_engenharia=array['EQUIPE_OBRA'] where auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610'$sql$,'23514');
select pg_temp.expect_error($sql$update public.access_accounts set atuacoes_engenharia=array['COORDENACAO',null] where auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610'$sql$,'23514');

-- ACLs must hold even when Supabase has permissive legacy defaults.
do $test$ declare r text; begin
 foreach r in array array['anon','authenticated','service_role'] loop
  perform pg_temp.assert_true(not has_function_privilege(r,'dialogo_private.configure_initial_engineering_scopes(uuid,text,uuid[],text)','EXECUTE') and not has_schema_privilege(r,'dialogo_private','USAGE'),'E02 no API scope adjustment '||r);
  perform pg_temp.assert_true(not has_table_privilege(r,'public.access_accounts','INSERT,UPDATE,DELETE,TRUNCATE'),'E02 no client direct authority write '||r);
 end loop;
end $test$;
set local role authenticated;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select pg_temp.assert_true(public.has_current_engineering_scope('COORDENACAO','d1a40000-0000-4000-8000-000000000101','SEGURANCA') and not public.has_current_engineering_scope('EQUIPE_OBRA','d1a40000-0000-4000-8000-000000000101','SEGURANCA'),'E03 new scope not implicitly inherited');
select pg_temp.expect_error($sql$update public.access_accounts set atuacoes_engenharia=array['EQUIPE_OBRA','COORDENACAO'] where auth_user_id=auth.uid()$sql$,'42501');
select pg_temp.expect_error($sql$select dialogo_private.configure_initial_engineering_scopes('13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br',array[]::uuid[],'Client self approval must not execute')$sql$,'42501');
reset role;
set local "request.jwt.claim.sub"='';
select pg_temp.expect_error($sql$select dialogo_private.configure_initial_engineering_scopes('13044e3f-e8d2-4b4b-9981-22a8de22c610','wrong@dialogo.com.br',(select array_agg(id order by id) from public.access_works),'Wrong identity should fail atomically')$sql$,'22023');
select pg_temp.expect_error($sql$select dialogo_private.configure_initial_engineering_scopes('13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br',(select array_agg(id order by id) from public.access_works where id<>'d1a40000-0000-4000-8000-000000000121'),'Wrong work set should fail atomically')$sql$,'22023');
create function pg_temp.fail_scope_adjustment() returns trigger language plpgsql as $test$
 begin if cardinality(new.atuacoes_engenharia)=2 then raise exception using errcode='P0097',message='injected_scope_failure'; end if; return new; end $test$;
create trigger test_scope_failure before update of atuacoes_engenharia on public.access_accounts for each row execute function pg_temp.fail_scope_adjustment();
select pg_temp.expect_error($sql$select dialogo_private.configure_initial_engineering_scopes('13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br',(select array_agg(id order by id) from public.access_works),'Injected failure must preserve account and decisions')$sql$,'P0097');
select pg_temp.assert_true((select count(*)=3 from public.access_decisions) and (select atuacoes_engenharia=array['COORDENACAO'] from public.access_accounts where auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610'),'E04 late failure rolls back decision and scope together');
drop trigger test_scope_failure on public.access_accounts;
select dialogo_private.configure_initial_engineering_scopes('13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br',(select array_agg(id order by id) from public.access_works),'Authorized synthetic scope addition for existing 21 works');
select pg_temp.assert_true(
 (select atuacoes_engenharia=array['EQUIPE_OBRA','COORDENACAO'] and atuacao_engenharia='COORDENACAO' from public.access_accounts where auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610')
 and (select count(*)=1 from public.access_decisions where decision_type='AJUSTE_ATUACAO_INICIAL' and actor_auth_user_id is null and actor_database_role='postgres' and before_access_snapshot->'account'->'atuacoes_engenharia'='["COORDENACAO"]'::jsonb and atuacoes_engenharia=array['EQUIPE_OBRA','COORDENACAO'])
 and not exists(select 1 from b4_decisions o join public.access_decisions d using(id) where to_jsonb(d)-'atuacoes_engenharia' is distinct from o.payload)
 and not exists(select 1 from b4_grants o join public.access_grants g using(auth_user_id,perfil,obra_id,modulo) where to_jsonb(g) is distinct from o.payload)
 and not exists(select 1 from b4_requests o join public.access_requests r using(auth_user_id) where to_jsonb(r) is distinct from o.payload)
 and not exists(select 1 from b4_accounts o join public.access_accounts a using(auth_user_id) where to_jsonb(a)-'atuacoes_engenharia' is distinct from o.payload),
 'E05 scope added without rewriting original authorization, requests, grants or history');
select pg_temp.expect_error($sql$select dialogo_private.configure_initial_engineering_scopes('13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br',(select array_agg(id order by id) from public.access_works),'Repeated addition must never duplicate history')$sql$,'55000');
set local role authenticated;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select pg_temp.assert_true(public.has_current_engineering_scope('COORDENACAO','d1a40000-0000-4000-8000-000000000101','SEGURANCA') and public.has_current_engineering_scope('EQUIPE_OBRA','d1a40000-0000-4000-8000-000000000101','SEGURANCA') and not public.has_current_engineering_scope('ROOT','d1a40000-0000-4000-8000-000000000101','SEGURANCA'),'E06 authorized pair allows both exact engineering activities');
select public.approve_access_request_v2('d1a40000-0000-4000-8000-000000000003',array['ENGENHARIA'],'COORDENACAO','[{"perfil":"ENGENHARIA","obra_id":"d1a40000-0000-4000-8000-000000000102","modulo":"QUALIDADE"}]','Existing approval interface remains compatible after upgrade');
set local "request.jwt.claim.sub"='d1a40000-0000-4000-8000-000000000003';
select pg_temp.assert_true((select atuacoes_engenharia=array['COORDENACAO'] from public.access_accounts where auth_user_id=auth.uid()) and public.has_current_engineering_scope('COORDENACAO','d1a40000-0000-4000-8000-000000000102','QUALIDADE') and not public.has_current_engineering_scope('EQUIPE_OBRA','d1a40000-0000-4000-8000-000000000102','QUALIDADE') and not public.has_current_engineering_scope('COORDENACAO','d1a40000-0000-4000-8000-000000000101','QUALIDADE') and not public.has_current_engineering_scope('COORDENACAO','d1a40000-0000-4000-8000-000000000102','SEGURANCA'),'E07 legacy approval does not expand activity, work or module');
reset role;
update public.access_accounts set ativo=false where auth_user_id='d1a40000-0000-4000-8000-000000000003';
set local role authenticated;
select pg_temp.assert_true(not public.has_current_engineering_scope('COORDENACAO','d1a40000-0000-4000-8000-000000000102','QUALIDADE'),'E08 revocation immediately invalidates activity');
reset role;
rollback;

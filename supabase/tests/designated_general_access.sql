-- B6 isolated PostgreSQL upgrade suite. Never execute against hosted databases.
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
      expected_state, expected_message, actual_state, actual_message, statement;
  end if;
end;
$test$;
create function pg_temp.b6_work_ids()
returns uuid[] language sql as $test$
  select array_agg(('d1a60000-0000-4000-8000-'||lpad((100+i)::text,12,'0'))::uuid order by i)
    from generate_series(1,21) i;
$test$;
create function pg_temp.b6_state()
returns jsonb language sql as $test$
  select jsonb_build_object(
    'auth', (select jsonb_agg(to_jsonb(u) order by id) from auth.users u),
    'accounts', (select jsonb_agg(to_jsonb(a) order by auth_user_id) from public.access_accounts a),
    'requests', (select jsonb_agg(to_jsonb(r) order by auth_user_id) from public.access_requests r),
    'decisions', (select jsonb_agg(to_jsonb(d) order by id) from public.access_decisions d),
    'grants', (select jsonb_agg(to_jsonb(g) order by auth_user_id,perfil,obra_id,modulo) from public.access_grants g),
    'works', (select jsonb_agg(to_jsonb(w) order by id) from public.access_works w),
    'work_history', (select jsonb_agg(to_jsonb(c) order by id) from public.access_work_changes c)
  );
$test$;

insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 ('13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br','{"nome":"SQL B6 reference fixture"}',clock_timestamp()),
 ('1f60b2cc-8028-453e-a6de-9312aa5a67cb','luiza.dutra@dialogo.com.br','{"nome":"SQL B6 designated fixture"}',clock_timestamp()),
 ('d1a60000-0000-4000-8000-000000000003','fixture.b6.pending@dialogo.com.br','{"nome":"SQL B6 pending fixture"}',clock_timestamp());
select dialogo_private.bootstrap_first_administrator('13044e3f-e8d2-4b4b-9981-22a8de22c610',
 'emanuel.locchi@dialogo.com.br','Synthetic local bootstrap for designated access suite');
insert into public.access_works(id,nome,created_by)
 select ('d1a60000-0000-4000-8000-'||lpad((100+i)::text,12,'0'))::uuid,
 'SQL B6 isolated work '||i,'13044e3f-e8d2-4b4b-9981-22a8de22c610'::uuid from generate_series(1,22) i;
select dialogo_private.configure_initial_account_profiles('13044e3f-e8d2-4b4b-9981-22a8de22c610',
 'emanuel.locchi@dialogo.com.br',pg_temp.b6_work_ids(),'Synthetic four reference profiles on 21 reviewed works');
select dialogo_private.configure_initial_engineering_scopes('13044e3f-e8d2-4b4b-9981-22a8de22c610',
 'emanuel.locchi@dialogo.com.br',pg_temp.b6_work_ids(),'Synthetic dual Engineering reference activities');
set local role authenticated;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select public.approve_access_request_v2('1f60b2cc-8028-453e-a6de-9312aa5a67cb',
 array['ADMINISTRATIVO','AUDITOR_SEGURANCA','AUDITOR_QUALIDADE','ENGENHARIA'],'EQUIPE_OBRA',
 '[{"perfil":"AUDITOR_SEGURANCA","obra_id":"d1a60000-0000-4000-8000-000000000101","modulo":"SEGURANCA"},
   {"perfil":"AUDITOR_QUALIDADE","obra_id":"d1a60000-0000-4000-8000-000000000101","modulo":"QUALIDADE"},
   {"perfil":"ENGENHARIA","obra_id":"d1a60000-0000-4000-8000-000000000101","modulo":"SEGURANCA"}]',
 'Synthetic original approval with exactly three grants on one work');
reset role;
set local "request.jwt.claim.sub"='';
create temporary table b6_original_state as select pg_temp.b6_state() payload;
create temporary table b6_original_accounts as select auth_user_id,to_jsonb(a) payload from public.access_accounts a;
create temporary table b6_original_requests as select auth_user_id,to_jsonb(r) payload from public.access_requests r;
create temporary table b6_original_auth as select id,to_jsonb(u) payload from auth.users u;
create temporary table b6_original_decisions as select id,to_jsonb(d) payload from public.access_decisions d;
create temporary table b6_original_grants as select auth_user_id,perfil,obra_id,modulo,to_jsonb(g) payload from public.access_grants g;
create temporary table b6_original_works as select id,to_jsonb(w) payload from public.access_works w;
commit;

-- MIGRATION_UPGRADE_BOUNDARY

begin;
create function pg_temp.b6_call()
returns uuid language sql as $test$
  select dialogo_private.configure_luiza_general_access('1f60b2cc-8028-453e-a6de-9312aa5a67cb',
    'luiza.dutra@dialogo.com.br',pg_temp.b6_work_ids(),
    'Authorized synthetic general access on the same 21 reference works');
$test$;
select pg_temp.assert_true(pg_temp.b6_state()=(select payload from b6_original_state),
 'G01 migration alone preserves every Auth/account/request/grant/work/history row');

do $test$ declare r text; begin
 foreach r in array array['anon','authenticated','service_role'] loop
  perform pg_temp.assert_true(
   not has_function_privilege(r,'dialogo_private.configure_luiza_general_access(uuid,text,uuid[],text)','EXECUTE')
   and not has_schema_privilege(r,'dialogo_private','USAGE'), 'G02 private function unavailable to API role '||r);
  perform pg_temp.assert_true(
   not has_table_privilege(r,'public.access_accounts','INSERT,UPDATE,DELETE,TRUNCATE')
   and not has_table_privilege(r,'public.access_grants','INSERT,UPDATE,DELETE,TRUNCATE')
   and not has_table_privilege(r,'public.access_decisions','INSERT,UPDATE,DELETE,TRUNCATE'),
   'G02 no direct authority writes for API role '||r);
 end loop;
 perform pg_temp.assert_true(
  has_function_privilege('postgres','dialogo_private.configure_luiza_general_access(uuid,text,uuid[],text)','EXECUTE')
  and (select prosecdef and proconfig @> array['search_path=""'] from pg_proc
    where oid='dialogo_private.configure_luiza_general_access(uuid,text,uuid[],text)'::regprocedure)
  and (select bool_and(relrowsecurity) from pg_class
    where oid in ('public.access_accounts'::regclass,'public.access_grants'::regclass,'public.access_decisions'::regclass)),
  'G03 owner-only entry point retains fixed search path and RLS');
end $test$;

set local role anon;
select pg_temp.expect_error('select pg_temp.b6_call()','42501');
reset role;
set local role service_role;
select pg_temp.expect_error('select pg_temp.b6_call()','42501');
reset role;
set local role authenticated;
set local "request.jwt.claim.sub"='1f60b2cc-8028-453e-a6de-9312aa5a67cb';
select pg_temp.expect_error('select pg_temp.b6_call()','42501');
select pg_temp.expect_error($sql$update public.access_accounts set atuacoes_engenharia=array['EQUIPE_OBRA','COORDENACAO'] where auth_user_id=auth.uid()$sql$,'42501');
select pg_temp.assert_true(
 public.has_current_engineering_scope('EQUIPE_OBRA','d1a60000-0000-4000-8000-000000000101','SEGURANCA')
 and not public.has_current_engineering_scope('COORDENACAO','d1a60000-0000-4000-8000-000000000101','SEGURANCA')
 and not public.has_current_access_grant('ENGENHARIA','d1a60000-0000-4000-8000-000000000102','SEGURANCA')
 and (select count(*)=3 from public.access_grants where auth_user_id=auth.uid()),
 'G04 original administrative profile does not imply wider technical grants or activities');
reset role;
set local "request.jwt.claim.sub"='';

-- The function also rejects SET ROLE even if privileges are accidentally added.
savepoint b6_role_guard;
grant usage on schema dialogo_private to service_role;
grant execute on function dialogo_private.configure_luiza_general_access(uuid,text,uuid[],text) to service_role;
set local role service_role;
select pg_temp.expect_error('select pg_temp.b6_call()','42501','database_administrator_session_required');
reset role;
rollback to savepoint b6_role_guard;
release savepoint b6_role_guard;

select pg_temp.expect_error($sql$select dialogo_private.configure_luiza_general_access('13044e3f-e8d2-4b4b-9981-22a8de22c610','luiza.dutra@dialogo.com.br',pg_temp.b6_work_ids(),'Wrong identity must be rejected')$sql$,'22023');
select pg_temp.expect_error($sql$select dialogo_private.configure_luiza_general_access('d1a60000-0000-4000-8000-000000000003','fixture.b6.pending@dialogo.com.br',pg_temp.b6_work_ids(),'Pending unrelated identity must be rejected')$sql$,'22023');
select pg_temp.expect_error($sql$select dialogo_private.configure_luiza_general_access('1f60b2cc-8028-453e-a6de-9312aa5a67cb','wrong@dialogo.com.br',pg_temp.b6_work_ids(),'Wrong email must be rejected')$sql$,'22023');
select pg_temp.expect_error($sql$select dialogo_private.configure_luiza_general_access(null,null,pg_temp.b6_work_ids(),'Missing identity must be rejected')$sql$,'22023');
select pg_temp.expect_error($sql$select dialogo_private.configure_luiza_general_access('1f60b2cc-8028-453e-a6de-9312aa5a67cb','luiza.dutra@dialogo.com.br',pg_temp.b6_work_ids(),'short')$sql$,'22023');
select pg_temp.expect_error($sql$select dialogo_private.configure_luiza_general_access('1f60b2cc-8028-453e-a6de-9312aa5a67cb','luiza.dutra@dialogo.com.br',null,'Missing works must be rejected')$sql$,'22023');
select pg_temp.expect_error($sql$select dialogo_private.configure_luiza_general_access('1f60b2cc-8028-453e-a6de-9312aa5a67cb','luiza.dutra@dialogo.com.br',(pg_temp.b6_work_ids())[1:20],'Twenty works must be rejected')$sql$,'22023');
select pg_temp.expect_error($sql$select dialogo_private.configure_luiza_general_access('1f60b2cc-8028-453e-a6de-9312aa5a67cb','luiza.dutra@dialogo.com.br',array_append((pg_temp.b6_work_ids())[1:20],(pg_temp.b6_work_ids())[1]),'Duplicate work must be rejected')$sql$,'22023');
select pg_temp.expect_error($sql$select dialogo_private.configure_luiza_general_access('1f60b2cc-8028-453e-a6de-9312aa5a67cb','luiza.dutra@dialogo.com.br',array_append((pg_temp.b6_work_ids())[1:20],null::uuid),'Null work must be rejected')$sql$,'22023');
select pg_temp.expect_error($sql$select dialogo_private.configure_luiza_general_access('1f60b2cc-8028-453e-a6de-9312aa5a67cb','luiza.dutra@dialogo.com.br',array_append((pg_temp.b6_work_ids())[1:20],'d1a60000-0000-4000-8000-000000000122'::uuid),'Different set of 21 active works must be rejected')$sql$,'22023');

savepoint b6_pending;
update public.access_requests set status_acesso='PENDENTE_APROVACAO' where auth_user_id='1f60b2cc-8028-453e-a6de-9312aa5a67cb';
select pg_temp.expect_error('select pg_temp.b6_call()','22023');
rollback to savepoint b6_pending;
release savepoint b6_pending;
savepoint b6_unconfirmed;
update auth.users set email_confirmed_at=null where id='1f60b2cc-8028-453e-a6de-9312aa5a67cb';
select pg_temp.expect_error('select pg_temp.b6_call()','22023');
rollback to savepoint b6_unconfirmed;
release savepoint b6_unconfirmed;
savepoint b6_inactive;
update public.access_accounts set ativo=false where auth_user_id='1f60b2cc-8028-453e-a6de-9312aa5a67cb';
select pg_temp.expect_error('select pg_temp.b6_call()','22023');
rollback to savepoint b6_inactive;
release savepoint b6_inactive;
savepoint b6_banned;
update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id='1f60b2cc-8028-453e-a6de-9312aa5a67cb';
select pg_temp.expect_error('select pg_temp.b6_call()','22023');
rollback to savepoint b6_banned;
release savepoint b6_banned;
select pg_temp.expect_error($sql$update auth.users set email='fixture.b6.changed@dialogo.com.br' where id='1f60b2cc-8028-453e-a6de-9312aa5a67cb'$sql$,
 '23514','email_change_not_available');
savepoint b6_inactive_work;
update public.access_works set ativo=false where id='d1a60000-0000-4000-8000-000000000121';
select pg_temp.expect_error('select pg_temp.b6_call()','22023');
rollback to savepoint b6_inactive_work;
release savepoint b6_inactive_work;
savepoint b6_changed_target_grant;
update public.access_grants set granted_at=granted_at+interval '1 second'
 where auth_user_id='1f60b2cc-8028-453e-a6de-9312aa5a67cb' and perfil='ENGENHARIA';
select pg_temp.expect_error('select pg_temp.b6_call()','22023');
rollback to savepoint b6_changed_target_grant;
release savepoint b6_changed_target_grant;
savepoint b6_changed_target_tuple;
update public.access_grants set modulo='QUALIDADE'
 where auth_user_id='1f60b2cc-8028-453e-a6de-9312aa5a67cb' and perfil='ENGENHARIA';
select pg_temp.expect_error('select pg_temp.b6_call()','22023');
rollback to savepoint b6_changed_target_tuple;
release savepoint b6_changed_target_tuple;
savepoint b6_changed_source;
delete from public.access_grants where auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610'
 and perfil='ENGENHARIA' and obra_id='d1a60000-0000-4000-8000-000000000121' and modulo='QUALIDADE';
select pg_temp.expect_error('select pg_temp.b6_call()','22023');
rollback to savepoint b6_changed_source;
release savepoint b6_changed_source;
savepoint b6_source_scope;
update public.access_accounts set atuacoes_engenharia=array['COORDENACAO']
 where auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select pg_temp.expect_error('select pg_temp.b6_call()','22023');
rollback to savepoint b6_source_scope;
release savepoint b6_source_scope;
savepoint b6_source_approval_time;
update public.access_accounts set approved_at=approved_at+interval '1 second'
 where auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select pg_temp.expect_error('select pg_temp.b6_call()','22023');
rollback to savepoint b6_source_approval_time;
release savepoint b6_source_approval_time;
savepoint b6_source_approval_actor;
update public.access_accounts set approved_by='1f60b2cc-8028-453e-a6de-9312aa5a67cb'
 where auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select pg_temp.expect_error('select pg_temp.b6_call()','22023');
rollback to savepoint b6_source_approval_actor;
release savepoint b6_source_approval_actor;
savepoint b6_source_grant_time;
update public.access_grants set granted_at=granted_at+interval '1 second'
 where auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610' and obra_id='d1a60000-0000-4000-8000-000000000121';
select pg_temp.expect_error('select pg_temp.b6_call()','22023');
rollback to savepoint b6_source_grant_time;
release savepoint b6_source_grant_time;
savepoint b6_source_grant_actor;
update public.access_grants set granted_by='1f60b2cc-8028-453e-a6de-9312aa5a67cb'
 where auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610' and obra_id='d1a60000-0000-4000-8000-000000000121';
select pg_temp.expect_error('select pg_temp.b6_call()','22023');
rollback to savepoint b6_source_grant_actor;
release savepoint b6_source_grant_actor;
savepoint b6_source_grant_decision;
update public.access_grants set decision_id=(select id from public.access_decisions where decision_type='AJUSTE_ATUACAO_INICIAL')
 where auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610' and obra_id='d1a60000-0000-4000-8000-000000000121';
select pg_temp.expect_error('select pg_temp.b6_call()','22023');
rollback to savepoint b6_source_grant_decision;
release savepoint b6_source_grant_decision;
select pg_temp.assert_true(pg_temp.b6_state()=(select payload from b6_original_state),
 'G05 all denied calls preserve complete original state');

create function pg_temp.reject_b6_new_grant()
returns trigger language plpgsql as $test$
begin
 if new.auth_user_id='1f60b2cc-8028-453e-a6de-9312aa5a67cb' then
  raise exception using errcode='P0066',message='injected_general_access_grant_failure';
 end if;
 return new;
end;
$test$;
create trigger b6_synthetic_grant_failure after insert on public.access_grants
 for each row execute function pg_temp.reject_b6_new_grant();
select pg_temp.expect_error('select pg_temp.b6_call()','P0066','injected_general_access_grant_failure');
select pg_temp.assert_true(pg_temp.b6_state()=(select payload from b6_original_state),
 'G06 late grant insertion failure rolls back decision, grants and account together');
drop trigger b6_synthetic_grant_failure on public.access_grants;

create temporary table b6_new_decision as select pg_temp.b6_call() id;
select pg_temp.assert_true(
 (select perfis=array['ADMINISTRATIVO','AUDITOR_SEGURANCA','AUDITOR_QUALIDADE','ENGENHARIA']
  and perfil='ADMINISTRATIVO' and atuacao_engenharia='COORDENACAO'
  and atuacoes_engenharia=array['EQUIPE_OBRA','COORDENACAO'] and ativo
  from public.access_accounts where auth_user_id='1f60b2cc-8028-453e-a6de-9312aa5a67cb')
 and (select count(*)=84 and count(distinct obra_id)=21 from public.access_grants
  where auth_user_id='1f60b2cc-8028-453e-a6de-9312aa5a67cb')
 and not exists((select perfil,obra_id,modulo from public.access_grants where auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610')
  except (select perfil,obra_id,modulo from public.access_grants where auth_user_id='1f60b2cc-8028-453e-a6de-9312aa5a67cb')),
 'G07 success gives exactly 84 matching grants, 21 reviewed works and both Engineering activities');
select pg_temp.assert_true(
 (select count(*)=5 from public.access_decisions)
 and (select count(*)=1 from public.access_decisions d join b6_new_decision n using(id)
  where d.auth_user_id='1f60b2cc-8028-453e-a6de-9312aa5a67cb' and decision_type='AJUSTE_ACESSOS_GERAIS'
  and actor_auth_user_id is null and actor_database_role='postgres'
  and actor_snapshot->>'database_session_user'='postgres'
  and atuacao_engenharia='COORDENACAO' and atuacoes_engenharia=array['EQUIPE_OBRA','COORDENACAO']
  and request_snapshot=(select payload from b6_original_requests where auth_user_id=d.auth_user_id)
  and before_access_snapshot->'account'=(select payload from b6_original_accounts where auth_user_id=d.auth_user_id)
  and before_access_snapshot->'grants'=(select jsonb_agg(payload order by perfil,obra_id,modulo)
    from b6_original_grants where auth_user_id=d.auth_user_id)
  and jsonb_array_length(grants_snapshot)=84)
 and (select count(*)=81 and bool_and(g.granted_by is null and g.granted_at=d.decided_at)
  from public.access_grants g join public.access_decisions d on d.id=g.decision_id
  join b6_new_decision n on n.id=d.id
  where g.auth_user_id='1f60b2cc-8028-453e-a6de-9312aa5a67cb'),
 'G08 one operator decision records original state and exactly 81 newly attributed grants');
select pg_temp.assert_true(
 (select count(*)=87 from b6_original_grants o join public.access_grants g using(auth_user_id,perfil,obra_id,modulo)
  where to_jsonb(g)=o.payload)
 and (select count(*)=4 from b6_original_decisions o join public.access_decisions d using(id) where to_jsonb(d)=o.payload)
 and (select count(*)=3 from b6_original_auth o join auth.users u using(id) where to_jsonb(u)=o.payload)
 and (select count(*)=3 from b6_original_requests o join public.access_requests r using(auth_user_id) where to_jsonb(r)=o.payload)
 and (select count(*)=22 from b6_original_works o join public.access_works w using(id) where to_jsonb(w)=o.payload)
 and not exists(select 1 from public.access_work_changes)
 and (select count(*)=2 from b6_original_accounts o join public.access_accounts a using(auth_user_id)
  where case when a.auth_user_id='1f60b2cc-8028-453e-a6de-9312aa5a67cb'
   then to_jsonb(a)-array['perfil','perfis','atuacao_engenharia','atuacoes_engenharia']
     =o.payload-array['perfil','perfis','atuacao_engenharia','atuacoes_engenharia']
   else to_jsonb(a)=o.payload end),
 'G09 original grants/approved_at/by/Auth/requests/works/history and reference account remain exact');

create temporary table b6_success_state as select pg_temp.b6_state() payload;
select pg_temp.expect_error('select pg_temp.b6_call()','55000');
select pg_temp.assert_true(pg_temp.b6_state()=(select payload from b6_success_state),
 'G10 repeated operator call is blocked without duplicating grants or history');
select pg_temp.expect_error($sql$update public.access_decisions set reason='Rewriting the operator decision must fail' where decision_type='AJUSTE_ACESSOS_GERAIS'$sql$,'55000','access_history_is_immutable');
select pg_temp.expect_error($sql$delete from public.access_decisions where decision_type='AJUSTE_ACESSOS_GERAIS'$sql$,'55000','access_history_is_immutable');

set local role authenticated;
set local "request.jwt.claim.sub"='1f60b2cc-8028-453e-a6de-9312aa5a67cb';
select pg_temp.assert_true(
 public.is_current_access_administrator()
 and (select count(*)=84 from public.access_grants where auth_user_id=auth.uid())
 and (select count(*)=1 from public.access_decisions where decision_type='AJUSTE_ACESSOS_GERAIS')
 and public.has_current_engineering_scope('COORDENACAO','d1a60000-0000-4000-8000-000000000121','SEGURANCA')
 and public.has_current_engineering_scope('EQUIPE_OBRA','d1a60000-0000-4000-8000-000000000121','QUALIDADE')
 and public.has_current_access_grant('AUDITOR_SEGURANCA','d1a60000-0000-4000-8000-000000000121','SEGURANCA')
 and public.has_current_access_grant('AUDITOR_QUALIDADE','d1a60000-0000-4000-8000-000000000121','QUALIDADE')
 and not public.has_current_access_grant('AUDITOR_SEGURANCA','d1a60000-0000-4000-8000-000000000121','QUALIDADE')
 and not public.has_current_engineering_scope('ROOT','d1a60000-0000-4000-8000-000000000121','SEGURANCA')
 and not public.has_current_engineering_scope('COORDENACAO','d1a60000-0000-4000-8000-000000000122','SEGURANCA')
 and not public.has_current_engineering_scope('EQUIPE_OBRA','d1a60000-0000-4000-8000-000000000122','QUALIDADE'),
 'G11 current RLS and scope predicates expose exactly authorized tuples and activities');
set local "request.jwt.claim.sub"='d1a60000-0000-4000-8000-000000000003';
select pg_temp.assert_true(
 not public.is_current_access_administrator()
 and (select count(*)=0 from public.access_accounts)
 and (select count(*)=0 from public.access_grants)
 and (select count(*)=0 from public.access_decisions)
 and not public.has_current_engineering_scope('COORDENACAO','d1a60000-0000-4000-8000-000000000121','SEGURANCA'),
 'G12 pending unrelated identity inherits neither authority nor history');
reset role;
savepoint b6_revoke_after_success;
update public.access_accounts set ativo=false where auth_user_id='1f60b2cc-8028-453e-a6de-9312aa5a67cb';
set local role authenticated;
set local "request.jwt.claim.sub"='1f60b2cc-8028-453e-a6de-9312aa5a67cb';
select pg_temp.assert_true(
 not public.is_current_access_administrator()
 and not public.has_current_engineering_scope('COORDENACAO','d1a60000-0000-4000-8000-000000000121','SEGURANCA')
 and not public.has_current_engineering_scope('EQUIPE_OBRA','d1a60000-0000-4000-8000-000000000121','QUALIDADE')
 and (select count(*)=0 from public.access_grants)
 and (select count(*)=0 from public.access_decisions),
 'G13 revocation immediately invalidates new activities, grants and history access');
reset role;
select pg_temp.expect_error('select pg_temp.b6_call()','55000');
rollback to savepoint b6_revoke_after_success;
release savepoint b6_revoke_after_success;
select pg_temp.assert_true(pg_temp.b6_state()=(select payload from b6_success_state),
 'G14 history stays closed after revocation and rejected post-success writes');
rollback;

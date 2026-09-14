-- B.3 isolated PostgreSQL upgrade/authorization tests. This file has TWO phases:
-- the runner executes phase one against B.2, applies the exact B.3 migration,
-- then executes phase two. Never run this against any hosted/project database.
-- All identities and works below are synthetic local fixtures. The bootstrap
-- target matches the procedure's pinned identity solely to exercise its guard.
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
 ('13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br',
  '{"nome":"SQL designated fixture","cargo_area_informado":"Declared engineering","obra_referencia_informada":"Declared reference"}',clock_timestamp()),
 ('d1a30000-0000-4000-8000-000000000002','fixture.b3.legacy@dialogo.com.br','{"nome":"SQL legacy engineering"}',clock_timestamp()),
 ('d1a30000-0000-4000-8000-000000000003','fixture.b3.pending@dialogo.com.br','{"nome":"SQL legacy pending"}',clock_timestamp());
select dialogo_private.bootstrap_first_administrator(
 '13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br','Local fixture initial authorization before upgrade');
-- Deterministic fixtures, independently named; no hosted work IDs are loaded.
insert into public.access_works(id,nome,created_by)
 select ('d1a30000-0000-4000-8000-'||lpad((100+i)::text,12,'0'))::uuid,
  'SQL isolated work '||lpad(i::text,2,'0'),'13044e3f-e8d2-4b4b-9981-22a8de22c610'::uuid
 from generate_series(1,21) i;
set local role authenticated;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select public.approve_access_request('d1a30000-0000-4000-8000-000000000002','ENGENHARIA','COORDENACAO',
 '[{"obra_id":"d1a30000-0000-4000-8000-000000000101","modulo":"SEGURANCA"},{"obra_id":"d1a30000-0000-4000-8000-000000000102","modulo":"QUALIDADE"}]',
 'SQL legacy approval preserves both independent work scopes');
reset role;
create temporary table b3_original_decisions as select id,to_jsonb(d)::text payload from public.access_decisions d;
create temporary table b3_original_requests as select auth_user_id,to_jsonb(r)::text payload from public.access_requests r;
create temporary table b3_original_accounts as select auth_user_id,to_jsonb(a) payload from public.access_accounts a;
create temporary table b3_original_grants as select auth_user_id,obra_id,modulo,to_jsonb(g) payload from public.access_grants g;
commit;

-- MIGRATION_UPGRADE_BOUNDARY

begin;
-- U01: every pre-existing history field has exactly its pre-upgrade JSON text
-- representation. Additive columns stay NULL; the migration does not rewrite
-- original snapshots, actor, reason, timestamps, IDs, or bootstrap marker.
select pg_temp.assert_true(
 (select count(*)=2 from public.access_decisions)
 and not exists(select 1 from b3_original_decisions o join public.access_decisions d using(id)
  where (to_jsonb(d)-'perfis'-'before_access_snapshot')::text is distinct from o.payload
   or d.perfis is not null or d.before_access_snapshot is not null)
 and not exists(select 1 from b3_original_requests o join public.access_requests r using(auth_user_id)
  where to_jsonb(r)::text is distinct from o.payload)
 and not exists(select 1 from b3_original_accounts o join public.access_accounts a using(auth_user_id)
  where (to_jsonb(a)-'perfis') is distinct from o.payload or a.perfis is distinct from array[a.perfil])
 and not exists(select 1 from b3_original_grants o join public.access_grants g using(auth_user_id,obra_id,modulo)
  where (to_jsonb(g)-'perfil'-'decision_id') is distinct from o.payload or g.perfil<>'ENGENHARIA'
   or not exists(select 1 from b3_original_decisions d where d.id=g.decision_id
    and (d.payload::jsonb)->>'auth_user_id'=g.auth_user_id::text))
 and (select count(*)=2 from public.access_grants),
 'U01 migration preserves legacy fields, snapshots, exact grants and pending requests');

-- U02: explicit ACLs survive permissive installation defaults; RLS still covers
-- every data table, old approval RPC is disabled, all API roles lack private RPC.
do $test$
declare t text; r text; p text;
begin
 foreach t in array array['access_requests','access_accounts','access_grants','access_works','access_decisions'] loop
  perform pg_temp.assert_true((select relrowsecurity from pg_class where oid=('public.'||t)::regclass),'U02 RLS '||t);
  foreach r in array array['anon','authenticated','service_role'] loop
   foreach p in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
    perform pg_temp.assert_true(not has_table_privilege(r,'public.'||t,p),'U02 no client '||p||' '||t||' '||r);
   end loop;
  end loop;
 end loop;
 foreach r in array array['anon','authenticated','service_role'] loop
  perform pg_temp.assert_true(to_regprocedure('public.approve_access_request(uuid,text,text,jsonb,text)') is null,
   'U02 old RPC removed '||r);
  perform pg_temp.assert_true(not has_function_privilege(r,
   'dialogo_private.configure_initial_account_profiles(uuid,text,uuid[],text)','EXECUTE'),'U02 initial adjustment denied '||r);
  perform pg_temp.assert_true(not has_schema_privilege(r,'dialogo_private','USAGE'),'U02 private schema denied '||r);
 end loop;
end;
$test$;

-- Exact initial adjustment is operator-only, requires the pinned identity,
-- and takes the explicitly reviewed set of all 21 currently active works.
select pg_temp.expect_error($sql$select dialogo_private.configure_initial_account_profiles(
 'd1a30000-0000-4000-8000-000000000002','emanuel.locchi@dialogo.com.br',
 (select array_agg(id order by id) from public.access_works),'Invalid designated fixture must fail')$sql$,'22023');
select pg_temp.expect_error($sql$select dialogo_private.configure_initial_account_profiles(
 '13044e3f-e8d2-4b4b-9981-22a8de22c610','wrong@dialogo.com.br',
 (select array_agg(id order by id) from public.access_works),'Invalid email fixture must fail')$sql$,'22023');
select pg_temp.expect_error($sql$select dialogo_private.configure_initial_account_profiles(
 '13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br',
 (select array_agg(id order by id) from public.access_works where id<>'d1a30000-0000-4000-8000-000000000121'),
 'Incomplete work selection must fail')$sql$,'22023');
select pg_temp.expect_error($sql$select dialogo_private.configure_initial_account_profiles(
 '13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br',
 array_fill('d1a30000-0000-4000-8000-000000000101'::uuid,array[21]),'Duplicate work selection must fail')$sql$,'22023');
update public.access_works set ativo=false where id='d1a30000-0000-4000-8000-000000000121';
select pg_temp.expect_error($sql$select dialogo_private.configure_initial_account_profiles(
 '13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br',
 (select array_agg(id order by id) from public.access_works),'Inactive work selection must fail')$sql$,'22023');
update public.access_works set ativo=true where id='d1a30000-0000-4000-8000-000000000121';

-- U03: inject failure in a late grant insertion AFTER the decision and account
-- updates. Adjustment must leave no account,
-- grants, or history changes and must not consume the one-time marker.
create function pg_temp.fail_initial_adjustment() returns trigger language plpgsql as $test$
begin
 if new.auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610'
  and new.perfil='ENGENHARIA' and new.modulo='QUALIDADE'
  and new.obra_id='d1a30000-0000-4000-8000-000000000121' then
  raise exception using errcode='P0098',message='injected_initial_adjustment_failure';
 end if;
 return new;
end;
$test$;
create trigger b3_fail_initial_adjustment before insert on public.access_grants
 for each row execute function pg_temp.fail_initial_adjustment();
select pg_temp.expect_error($sql$select dialogo_private.configure_initial_account_profiles(
 '13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br',
 (select array_agg(id order by id) from public.access_works),'SQL atomic adjustment failure fixture')$sql$,
 'P0098','injected_initial_adjustment_failure');
select pg_temp.assert_true(
 (select perfis=array['ADMINISTRATIVO'] from public.access_accounts where auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610')
 and not exists(select 1 from public.access_grants where auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610')
 and not exists(select 1 from public.access_decisions where decision_type='AJUSTE_PERFIS_INICIAL'),
 'U03 failed adjustment rolls back and leaves one-time marker available');
drop trigger b3_fail_initial_adjustment on public.access_grants;
select dialogo_private.configure_initial_account_profiles(
 '13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br',
 (select array_agg(id order by id) from public.access_works),'SQL explicit authorization: four profiles, coordination, 21 works');

select pg_temp.assert_true(
 (select cardinality(perfis)=4 and perfis @> array['ADMINISTRATIVO','AUDITOR_SEGURANCA','AUDITOR_QUALIDADE','ENGENHARIA']
  and atuacao_engenharia='COORDENACAO' and ativo from public.access_accounts
  where auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610')
 and (select count(*)=84 and count(distinct obra_id)=21 from public.access_grants
  where auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610')
 and (select count(*)=1 from public.access_decisions where decision_type='AJUSTE_PERFIS_INICIAL')
 and (select cardinality(perfis)=4 and actor_auth_user_id is null and actor_database_role='postgres'
  and jsonb_array_length(grants_snapshot)=84
  and before_access_snapshot->'account'->'perfis'='["ADMINISTRATIVO"]'::jsonb
  and before_access_snapshot->'grants'='[]'::jsonb
  from public.access_decisions where decision_type='AJUSTE_PERFIS_INICIAL')
 and not exists(select 1 from b3_original_decisions o join public.access_decisions d using(id)
  where (to_jsonb(d)-'perfis'-'before_access_snapshot')::text is distinct from o.payload)
 and not exists(select 1 from b3_original_requests o join public.access_requests r using(auth_user_id)
  where to_jsonb(r)::text is distinct from o.payload)
 and (select to_jsonb(a)->'approved_at'=o.payload->'approved_at' and a.approved_by is null
  from public.access_accounts a join b3_original_accounts o using(auth_user_id)
  where a.auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610'),
 'U04 adjustment preserves original approval and history, appends before/after decision and 84 role-scoped grants');
select pg_temp.expect_error($sql$select dialogo_private.configure_initial_account_profiles(
 '13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br',
 (select array_agg(id order by id) from public.access_works),'Repeat initial adjustment must fail')$sql$,'55000');

insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 ('d1a30000-0000-4000-8000-000000000004','fixture.b3.multiple@dialogo.com.br','{"nome":"SQL multiple admin"}',clock_timestamp()),
 ('d1a30000-0000-4000-8000-000000000005','fixture.b3.unconfirmed@dialogo.com.br',
  '{"nome":"SQL unconfirmed","perfis":["ADMINISTRATIVO"],"status_acesso":"APROVADO","email_confirmado":true}',null),
 ('d1a30000-0000-4000-8000-000000000006','fixture.b3.atomic@dialogo.com.br','{"nome":"SQL atomic approval"}',clock_timestamp()),
 ('d1a30000-0000-4000-8000-000000000007','fixture.b3.scopes@dialogo.com.br','{"nome":"SQL multiple technical"}',clock_timestamp());

set local role anon;
select pg_temp.assert_true(public.access_requests_schema_version()=1 and public.access_administration_schema_version()=2,
 'U05 signup remains compatible while administration advertises new protocol');
select pg_temp.expect_error('select * from public.access_accounts','42501');
select pg_temp.expect_error($sql$select public.approve_access_request_v2(
 'd1a30000-0000-4000-8000-000000000004',array['ADMINISTRATIVO'],null,'[]','Anonymous may not approve')$sql$,'42501');
select pg_temp.expect_error($sql$select dialogo_private.configure_initial_account_profiles(
 '13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br',array[]::uuid[],'Anonymous adjustment forbidden')$sql$,'42501');
reset role;
set local role service_role;
select pg_temp.expect_error($sql$select dialogo_private.configure_initial_account_profiles(
 '13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br',array[]::uuid[],'Service API adjustment forbidden')$sql$,'42501');
select pg_temp.expect_error($sql$update public.access_accounts set perfis=array['ADMINISTRATIVO']$sql$,'42501');
reset role;

set local role authenticated;
set local "request.jwt.claim.sub"='d1a30000-0000-4000-8000-000000000005';
set local "request.jwt.claims"='{"sub":"d1a30000-0000-4000-8000-000000000005","role":"authenticated","app_metadata":{"perfis":["ADMINISTRATIVO","AUDITOR_SEGURANCA"]},"user_metadata":{"email_confirmado":true}}';
select pg_temp.assert_true(not public.is_current_access_active() and not public.is_current_access_administrator()
 and not public.has_current_access_grant('AUDITOR_SEGURANCA','d1a30000-0000-4000-8000-000000000101','SEGURANCA')
 and (select count(*)=1 from public.access_requests)
 and not exists(select 1 from public.access_accounts) and not exists(select 1 from public.access_grants)
 and not exists(select 1 from public.access_works) and not exists(select 1 from public.access_decisions),
 'U06 forged metadata never creates approved roles or bypasses RLS');
select pg_temp.expect_error($sql$update public.access_requests set status_acesso='APROVADO'$sql$,'42501');
select pg_temp.expect_error($sql$update public.access_accounts set perfis=array['ADMINISTRATIVO']$sql$,'42501');
select pg_temp.expect_error($sql$delete from public.access_grants$sql$,'42501');
select pg_temp.expect_error($sql$select public.approve_access_request_v2(
 'd1a30000-0000-4000-8000-000000000004',array['ADMINISTRATIVO'],null,'[]','Pending users may not approve')$sql$,'42501');
select pg_temp.expect_error($sql$select dialogo_private.configure_initial_account_profiles(
 '13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br',array[]::uuid[],'Client adjustment forbidden')$sql$,'42501');

set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
set local "request.jwt.claims"='{"sub":"13044e3f-e8d2-4b4b-9981-22a8de22c610","role":"authenticated"}';
select pg_temp.assert_true(public.is_current_access_administrator(), 'U07 initial multiple-profile user remains administrator');
select pg_temp.expect_error($sql$select public.approve_access_request(
 'd1a30000-0000-4000-8000-000000000004','ADMINISTRATIVO',null,'[]','Legacy RPC may not approve anymore')$sql$,'42883');
select pg_temp.expect_error($sql$select public.approve_access_request_v2(
 '13044e3f-e8d2-4b4b-9981-22a8de22c610',array['ADMINISTRATIVO'],null,'[]','Self approval remains forbidden')$sql$,'42501');
select pg_temp.expect_error($sql$select public.approve_access_request_v2(
 'd1a30000-0000-4000-8000-000000000005',array['ADMINISTRATIVO'],null,'[]','Unconfirmed target remains forbidden')$sql$,'22023');

-- U08: reject malformed role arrays, engineering scopes and every type of
-- incoherent tuple. Each technical role requires explicit scope of its own.
do $test$
declare bad_profiles text[]; bad_grants jsonb; target uuid:='d1a30000-0000-4000-8000-000000000004';
begin
 foreach bad_profiles slice 1 in array array[array['ADMINISTRATIVO','ADMINISTRATIVO'],array['SUPERADMIN','ENGENHARIA'],array['ADMINISTRATIVO',null]] loop
  perform pg_temp.expect_error(format('select public.approve_access_request_v2(%L,%L::text[],null,%L::jsonb,%L)',
   target,bad_profiles,'[]','Invalid profile array fixture'),'22023');
 end loop;
 perform pg_temp.expect_error(format('select public.approve_access_request_v2(%L,array[]::text[],null,%L::jsonb,%L)',
  target,'[]','Empty profiles must fail'),'22023');
 perform pg_temp.expect_error(format('select public.approve_access_request_v2(%L,null,null,%L::jsonb,%L)',
  target,'[]','Null profiles must fail'),'22023');
 perform pg_temp.expect_error(format('select public.approve_access_request_v2(%L,array[%L],null,%L::jsonb,%L)',
  target,'ENGENHARIA','[]','Engineering subtype required'),'22023');
 perform pg_temp.expect_error(format('select public.approve_access_request_v2(%L,array[%L],%L,%L::jsonb,%L)',
  target,'ADMINISTRATIVO','COORDENACAO','[]','Engineering subtype requires engineering role'),'22023');
 perform pg_temp.expect_error(format('select public.approve_access_request_v2(%L,array[%L],null,%L::jsonb,%L)',
  target,'AUDITOR_SEGURANCA','[]','Technical scope must not be empty'),'22023');
 foreach bad_grants in array array[
  '{}'::jsonb,'null'::jsonb,'[null]'::jsonb,'["text"]'::jsonb,'[{}]'::jsonb,
  '[{"perfil":"AUDITOR_SEGURANCA","obra_id":"bad","modulo":"SEGURANCA"}]'::jsonb,
  '[{"perfil":"AUDITOR_SEGURANCA","obra_id":"d1a30000-0000-4000-8000-000000000101","modulo":"SEGURANCA","actor":"forged"}]'::jsonb,
  '[{"perfil":"AUDITOR_SEGURANCA","obra_id":"d1a30000-0000-4000-8000-000000000101","modulo":"QUALIDADE"}]'::jsonb,
  '[{"perfil":"ENGENHARIA","obra_id":"d1a30000-0000-4000-8000-000000000101","modulo":"SEGURANCA"}]'::jsonb,
  '[{"perfil":"ADMINISTRATIVO","obra_id":"d1a30000-0000-4000-8000-000000000101","modulo":"SEGURANCA"}]'::jsonb,
  '[{"perfil":"AUDITOR_SEGURANCA","obra_id":"d1a30000-0000-4000-8000-000000000999","modulo":"SEGURANCA"}]'::jsonb,
  '[{"perfil":"AUDITOR_SEGURANCA","obra_id":"d1a30000-0000-4000-8000-000000000101","modulo":"ALL"}]'::jsonb,
  '[{"perfil":"AUDITOR_SEGURANCA","obra_id":"d1a30000-0000-4000-8000-000000000101","modulo":"SEGURANCA"},{"perfil":"AUDITOR_SEGURANCA","obra_id":"d1a30000-0000-4000-8000-000000000101","modulo":"SEGURANCA"}]'::jsonb
 ] loop
  perform pg_temp.expect_error(format('select public.approve_access_request_v2(%L,array[%L,%L],null,%L::jsonb,%L)',
   target,'ADMINISTRATIVO','AUDITOR_SEGURANCA',bad_grants,'Invalid exact role scope fixture'),'22023');
 end loop;
 perform pg_temp.expect_error(format('select public.approve_access_request_v2(%L,array[%L,%L],%L,%L::jsonb,%L)',
  target,'AUDITOR_SEGURANCA','ENGENHARIA','COORDENACAO',
  '[{"perfil":"AUDITOR_SEGURANCA","obra_id":"d1a30000-0000-4000-8000-000000000101","modulo":"SEGURANCA"}]',
  'Engineering needs its own explicit scope'),'22023');
end;
$test$;

select public.approve_access_request_v2('d1a30000-0000-4000-8000-000000000004',
 array['ENGENHARIA','ADMINISTRATIVO','AUDITOR_SEGURANCA'],'COORDENACAO',
 '[{"perfil":"AUDITOR_SEGURANCA","obra_id":"d1a30000-0000-4000-8000-000000000101","modulo":"SEGURANCA"},{"perfil":"ENGENHARIA","obra_id":"d1a30000-0000-4000-8000-000000000102","modulo":"QUALIDADE"}]',
 'SQL three-profile approval has distinct role and work scopes');
select public.approve_access_request_v2('d1a30000-0000-4000-8000-000000000007',
 array['AUDITOR_SEGURANCA','ENGENHARIA'],'EQUIPE_OBRA',
 '[{"perfil":"AUDITOR_SEGURANCA","obra_id":"d1a30000-0000-4000-8000-000000000101","modulo":"SEGURANCA"},{"perfil":"ENGENHARIA","obra_id":"d1a30000-0000-4000-8000-000000000102","modulo":"QUALIDADE"}]',
 'SQL multiple technical roles without administrative privileges');
select pg_temp.assert_true(
 (select count(*)=2 from public.access_grants where auth_user_id='d1a30000-0000-4000-8000-000000000004')
 and (select cardinality(perfis)=3 and request_snapshot->>'status_acesso'='PENDENTE_APROVACAO'
  and jsonb_array_length(grants_snapshot)=2 and grants_snapshot @> '[{"perfil":"AUDITOR_SEGURANCA","obra_nome":"SQL isolated work 01"}]'::jsonb
  and actor_auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610'::uuid
  from public.access_decisions where auth_user_id='d1a30000-0000-4000-8000-000000000004'),
 'U09 approval stores exact scopes, verified actor and original request in history');
select pg_temp.expect_error($sql$select public.approve_access_request_v2(
 'd1a30000-0000-4000-8000-000000000004',array['ADMINISTRATIVO'],null,'[]','Duplicate approval cannot overwrite current scope')$sql$,'22023');

set local "request.jwt.claim.sub"='d1a30000-0000-4000-8000-000000000007';
select pg_temp.assert_true(public.is_current_access_active() and not public.is_current_access_administrator()
 and public.has_current_access_grant('AUDITOR_SEGURANCA','d1a30000-0000-4000-8000-000000000101','SEGURANCA')
 and public.has_current_access_grant('ENGENHARIA','d1a30000-0000-4000-8000-000000000102','QUALIDADE')
 and not public.has_current_access_grant('ENGENHARIA','d1a30000-0000-4000-8000-000000000101','SEGURANCA')
 and not public.has_current_access_grant('AUDITOR_SEGURANCA','d1a30000-0000-4000-8000-000000000102','QUALIDADE')
 and not public.has_current_access_grant('AUDITOR_SEGURANCA','d1a30000-0000-4000-8000-000000000102','SEGURANCA')
 and not public.has_current_access_grant('AUDITOR_QUALIDADE','d1a30000-0000-4000-8000-000000000102','QUALIDADE')
 and not public.has_current_access_grant('ADMINISTRATIVO','d1a30000-0000-4000-8000-000000000101','SEGURANCA')
 and not public.has_current_access_grant(null,null,null)
 and (select count(*)=1 from public.access_accounts) and (select count(*)=2 from public.access_grants)
 and (select count(*)=2 from public.access_works) and not exists(select 1 from public.access_decisions),
 'U10 role/work/module permission checker never infers crossed scopes; nonadmin RLS stays own-only');
select pg_temp.expect_error($sql$select public.create_access_work('Technical user cannot create work')$sql$,'42501');

-- U11: role array enables administrative behavior on a combined account.
set local "request.jwt.claim.sub"='d1a30000-0000-4000-8000-000000000004';
select pg_temp.assert_true(public.is_current_access_administrator()
 and not public.has_current_access_grant('ENGENHARIA','d1a30000-0000-4000-8000-000000000101','SEGURANCA'),
 'U11 combined admin works without widening technical scopes');
select public.approve_access_request_v2('d1a30000-0000-4000-8000-000000000003',
 array['ADMINISTRATIVO'],null,'[]','SQL combined administrator approves a future administrator');
set local "request.jwt.claim.sub"='d1a30000-0000-4000-8000-000000000003';
select pg_temp.assert_true(public.is_current_access_administrator()
 and not public.has_current_access_grant('AUDITOR_SEGURANCA','d1a30000-0000-4000-8000-000000000101','SEGURANCA')
 and not public.has_current_access_grant('ENGENHARIA','d1a30000-0000-4000-8000-000000000101','SEGURANCA'),
 'U11 admin-only grants no technical authority implicitly');

-- U12: final approval update failure rolls back roles, scopes and decision.
reset role;
create function pg_temp.fail_b3_approval() returns trigger language plpgsql as $test$
begin
 if new.auth_user_id='d1a30000-0000-4000-8000-000000000006' then
  raise exception using errcode='P0099',message='injected_final_approval_failure';
 end if;
 return new;
end;
$test$;
create trigger b3_fail_approval before update on public.access_requests
 for each row execute function pg_temp.fail_b3_approval();
set local role authenticated;
select pg_temp.expect_error($sql$select public.approve_access_request_v2(
 'd1a30000-0000-4000-8000-000000000006',array['ADMINISTRATIVO','AUDITOR_SEGURANCA'],null,
 '[{"perfil":"AUDITOR_SEGURANCA","obra_id":"d1a30000-0000-4000-8000-000000000101","modulo":"SEGURANCA"}]',
 'Atomic failure must roll back all approval writes')$sql$,'P0099','injected_final_approval_failure');
select pg_temp.assert_true(not exists(select 1 from public.access_accounts where auth_user_id='d1a30000-0000-4000-8000-000000000006')
 and not exists(select 1 from public.access_grants where auth_user_id='d1a30000-0000-4000-8000-000000000006')
 and not exists(select 1 from public.access_decisions where auth_user_id='d1a30000-0000-4000-8000-000000000006')
 and (select status_acesso='PENDENTE_APROVACAO' from public.access_requests where auth_user_id='d1a30000-0000-4000-8000-000000000006'),
 'U12 approval failure rolls back every write');
reset role;
drop trigger b3_fail_approval on public.access_requests;

-- U13: data changes, not stale JWT metadata, determine current authority.
update public.access_works set ativo=false where id='d1a30000-0000-4000-8000-000000000101';
set local role authenticated;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select pg_temp.assert_true(public.is_current_access_administrator()
 and not public.has_current_access_grant('AUDITOR_SEGURANCA','d1a30000-0000-4000-8000-000000000101','SEGURANCA')
 and not exists(select 1 from public.access_grants where auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610'
  and obra_id='d1a30000-0000-4000-8000-000000000101'),
 'U13 administrator own grants also exclude inactive work');
set local "request.jwt.claim.sub"='d1a30000-0000-4000-8000-000000000007';
select pg_temp.assert_true(not public.has_current_access_grant('AUDITOR_SEGURANCA','d1a30000-0000-4000-8000-000000000101','SEGURANCA'),
 'U13 inactive work immediately disables exact grant');
reset role;
update auth.users set banned_until=clock_timestamp()+interval '1 day' where id='d1a30000-0000-4000-8000-000000000007';
set local role authenticated;
select pg_temp.assert_true(not public.is_current_access_active()
 and not public.has_current_access_grant('ENGENHARIA','d1a30000-0000-4000-8000-000000000102','QUALIDADE'),
 'U13 banned technical account loses active grants');
reset role;
update public.access_accounts set ativo=false where auth_user_id='d1a30000-0000-4000-8000-000000000004';
set local role authenticated;
set local "request.jwt.claim.sub"='d1a30000-0000-4000-8000-000000000004';
select pg_temp.assert_true(not public.is_current_access_administrator(), 'U13 inactive combined admin loses authority');
select pg_temp.expect_error($sql$select public.approve_access_request_v2(
 'd1a30000-0000-4000-8000-000000000006',array['ADMINISTRATIVO'],null,'[]','Inactive administrator cannot approve')$sql$,'42501');
reset role;

-- U14: immutable history and permanent one-time marker survive revocation.
select pg_temp.expect_error($sql$update public.access_accounts set perfis=array[]::text[]
 where auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610'$sql$,'23514');
select pg_temp.expect_error($sql$update public.access_accounts set perfis=array['ADMINISTRATIVO','ADMINISTRATIVO'],atuacao_engenharia=null
 where auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610'$sql$,'23514');
select pg_temp.expect_error($sql$update public.access_decisions set reason='Rewriting historical decisions is forbidden'$sql$,'55000');
select pg_temp.expect_error('delete from public.access_decisions','55000');
select pg_temp.expect_error('truncate public.access_decisions','0A000');
select pg_temp.expect_error('truncate public.access_decisions cascade','55000');
update public.access_accounts set ativo=false where auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select pg_temp.expect_error($sql$select dialogo_private.configure_initial_account_profiles(
 '13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br',
 (select array_agg(id order by id) from public.access_works),'Revocation never reopens initial adjustment')$sql$,'55000');
select pg_temp.assert_true((select count(*)=1 from public.access_decisions where decision_type='AJUSTE_PERFIS_INICIAL')
 and (select count(*)=1 from public.access_decisions where decision_type='BOOTSTRAP'),
 'U14 historical markers remain unique after repeated attempts and account revocation');

-- Defense in depth: even an accidentally granted API EXECUTE privilege must
-- fail inside the SECURITY DEFINER function for each API role.
grant usage on schema dialogo_private to anon,authenticated,service_role;
grant execute on function dialogo_private.configure_initial_account_profiles(uuid,text,uuid[],text)
 to anon,authenticated,service_role;
set local role anon;
select pg_temp.expect_error($sql$select dialogo_private.configure_initial_account_profiles(
 '13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br',array[]::uuid[],'Forged API definer identity blocked')$sql$,
 '42501','database_administrator_session_required');
reset role;
set local role authenticated;
select pg_temp.expect_error($sql$select dialogo_private.configure_initial_account_profiles(
 '13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br',array[]::uuid[],'Forged API definer identity blocked')$sql$,
 '42501','database_administrator_session_required');
reset role;
set local role service_role;
select pg_temp.expect_error($sql$select dialogo_private.configure_initial_account_profiles(
 '13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br',array[]::uuid[],'Forged service definer identity blocked')$sql$,
 '42501','database_administrator_session_required');
reset role;
rollback;
-- Pre-upgrade committed fixtures live only in this disposable in-memory DB.
-- The runner closes/discards it; no real account or external project is used.

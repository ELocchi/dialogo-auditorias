-- Isolated synthetic PostgreSQL regression. NEVER run on a hosted database.
begin;
do $test$ begin
  if current_setting('dialogo.test_database',true) is distinct from 'isolated-local'
    or session_user<>'postgres' or exists(select 1 from auth.users) then
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
    get stacked diagnostics received=returned_sqlstate;
    if received=expected_code then return; end if;
    raise exception 'Expected SQLSTATE %, got %: %',expected_code,received,sqlerrm;
  end;
  raise exception 'Expected SQLSTATE %, statement succeeded: %',expected_code,statement;
end $test$;
create function pg_temp.id(n integer) returns uuid language sql immutable as $test$
  select ('d1b70000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
$test$;

insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 ('13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br','{"nome":"Administration fixture"}',clock_timestamp());
select dialogo_private.bootstrap_first_administrator('13044e3f-e8d2-4b4b-9981-22a8de22c610',
 'emanuel.locchi@dialogo.com.br','Isolated paged administration bootstrap');
update public.access_accounts set atuacao_administrativa='GERAL'
 where auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610';
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';

insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at)
 select pg_temp.id(n),'administration.' || n || '@dialogo.com.br',jsonb_build_object('nome','Fixture ' || n),
   case when n=141 then null else '2026-01-01'::timestamptz end
 from generate_series(2,145) n where n<=42 or n>=101;
update public.access_requests set status_acesso='APROVADO' where auth_user_id in (select pg_temp.id(n) from generate_series(2,42) n);
update public.access_requests set created_at='2026-01-01'::timestamptz+interval '1 minute'*(right(auth_user_id::text,3)::integer/2)
 where auth_user_id in (select pg_temp.id(n) from generate_series(101,145) n);
update auth.users set banned_until=statement_timestamp()+interval '1 day' where id=pg_temp.id(142);
update auth.users set deleted_at=statement_timestamp() where id=pg_temp.id(143);
update public.access_requests set email='mismatch@dialogo.com.br' where auth_user_id=pg_temp.id(144);
update public.access_requests set email_confirmado_em=null where auth_user_id=pg_temp.id(145);

insert into public.access_accounts(auth_user_id,perfil,perfis,atuacao_administrativa,ativo,approved_at,approved_by)
 select pg_temp.id(n),case when n in (2,3) then 'ADMINISTRATIVO' else 'AUDITOR_QUALIDADE' end,
   case when n in (2,3) then array['ADMINISTRATIVO','AUDITOR_QUALIDADE'] else array['AUDITOR_QUALIDADE'] end,
   case when n=2 then 'QUALIDADE' when n=3 then 'SEGURANCA' else null end,
   n<>40,'2026-01-01'::timestamptz+interval '1 minute'*(n/2),auth.uid()
 from generate_series(2,42) n;
insert into public.access_works(id,nome,created_by,ativo)
 select pg_temp.id(n),'Paged work ' || n,auth.uid(),n<>2002 from generate_series(1001,2002) n;

-- Legacy approval fields remain NULL and historical grant profiles may be absent.
insert into public.access_decisions(id,auth_user_id,decision_type,perfil,request_snapshot,
 grants_snapshot,reason,actor_auth_user_id,actor_snapshot,decided_at)
 select pg_temp.id(10000+n),pg_temp.id(n),'APROVACAO',
   case when n in (2,3) then 'ADMINISTRATIVO' else 'AUDITOR_QUALIDADE' end,
   jsonb_build_object('nome','Fixture ' || n,'email','administration.' || n || '@dialogo.com.br'),
   jsonb_build_array(jsonb_build_object('obra_id',pg_temp.id(1001),'modulo','QUALIDADE','obra_nome','Original work name')),
   'Synthetic original approval',auth.uid(),jsonb_build_object('nome','Administration fixture'),
   '2026-02-01'::timestamptz+interval '1 minute'*(n/2)
 from generate_series(2,40) n;
insert into dialogo_private.administrative_scope_decisions(decision_id,auth_user_id,atuacao_administrativa)
 values(pg_temp.id(10002),pg_temp.id(2),'QUALIDADE'),(pg_temp.id(10003),pg_temp.id(3),'SEGURANCA');

-- A selected account may have more than one PostgREST page of immutable history.
insert into public.access_decisions(id,auth_user_id,decision_type,perfil,perfis,request_snapshot,
 grants_snapshot,before_access_snapshot,reason,actor_auth_user_id,actor_snapshot,decided_at)
 select pg_temp.id(20000+n),pg_temp.id(2),'EDICAO_USUARIO','ADMINISTRATIVO',array['ADMINISTRATIVO','AUDITOR_QUALIDADE'],
   '{"nome":"Fixture 2","email":"administration.2@dialogo.com.br","access_edit":{"ativo":true,"perfis":["ADMINISTRATIVO","AUDITOR_QUALIDADE"],"atuacoes_engenharia":[],"atuacao_administrativa":"QUALIDADE"}}',
   '[]','{"account":{"perfil":"ADMINISTRATIVO","perfis":["ADMINISTRATIVO","AUDITOR_QUALIDADE"],"ativo":true,"atuacao_engenharia":null},"grants":[]}',
   'Synthetic history change',auth.uid(),'{"nome":"Administration fixture"}',
   '2099-01-01'::timestamptz+interval '1 second'*(n/2)
 from generate_series(1,1001) n;
insert into dialogo_private.administrative_scope_decisions(decision_id,auth_user_id,atuacao_administrativa)
 select pg_temp.id(20000+n),pg_temp.id(2),'QUALIDADE' from generate_series(1,1001) n;
insert into public.access_grants(auth_user_id,perfil,obra_id,modulo,granted_at,granted_by,decision_id)
 select pg_temp.id(2),'AUDITOR_QUALIDADE',pg_temp.id(n),'QUALIDADE',statement_timestamp(),auth.uid(),pg_temp.id(10002)
 from generate_series(1001,2002) n;

-- Inactive works are filtered only for the current actor's own grants by RLS.
update public.access_accounts set perfil='ADMINISTRATIVO',perfis=array['ADMINISTRATIVO','AUDITOR_QUALIDADE'] where auth_user_id=auth.uid();
insert into public.access_grants(auth_user_id,perfil,obra_id,modulo,granted_at,granted_by,decision_id)
 select auth.uid(),'AUDITOR_QUALIDADE',pg_temp.id(n),'QUALIDADE',statement_timestamp(),auth.uid(),d.id
 from generate_series(2001,2002) n cross join public.access_decisions d where d.decision_type='BOOTSTRAP';

create function pg_temp.legacy_works() returns jsonb language sql stable as $test$
 select coalesce(jsonb_agg(to_jsonb(w) order by w.nome,w.id),'[]'::jsonb)
 from (select id,nome,ativo from public.access_works where ativo) w;
$test$;
create function pg_temp.legacy_history_page(p_page integer) returns jsonb language sql stable as $test$
 with scopes as materialized (select public.read_administrative_scope_history() as data),
 selected as (
   select a.*, (select max(d.decided_at) from public.access_decisions d where d.auth_user_id=a.auth_user_id) as latest
   from public.access_accounts a
   order by latest desc nulls last,a.approved_at desc,a.auth_user_id limit 20 offset (p_page-1)*20
 )
 select coalesce(jsonb_agg(jsonb_build_object(
   'account',to_jsonb(a)-'perfil'-'approved_at'-'approved_by'-'latest',
   'decisions',coalesce((select jsonb_agg(to_jsonb(d)||jsonb_build_object('atuacao_administrativa',s.data->d.id::text)
      order by d.decided_at desc,d.id desc)
      from public.access_decisions d cross join scopes s where d.auth_user_id=a.auth_user_id),'[]'::jsonb),
   'grants',coalesce((select jsonb_agg(to_jsonb(g)-'granted_at'-'granted_by'-'decision_id'
      order by g.perfil,g.obra_id,g.modulo) from public.access_grants g where g.auth_user_id=a.auth_user_id),'[]'::jsonb))
   order by a.latest desc nulls last,a.approved_at desc,a.auth_user_id),'[]'::jsonb) from selected a;
$test$;
create function pg_temp.assert_denied() returns void language plpgsql as $test$
begin
  perform pg_temp.expect_error($sql$select public.read_access_administration_page('summary')$sql$,'42501');
  perform pg_temp.expect_error($sql$select public.read_access_administration_page('pending')$sql$,'42501');
  perform pg_temp.expect_error($sql$select public.read_access_administration_page('history')$sql$,'42501');
end $test$;

select pg_temp.assert_true((select provolatile='s' and prosecdef and proconfig @> array['search_path=""']
 from pg_proc where oid='public.read_access_administration_page(text,integer)'::regprocedure),
 'Reader is STABLE SECURITY DEFINER with empty search path');
select pg_temp.assert_true(has_function_privilege('authenticated','public.read_access_administration_page(text,integer)','execute')
 and not has_function_privilege('anon','public.read_access_administration_page(text,integer)','execute')
 and not has_function_privilege('service_role','public.read_access_administration_page(text,integer)','execute'),
 'Only authenticated callers can execute this reader');

set local role authenticated;
select pg_temp.assert_true(public.read_access_administration_page('summary')=jsonb_build_object(
 'view','summary','pendingCount',(select count(*) from public.access_requests where status_acesso='PENDENTE_APROVACAO' and email_confirmado_em is not null),
 'activeCount',(select count(*) from public.access_accounts where ativo))
 and public.read_access_administration_page('summary')='{"view":"summary","pendingCount":40,"activeCount":41}'::jsonb,
 'Summary contains only both count projections and matches actual prior RLS reads');
select pg_temp.assert_true(public.read_access_administration_page('pending',1)->'works'=pg_temp.legacy_works()
 and jsonb_array_length(public.read_access_administration_page('pending',1)->'works')=1001,
 'All active works remain available beyond the former 1000-row limit');
select pg_temp.assert_true(public.read_access_administration_page('pending',1)->'requests'=(
 select jsonb_agg(to_jsonb(r) order by created_at,auth_user_id) from (
 select auth_user_id,nome,email,cargo_area_informado,obra_referencia_informada,email_confirmado_em,created_at
 from public.access_requests where status_acesso='PENDENTE_APROVACAO' and email_confirmado_em is not null
 order by created_at,auth_user_id limit 20) r),
 'Pending page is identical to the prior confirmed and currently eligible RLS rows');
select pg_temp.assert_true((public.read_access_administration_page('pending',2)->>'total')::integer=40
 and jsonb_array_length(public.read_access_administration_page('pending',1)->'requests')=20
 and jsonb_array_length(public.read_access_administration_page('pending',2)->'requests')=20
 and not exists(select 1 from jsonb_array_elements(public.read_access_administration_page('pending',1)->'requests') a
 join jsonb_array_elements(public.read_access_administration_page('pending',2)->'requests') b on a->>'auth_user_id'=b->>'auth_user_id'),
 'Pending pages have stable date/UUID ordering, exact totals and no overlap');
select pg_temp.assert_true(public.read_access_administration_page('pending',999999)->'requests'='[]'::jsonb
 and public.read_access_administration_page('history',999999)->'users'='[]'::jsonb,
 'Valid out-of-range pages return empty arrays without clamping or overflow');

select pg_temp.assert_true(public.read_access_administration_page('history',n)->'users'=pg_temp.legacy_history_page(n)
 and public.read_access_administration_page('history',n)->'works'=pg_temp.legacy_works()
 and (public.read_access_administration_page('history',n)->>'total')::integer=42,
 'History page ' || n || ' matches all existing RLS data and complete immutable snapshots') from generate_series(1,3) n;
select pg_temp.assert_true((select count(*)=42 and count(distinct u->'account'->>'auth_user_id')=42
 from generate_series(1,3) n cross join lateral jsonb_array_elements(public.read_access_administration_page('history',n)->'users') u),
 'All accounts occur exactly once across pages, including inactive accounts');
select pg_temp.assert_true(public.read_access_administration_page('history',1)->'users'->0->'account'->>'auth_user_id'=pg_temp.id(2)::text
 and jsonb_array_length(public.read_access_administration_page('history',1)->'users'->0->'decisions')=1002
 and jsonb_array_length(public.read_access_administration_page('history',1)->'users'->0->'grants')=1002
 and public.read_access_administration_page('history',1)->'users'->0->'decisions'->1001->'perfis'='null'::jsonb
 and public.read_access_administration_page('history',1)->'users'->0->'decisions'->1001->'atuacoes_engenharia'='null'::jsonb
 and public.read_access_administration_page('history',1)->'users'->0->'decisions'->1001->>'atuacao_administrativa'='QUALIDADE'
 and not (public.read_access_administration_page('history',1)->'users'->0->'decisions'->1001->'grants_snapshot'->0 ? 'perfil'),
 'Selected account keeps >1000 decisions and grants, inactive work grants, exact legacy nulls and scope history');
select pg_temp.assert_true(jsonb_array_length(public.read_access_administration_page('history',3)->'users')=2
 and public.read_access_administration_page('history',3)->'users'->0->'decisions'='[]'::jsonb
 and public.read_access_administration_page('history',3)->'users'->1->'decisions'='[]'::jsonb
 and public.read_access_administration_page('history',3)->'users'->0->'account'->>'auth_user_id'=pg_temp.id(42)::text,
 'Accounts without decisions remain visible, last by approval date and UUID');
select pg_temp.assert_true(exists(select 1 from jsonb_array_elements(public.read_access_administration_page('history',1)->'users') u
 where u->'account'->>'auth_user_id'=pg_temp.id(40)::text and u->'account'->>'ativo'='false'),
 'Inactive account remains editable in administration history');
select pg_temp.assert_true((select jsonb_array_length(u->'grants')=1 from jsonb_array_elements(public.read_access_administration_page('history',1)->'users') u
 where u->'account'->>'auth_user_id'=auth.uid()::text),'Own administrator grants preserve the active-work RLS filter');

-- Synthetic transferred-data evidence; this measures JSON bytes, not latency.
with payload as materialized (
 select pg_temp.legacy_history_page(1)||pg_temp.legacy_history_page(2)||pg_temp.legacy_history_page(3) as all_users,
   public.read_access_administration_page('history',2) as page
)
select jsonb_build_object('accountsBefore',jsonb_array_length(all_users),'accountsAfter',jsonb_array_length(page->'users'),
 'decisionsBefore',(select sum(jsonb_array_length(u->'decisions')) from jsonb_array_elements(all_users) u),
 'decisionsAfter',(select sum(jsonb_array_length(u->'decisions')) from jsonb_array_elements(page->'users') u),
 'historyAndWorksBytesBefore',octet_length(jsonb_build_object('users',all_users,'works',pg_temp.legacy_works())::text),
 'historyAndWorksBytesAfter',octet_length((page-'view'-'page'-'pageSize'-'total')::text)) as administration_fixture_metrics
from payload;

select pg_temp.expect_error($sql$select public.read_access_administration_page(null)$sql$,'22023');
select pg_temp.expect_error($sql$select public.read_access_administration_page('all')$sql$,'22023');
select pg_temp.expect_error($sql$select public.read_access_administration_page('history',null)$sql$,'22023');
select pg_temp.expect_error($sql$select public.read_access_administration_page('history',0)$sql$,'22023');
select pg_temp.expect_error($sql$select public.read_access_administration_page('pending',-1)$sql$,'22023');
select pg_temp.expect_error($sql$select public.read_access_administration_page('summary',1000000)$sql$,'22023');

savepoint before_read_only;
set local transaction_read_only=on;
select pg_temp.assert_true(public.read_access_administration_page('summary')->>'pendingCount'='40'
 and jsonb_array_length(public.read_access_administration_page('pending')->'requests')=20
 and jsonb_array_length(public.read_access_administration_page('history')->'users')=20,
 'All views execute within an actual read-only transaction');
rollback to savepoint before_read_only;

set local "request.jwt.claim.sub"='d1b70000-0000-4000-8000-000000000002';
select pg_temp.assert_denied();
set local "request.jwt.claim.sub"='d1b70000-0000-4000-8000-000000000003';
select pg_temp.assert_denied();
set local "request.jwt.claim.sub"='d1b70000-0000-4000-8000-000000000004';
select pg_temp.assert_denied();
set local "request.jwt.claim.sub"='d1b70000-0000-4000-8000-000000000101';
select pg_temp.assert_denied();
set local "request.jwt.claim.sub"='';
select pg_temp.assert_denied();
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
reset role;
set local role anon;
select pg_temp.assert_denied();
reset role;
set local role service_role;
select pg_temp.assert_denied();
reset role;

-- Each revocation must take effect immediately, including after successful reads.
update public.access_accounts set ativo=false where auth_user_id=auth.uid();
set local role authenticated;
select pg_temp.assert_denied();
reset role;
update public.access_accounts set ativo=true,atuacao_administrativa='QUALIDADE' where auth_user_id=auth.uid();
set local role authenticated;
select pg_temp.assert_denied();
reset role;
update public.access_accounts set atuacao_administrativa=null,perfil='AUDITOR_QUALIDADE',perfis=array['AUDITOR_QUALIDADE'] where auth_user_id=auth.uid();
set local role authenticated;
select pg_temp.assert_denied();
reset role;
update public.access_accounts set atuacao_administrativa='GERAL',perfil='ADMINISTRATIVO',perfis=array['ADMINISTRATIVO','AUDITOR_QUALIDADE'] where auth_user_id=auth.uid();
update auth.users set banned_until=statement_timestamp()+interval '1 day' where id=auth.uid();
set local role authenticated;
select pg_temp.assert_denied();
reset role;
update auth.users set banned_until=statement_timestamp()-interval '1 day' where id=auth.uid();
set local role authenticated;
select pg_temp.assert_true(public.read_access_administration_page('summary')->>'activeCount'='41','Expired ban permits the currently valid administrator again');
reset role;
update auth.users set deleted_at=statement_timestamp() where id=auth.uid();
set local role authenticated;
select pg_temp.assert_denied();
reset role;
update auth.users set deleted_at=null,email_confirmed_at=null where id=auth.uid();
set local role authenticated;
select pg_temp.assert_denied();
reset role;
update auth.users set email_confirmed_at=statement_timestamp() where id=auth.uid();
update public.access_requests set status_acesso='PENDENTE_APROVACAO' where auth_user_id=auth.uid();
set local role authenticated;
select pg_temp.assert_denied();
reset role;
update public.access_requests set status_acesso='APROVADO',email='changed.fixture@dialogo.com.br' where auth_user_id=auth.uid();
set local role authenticated;
select pg_temp.assert_denied();
reset role;
update public.access_requests set email='emanuel.locchi@dialogo.com.br' where auth_user_id=auth.uid();
set local role authenticated;
select pg_temp.assert_true(public.read_access_administration_page('summary')->>'activeCount'='41','Restored authorization requires no stale cache invalidation');
reset role;
rollback;

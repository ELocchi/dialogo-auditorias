-- Isolated disposable PostgreSQL only. No hosted users or email delivery.
begin;
do $test$ begin
  if current_setting('dialogo.test_database',true) is distinct from 'isolated-local'
    or session_user <> 'postgres' or exists(select 1 from auth.users) then
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
  select case when n=1 then '13044e3f-e8d2-4b4b-9981-22a8de22c610'::uuid
    else ('d1b40000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid end;
$test$;
create function pg_temp.actor(n integer) returns void language sql as $test$
  select set_config('request.jwt.claim.sub',pg_temp.id(n)::text,true)::void;
$test$;
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 (pg_temp.id(1),'emanuel.locchi@dialogo.com.br','{"nome":"Explicit confirmation admin"}','2026-09-01T10:00:00Z'),
 (pg_temp.id(2),'existing.confirmed@dialogo.com.br','{"nome":"Existing confirmed request"}','2026-09-01T11:00:00Z'),
 (pg_temp.id(3),'existing.unconfirmed@dialogo.com.br','{"nome":"Existing unconfirmed request"}',null);
select dialogo_private.bootstrap_first_administrator(pg_temp.id(1),
 'emanuel.locchi@dialogo.com.br','Isolated explicit confirmation bootstrap');
update public.access_accounts set atuacao_administrativa='GERAL' where auth_user_id=pg_temp.id(1);
create temp table existing_requests as select * from public.access_requests;
create temp table existing_accounts as select * from public.access_accounts;
create temp table existing_decisions as select * from public.access_decisions;
commit;

-- MIGRATION_UPGRADE_BOUNDARY
begin;
select pg_temp.assert_true(
 not exists((select * from public.access_requests except select * from existing_requests)
   union all (select * from existing_requests except select * from public.access_requests))
 and not exists((select * from public.access_accounts except select * from existing_accounts)
   union all (select * from existing_accounts except select * from public.access_accounts))
 and not exists((select * from public.access_decisions except select * from existing_decisions)
   union all (select * from existing_decisions except select * from public.access_decisions)),
 'Existing confirmations, approvals and decisions survive migration exactly');

insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 (pg_temp.id(4),'new.unconfirmed@dialogo.com.br','{"nome":"New request","email_confirmado_em":"2020-01-01","email_confirmado":true,"status_acesso":"APROVADO"}',null),
 (pg_temp.id(5),'new.authconfirmed@dialogo.com.br','{"nome":"Provider confirmed immediately"}','2026-09-29T12:00:00Z');
select pg_temp.assert_true((select count(*)=2 from public.access_requests
 where auth_user_id in (pg_temp.id(4),pg_temp.id(5)) and email_confirmado_em is null
   and status_acesso='PENDENTE_APROVACAO'),
 'Neither unconfirmed nor Auth-confirmed signup enters the queue automatically');

set local role authenticated;
select pg_temp.actor(4);
select pg_temp.expect_error('select public.confirm_own_access_request_email()','42501');
reset role;
update auth.users set email_confirmed_at='2026-09-29T12:01:00Z' where id in (pg_temp.id(3),pg_temp.id(4));
update auth.users set raw_user_meta_data=raw_user_meta_data||'{"email_confirmado_em":"2026-09-29T12:01:00Z","status_acesso":"APROVADO"}' where id=pg_temp.id(4);
select pg_temp.assert_true((select count(*)=3 from public.access_requests
 where auth_user_id in (pg_temp.id(3),pg_temp.id(4),pg_temp.id(5)) and email_confirmado_em is null),
 'Auth verification and metadata updates alone do not acknowledge the request');

set local role authenticated;
select pg_temp.actor(1);
select pg_temp.assert_true(public.read_access_administration_page('summary')->>'pendingCount'='1'
 and public.read_access_administration_page('pending')->>'total'='1'
 and (select count(*)=2 from public.access_requests)
 and not public.can_read_pending_access_request(pg_temp.id(4)),
 'Both paged reads and table RLS hide requests before explicit confirmation');
select pg_temp.expect_error($sql$select public.approve_access_request_v3(
 pg_temp.id(4),array['ADMINISTRATIVO'],null,'GERAL','[]','Approval before acknowledgment blocked')$sql$,'22023');
select pg_temp.expect_error('select public.approve_access_request_v2(pg_temp.id(4),array[''ADMINISTRATIVO''],null,''[]'',''Old approval endpoint forbidden'')','42501');
select pg_temp.actor(5);
select pg_temp.assert_true(public.confirm_own_access_request_email(),'Authenticated caller acknowledges only own identity');
select pg_temp.expect_error($sql$update public.access_requests set email_confirmado_em=now() where auth_user_id=pg_temp.id(4)$sql$,'42501');
reset role;
select pg_temp.assert_true((select email_confirmado_em is null from public.access_requests where auth_user_id=pg_temp.id(4))
 and (select email_confirmado_em='2026-09-29T12:00:00Z'::timestamptz from public.access_requests where auth_user_id=pg_temp.id(5)),
 'Confirmation cannot target another user or invent a timestamp');

set local role authenticated;
select pg_temp.actor(4);
select pg_temp.assert_true(public.confirm_own_access_request_email(),'Explicit post-verification action succeeds');
reset role;
create temp table confirmed_request as select * from public.access_requests where auth_user_id=pg_temp.id(4);
set local role authenticated;
select pg_temp.assert_true(public.confirm_own_access_request_email(),'Repeated confirmation succeeds idempotently');
reset role;
select pg_temp.assert_true(not exists((select * from public.access_requests where auth_user_id=pg_temp.id(4)
 except select * from confirmed_request))
 and (select count(*)=1 from public.access_accounts) and (select count(*)=1 from public.access_decisions)
 and not exists(select 1 from public.access_grants),
 'Confirmation is idempotent and creates no approvals, accounts or grants');
set local role authenticated;
select pg_temp.actor(1);
select pg_temp.assert_true(public.read_access_administration_page('summary')->>'pendingCount'='3'
 and public.read_access_administration_page('pending')->>'total'='3'
 and public.can_read_pending_access_request(pg_temp.id(4)),
 'Confirmed requests appear for administration immediately');
reset role;

update auth.users set raw_user_meta_data=raw_user_meta_data||'{"nome":"Updated name"}' where id=pg_temp.id(4);
select pg_temp.assert_true((select email_confirmado_em='2026-09-29T12:01:00Z'::timestamptz from public.access_requests where auth_user_id=pg_temp.id(4)),
 'Unrelated metadata changes preserve a valid acknowledgment');
update auth.users set email_confirmed_at=null where id=pg_temp.id(4);
select pg_temp.assert_true((select email_confirmado_em is null from public.access_requests where auth_user_id=pg_temp.id(4)),
 'Revoking Auth confirmation invalidates the acknowledgment');
update auth.users set email_confirmed_at='2026-09-29T12:02:00Z' where id=pg_temp.id(4);
set local role authenticated;
select pg_temp.actor(1);
select pg_temp.expect_error($sql$select public.approve_access_request_v3(
 pg_temp.id(4),array['ADMINISTRATIVO'],null,'GERAL','[]','Approval after revocation blocked')$sql$,'22023');
select pg_temp.actor(4);
select pg_temp.assert_true(public.confirm_own_access_request_email(),'Owner acknowledges the renewed Auth verification');
reset role;
update auth.users set email_confirmed_at='2026-09-29T12:03:00Z' where id=pg_temp.id(4);
select pg_temp.assert_true((select email_confirmado_em is null from public.access_requests where auth_user_id=pg_temp.id(4)),
 'Changing the Auth confirmation timestamp invalidates the prior acknowledgment');

update auth.users set banned_until=statement_timestamp()+interval '1 day' where id=pg_temp.id(4);
set local role authenticated;
select pg_temp.expect_error('select public.confirm_own_access_request_email()','42501');
reset role;
update auth.users set banned_until=null,deleted_at=statement_timestamp() where id=pg_temp.id(4);
set local role authenticated;
select pg_temp.expect_error('select public.confirm_own_access_request_email()','42501');
reset role;
update auth.users set deleted_at=null where id=pg_temp.id(4);
update public.access_requests set email='mismatched@dialogo.com.br' where auth_user_id=pg_temp.id(4);
set local role authenticated;
select pg_temp.expect_error('select public.confirm_own_access_request_email()','22023');
reset role;
update public.access_requests set email='new.unconfirmed@dialogo.com.br' where auth_user_id=pg_temp.id(4);
set local role authenticated;
select pg_temp.assert_true(public.confirm_own_access_request_email(),'Current eligible owner can acknowledge after restrictions clear');
select pg_temp.actor(1);
select public.approve_access_request_v3(pg_temp.id(4),array['ADMINISTRATIVO'],null,'GERAL','[]','Administrator approval after explicit confirmation');
select pg_temp.actor(4);
select pg_temp.assert_true(public.confirm_own_access_request_email(),'Already approved caller can repeat confirmation without changing approval');
reset role;
select pg_temp.assert_true((select status_acesso='APROVADO' from public.access_requests where auth_user_id=pg_temp.id(4))
 and (select count(*)=2 from public.access_accounts) and (select count(*)=2 from public.access_decisions),
 'Only the separate administrator action creates approved access');

delete from public.access_requests where auth_user_id=pg_temp.id(5);
set local role authenticated;
select pg_temp.actor(5);
select pg_temp.expect_error('select public.confirm_own_access_request_email()','22023');
reset role;
select pg_temp.expect_error($sql$update auth.users set email='changed@dialogo.com.br' where id=pg_temp.id(4)$sql$,'23514');
select pg_temp.expect_error($sql$update auth.users set email_change='changed@dialogo.com.br' where id=pg_temp.id(4)$sql$,'23514');

set local role anon;
select pg_temp.expect_error('select public.confirm_own_access_request_email()','42501');
reset role;
set local role service_role;
select pg_temp.expect_error('select public.confirm_own_access_request_email()','42501');
reset role;
set local role authenticated;
set local "request.jwt.claim.sub"='';
select pg_temp.expect_error('select public.confirm_own_access_request_email()','42501');
reset role;
select pg_temp.assert_true((select prosecdef and provolatile='v' and proconfig=array['search_path=""']
 from pg_proc where oid='public.confirm_own_access_request_email()'::regprocedure)
 and not has_function_privilege('authenticated','public.approve_access_request_v2(uuid,text[],text,jsonb,text)','EXECUTE'),
 'New endpoint uses explicit privileges and fixed search path; old approval stays inaccessible');
rollback;

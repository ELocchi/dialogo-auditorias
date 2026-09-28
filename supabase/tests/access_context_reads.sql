-- Isolated synthetic PostgreSQL regression. NEVER run against a hosted database.
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
  select ('d1b60000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
$test$;

insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 ('13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br','{"nome":"Access general fixture"}',clock_timestamp()),
 (pg_temp.id(2),'access.context.technical@dialogo.com.br','{"nome":"Technical fixture"}',clock_timestamp()),
 (pg_temp.id(3),'access.context.quality@dialogo.com.br','{"nome":"Quality admin fixture"}',clock_timestamp()),
 (pg_temp.id(4),'access.context.safety@dialogo.com.br','{"nome":"Safety admin fixture"}',clock_timestamp()),
 (pg_temp.id(5),'access.context.pending@dialogo.com.br','{"nome":"Pending fixture"}',clock_timestamp()),
 (pg_temp.id(6),'access.context.other@dialogo.com.br','{"nome":"Other fixture"}',clock_timestamp());
select dialogo_private.bootstrap_first_administrator('13044e3f-e8d2-4b4b-9981-22a8de22c610',
 'emanuel.locchi@dialogo.com.br','Isolated access context bootstrap');
update public.access_accounts set atuacao_administrativa='GERAL'
 where auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610';
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
insert into public.access_works(id,nome,cidade,uf,logradouro,numero,responsavel_tecnico,coordenacao,created_by)
 select pg_temp.id(n),'Access work ' || n,'São Paulo','SP','Rua fixture',n::text,'Engineer fixture','Coordinator fixture',auth.uid()
 from generate_series(101,104) n;
set local role authenticated;
select public.approve_access_request_v3(pg_temp.id(2),array['AUDITOR_SEGURANCA','AUDITOR_QUALIDADE','ENGENHARIA'],'EQUIPE_OBRA',null,
 jsonb_build_array(
  jsonb_build_object('perfil','AUDITOR_SEGURANCA','obra_id',pg_temp.id(101),'modulo','SEGURANCA'),
  jsonb_build_object('perfil','AUDITOR_QUALIDADE','obra_id',pg_temp.id(102),'modulo','QUALIDADE'),
  jsonb_build_object('perfil','AUDITOR_QUALIDADE','obra_id',pg_temp.id(103),'modulo','QUALIDADE'),
  jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(104),'modulo','SEGURANCA'),
  jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(104),'modulo','QUALIDADE')),'Technical profile isolation fixture');
select public.approve_access_request_v3(pg_temp.id(3),array['ADMINISTRATIVO','AUDITOR_QUALIDADE'],null,'QUALIDADE',
 jsonb_build_array(jsonb_build_object('perfil','AUDITOR_QUALIDADE','obra_id',pg_temp.id(102),'modulo','QUALIDADE')),
 'Limited quality admin with one technical grant');
select public.approve_access_request_v3(pg_temp.id(4),array['ADMINISTRATIVO'],null,'SEGURANCA','[]',
 'Limited safety admin without technical grants');
select public.approve_access_request_v3(pg_temp.id(6),array['AUDITOR_QUALIDADE'],null,null,
 jsonb_build_array(jsonb_build_object('perfil','AUDITOR_QUALIDADE','obra_id',pg_temp.id(104),'modulo','QUALIDADE')),
 'Another account permissions must not leak');
reset role;
update public.access_accounts set atuacoes_engenharia=array['EQUIPE_OBRA','COORDENACAO'] where auth_user_id=pg_temp.id(2);
update public.access_works set ativo=false where id=pg_temp.id(103);

-- Compare with the former session/RLS reads, without the old silent row caps.
create function pg_temp.legacy_workspace(p_profile text) returns jsonb language sql stable as $test$
 with grants as materialized (
   select g.perfil,g.obra_id,g.modulo from public.access_grants g
   where g.auth_user_id=auth.uid() and g.perfil=p_profile
 ), works as (
   select w.id,w.nome,w.ativo,w.cidade,w.uf,w.logradouro,w.numero,w.responsavel_tecnico,w.coordenacao
   from public.access_works w where w.ativo and (p_profile='ADMINISTRATIVO'
     or w.id in (select g.obra_id from grants g))
 )
 select jsonb_build_object(
   'identity',(select jsonb_build_object('id',r.auth_user_id,'name',r.nome,'email',r.email)
     from public.access_requests r where r.auth_user_id=auth.uid()),
   'works',coalesce((select jsonb_agg(to_jsonb(w) order by w.nome,w.id) from works w),'[]'::jsonb),
   'grants',coalesce((select jsonb_agg(to_jsonb(g) order by g.perfil,g.obra_id,g.modulo) from grants g),'[]'::jsonb));
$test$;
create function pg_temp.assert_denied() returns void language plpgsql as $test$
begin
  perform pg_temp.assert_true(public.read_current_access_account() is null,'Inactive account has no account snapshot');
  perform pg_temp.expect_error($sql$select public.read_current_access_workspace('AUDITOR_QUALIDADE')$sql$,'42501');
end $test$;
select pg_temp.assert_true((select count(*)=2 and bool_and(provolatile='s' and prosecdef and proconfig @> array['search_path=""'])
 from pg_proc where oid in ('public.read_current_access_account()'::regprocedure,
 'public.read_current_access_workspace(text,text,text)'::regprocedure)),
 'Both readers are STABLE SECURITY DEFINER with an empty search path');
select pg_temp.assert_true((select pronargs=0 from pg_proc where oid='public.read_current_access_account()'::regprocedure),
 'Account identity is derived exclusively from the session, with no user ID parameter');

set local role authenticated;
set local "request.jwt.claim.sub"='d1b60000-0000-4000-8000-000000000002';
select pg_temp.assert_true(public.read_current_access_account()=(select jsonb_build_object(
 'account',jsonb_build_object('auth_user_id',a.auth_user_id,'perfil',a.perfil,'perfis',a.perfis,
   'atuacao_engenharia',a.atuacao_engenharia,'atuacoes_engenharia',a.atuacoes_engenharia,
   'atuacao_administrativa',a.atuacao_administrativa,'ativo',a.ativo,'approved_at',a.approved_at),
 'request',jsonb_build_object('auth_user_id',r.auth_user_id,'status_acesso',r.status_acesso,'email',r.email,'email_confirmado_em',r.email_confirmado_em))
 from public.access_accounts a join public.access_requests r using(auth_user_id) where a.auth_user_id=auth.uid()),
 'Account projection matches the prior own-session reads without unrelated fields');
select pg_temp.assert_true(public.read_current_access_workspace('AUDITOR_SEGURANCA')=pg_temp.legacy_workspace('AUDITOR_SEGURANCA')
 and public.read_current_access_workspace('AUDITOR_SEGURANCA')->'works'->0->>'id'=pg_temp.id(101)::text
 and jsonb_array_length(public.read_current_access_workspace('AUDITOR_SEGURANCA')->'works')=1,
 'Safety selection includes only its exact active grants and full work details');
select pg_temp.assert_true(public.read_current_access_workspace('AUDITOR_QUALIDADE')=pg_temp.legacy_workspace('AUDITOR_QUALIDADE')
 and public.read_current_access_workspace('AUDITOR_QUALIDADE')->'works'->0->>'id'=pg_temp.id(102)::text
 and jsonb_array_length(public.read_current_access_workspace('AUDITOR_QUALIDADE')->'grants')=1,
 'Quality selection excludes inactive works, other profiles and another user grants');
select pg_temp.assert_true(public.read_current_access_workspace('ENGENHARIA','EQUIPE_OBRA')=pg_temp.legacy_workspace('ENGENHARIA')
 and public.read_current_access_workspace('ENGENHARIA','COORDENACAO')=pg_temp.legacy_workspace('ENGENHARIA')
 and jsonb_array_length(public.read_current_access_workspace('ENGENHARIA','COORDENACAO')->'works')=1
 and jsonb_array_length(public.read_current_access_workspace('ENGENHARIA','COORDENACAO')->'grants')=2,
 'Both granted engineering activities retain only the exact engineering work/modules');
select pg_temp.expect_error($sql$select public.read_current_access_workspace(null)$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_current_access_workspace('ROOT')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_current_access_workspace('ENGENHARIA')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_current_access_workspace('ENGENHARIA','ROOT')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_current_access_workspace('AUDITOR_QUALIDADE','COORDENACAO')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_current_access_workspace('AUDITOR_QUALIDADE',null,'QUALIDADE')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_current_access_workspace('ADMINISTRATIVO',null,'GERAL')$sql$,'42501');

-- Execute in an actual read-only transaction context, as PostgREST STABLE does.
savepoint before_read_only;
set local transaction_read_only=on;
select pg_temp.assert_true(public.read_current_access_account()->'account'->>'auth_user_id'=auth.uid()::text
 and public.read_current_access_workspace('ENGENHARIA','COORDENACAO')=pg_temp.legacy_workspace('ENGENHARIA'),
 'Snapshots execute successfully without writes, row locks or transaction changes');
rollback to savepoint before_read_only;

set local "request.jwt.claim.sub"='d1b60000-0000-4000-8000-000000000003';
select pg_temp.assert_true(public.read_current_access_workspace('ADMINISTRATIVO',null,'QUALIDADE')=pg_temp.legacy_workspace('ADMINISTRATIVO')
 and public.read_current_access_workspace('ADMINISTRATIVO',null,'QUALIDADE')->'grants'='[]'::jsonb
 and jsonb_array_length(public.read_current_access_workspace('ADMINISTRATIVO',null,'QUALIDADE')->'works')=1,
 'Limited admin preserves the former catalog RLS without turning technical grants into admin grants');
select pg_temp.expect_error($sql$select public.read_current_access_workspace('ADMINISTRATIVO',null,'GERAL')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_current_access_workspace('ADMINISTRATIVO',null,'SEGURANCA')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_current_access_workspace('ADMINISTRATIVO',null,'ROOT')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_current_access_workspace('ADMINISTRATIVO')$sql$,'42501');
set local "request.jwt.claim.sub"='d1b60000-0000-4000-8000-000000000004';
select pg_temp.assert_true(public.read_current_access_workspace('ADMINISTRATIVO',null,'SEGURANCA')=pg_temp.legacy_workspace('ADMINISTRATIVO')
 and public.read_current_access_workspace('ADMINISTRATIVO',null,'SEGURANCA')->'works'='[]'::jsonb,
 'Limited admin without technical grants does not acquire a broader catalog');
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select pg_temp.assert_true(public.read_current_access_workspace('ADMINISTRATIVO',null,'GERAL')=pg_temp.legacy_workspace('ADMINISTRATIVO')
 and public.read_current_access_workspace('ADMINISTRATIVO',null,'QUALIDADE')=pg_temp.legacy_workspace('ADMINISTRATIVO')
 and public.read_current_access_workspace('ADMINISTRATIVO',null,'SEGURANCA')=pg_temp.legacy_workspace('ADMINISTRATIVO')
 and jsonb_array_length(public.read_current_access_workspace('ADMINISTRATIVO',null,'GERAL')->'works')=3
 and public.read_current_access_account()->'account'->>'atuacao_administrativa'='GERAL',
 'General admin may choose all valid disciplines and sees all active works, without technical grants');
set local "request.jwt.claim.sub"='d1b60000-0000-4000-8000-000000000005';
select pg_temp.assert_denied();
set local "request.jwt.claim.sub"='';
select pg_temp.assert_denied();

-- More than the former 400 grants / 1000 work limits must remain complete.
reset role;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
insert into public.access_works(id,nome,created_by)
 select pg_temp.id(n),'Bulk access work ' || n,'13044e3f-e8d2-4b4b-9981-22a8de22c610'
 from generate_series(2001,3001) n;
insert into public.access_grants(auth_user_id,perfil,obra_id,modulo,granted_at,granted_by,decision_id)
 select g.auth_user_id,g.perfil,pg_temp.id(n),g.modulo,g.granted_at,g.granted_by,g.decision_id
 from public.access_grants g cross join generate_series(2001,3001) n
 where g.auth_user_id=pg_temp.id(2) and g.perfil='AUDITOR_QUALIDADE' and g.obra_id=pg_temp.id(102);
set local role authenticated;
set local "request.jwt.claim.sub"='d1b60000-0000-4000-8000-000000000002';
select pg_temp.assert_true(jsonb_array_length(public.read_current_access_workspace('AUDITOR_QUALIDADE')->'works')=1002
 and jsonb_array_length(public.read_current_access_workspace('AUDITOR_QUALIDADE')->'grants')=1002
 and public.read_current_access_workspace('AUDITOR_QUALIDADE')=pg_temp.legacy_workspace('AUDITOR_QUALIDADE'),
 'Large authorized selections are complete and deterministically ordered');
reset role;
delete from public.access_grants where auth_user_id=pg_temp.id(2) and perfil='AUDITOR_QUALIDADE' and obra_id=pg_temp.id(102);
update public.access_accounts set atuacoes_engenharia=array['EQUIPE_OBRA'] where auth_user_id=pg_temp.id(2);
set local role authenticated;
select pg_temp.assert_true(public.read_current_access_account() is not null
 and jsonb_array_length(public.read_current_access_workspace('AUDITOR_QUALIDADE')->'works')=1001
 and not exists(select 1 from jsonb_array_elements(public.read_current_access_workspace('AUDITOR_QUALIDADE')->'works') w
   where w->>'id'=pg_temp.id(102)::text),'Grant revocation is reflected on the next read without invalidating unrelated account access');
select pg_temp.expect_error($sql$select public.read_current_access_workspace('ENGENHARIA','COORDENACAO')$sql$,'42501');
reset role;
update public.access_accounts set perfis=array['AUDITOR_QUALIDADE','ENGENHARIA'],perfil='AUDITOR_QUALIDADE' where auth_user_id=pg_temp.id(2);
set local role authenticated;
select pg_temp.expect_error($sql$select public.read_current_access_workspace('AUDITOR_SEGURANCA')$sql$,'42501');
select pg_temp.assert_true(public.read_current_access_account()->'account'->'perfis'='["AUDITOR_QUALIDADE","ENGENHARIA"]'::jsonb,
 'Profile revocation is reflected even while historical grants still exist');

reset role;
update auth.users set banned_until=clock_timestamp()+interval '1 day' where id=pg_temp.id(2);
set local role authenticated;
select pg_temp.assert_denied();
reset role;
update auth.users set banned_until=clock_timestamp()-interval '1 day' where id=pg_temp.id(2);
set local role authenticated;
select pg_temp.assert_true(public.read_current_access_account() is not null,'Expired bans are evaluated against current statement time');
reset role;
update auth.users set deleted_at=clock_timestamp() where id=pg_temp.id(2);
set local role authenticated;
select pg_temp.assert_denied();
reset role;
update auth.users set deleted_at=null,email_confirmed_at=null where id=pg_temp.id(2);
set local role authenticated;
select pg_temp.assert_denied();
reset role;
update auth.users set email_confirmed_at=clock_timestamp() where id=pg_temp.id(2);
update public.access_requests set status_acesso='PENDENTE_APROVACAO' where auth_user_id=pg_temp.id(2);
set local role authenticated;
select pg_temp.assert_denied();
reset role;
update public.access_requests set status_acesso='APROVADO',email='different.context@dialogo.com.br' where auth_user_id=pg_temp.id(2);
set local role authenticated;
select pg_temp.assert_denied();
reset role;
update public.access_requests set email='access.context.technical@dialogo.com.br',email_confirmado_em=null where auth_user_id=pg_temp.id(2);
set local role authenticated;
select pg_temp.assert_denied();
reset role;
update public.access_requests set email_confirmado_em=clock_timestamp() where auth_user_id=pg_temp.id(2);
update public.access_accounts set ativo=false where auth_user_id=pg_temp.id(2);
set local role authenticated;
select pg_temp.assert_denied();
reset role;
update public.access_accounts set ativo=true where auth_user_id=pg_temp.id(2);
set local role authenticated;
select pg_temp.assert_true(public.read_current_access_account() is not null,'Restored account observes current permissions without a stale denial');
reset role;
set local role anon;
select pg_temp.expect_error($sql$select public.read_current_access_account()$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_current_access_workspace('AUDITOR_QUALIDADE')$sql$,'42501');
reset role;
set local role service_role;
select pg_temp.expect_error($sql$select public.read_current_access_account()$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_current_access_workspace('AUDITOR_QUALIDADE')$sql$,'42501');
reset role;
rollback;

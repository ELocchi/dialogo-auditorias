-- Synthetic fixtures only: rollback leaves an empty isolated database.
begin;
do $t$ begin
  if current_setting('dialogo.test_database',true) is distinct from 'isolated-local' or exists(select 1 from auth.users) then
    raise exception 'Requires empty isolated database';
  end if;
end $t$;
create function pg_temp.assert_true(v boolean,label text) returns void language plpgsql as $f$
begin if v is distinct from true then raise exception 'Failed: %',label; end if; end $f$;
create function pg_temp.expect_error(statement text,code text) returns void language plpgsql as $f$
begin begin execute statement; exception when others then
  if sqlstate=code then return; end if; raise exception 'Expected %, got %: %',code,sqlstate,sqlerrm;
  end; raise exception 'Expected %: %',code,statement; end $f$;
create function pg_temp.id(n integer) returns uuid language sql immutable as $f$
  select case when n=1 then '13044e3f-e8d2-4b4b-9981-22a8de22c610'::uuid else ('aabc0000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid end;
$f$;
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 (pg_temp.id(1),'emanuel.locchi@dialogo.com.br','{"nome":"Test admin"}',now()),
 (pg_temp.id(2),'standalone.auditor@dialogo.com.br','{"nome":"Test auditor"}',now()),
 (pg_temp.id(3),'standalone.engineer@dialogo.com.br','{"nome":"Test engineer"}',now()),
 (pg_temp.id(4),'standalone.other@dialogo.com.br','{"nome":"Other engineer"}',now()),
 (pg_temp.id(5),'standalone.coord@dialogo.com.br','{"nome":"Test coordinator"}',now());
update public.access_requests set email_confirmado_em=clock_timestamp();
select dialogo_private.bootstrap_first_administrator(pg_temp.id(1),'emanuel.locchi@dialogo.com.br','Isolated standalone fixture');
update public.access_accounts set atuacao_administrativa='GERAL' where auth_user_id=pg_temp.id(1);
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
insert into public.access_works(id,nome,created_by) values(pg_temp.id(101),'Report work',pg_temp.id(1)),(pg_temp.id(102),'Other work',pg_temp.id(1));
set local role authenticated;
select public.approve_access_request_v3(pg_temp.id(2),array['AUDITOR_QUALIDADE'],null,null,
 jsonb_build_array(jsonb_build_object('perfil','AUDITOR_QUALIDADE','obra_id',pg_temp.id(101),'modulo','QUALIDADE')),'Isolated auditor');
select public.approve_access_request_v3(pg_temp.id(3),array['ENGENHARIA'],'EQUIPE_OBRA',null,
 jsonb_build_array(jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(101),'modulo','QUALIDADE'),jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(101),'modulo','SEGURANCA')),'Isolated engineer');
select public.approve_access_request_v3(pg_temp.id(4),array['ENGENHARIA'],'EQUIPE_OBRA',null,
 jsonb_build_array(jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(102),'modulo','QUALIDADE'),jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(102),'modulo','SEGURANCA')),'Isolated outsider');
select public.approve_access_request_v3(pg_temp.id(5),array['ENGENHARIA'],'COORDENACAO',null,
 jsonb_build_array(jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(101),'modulo','QUALIDADE'),jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(101),'modulo','SEGURANCA')),'Isolated coordinator');
reset role;
insert into public.audit_visits(id,obra_id,modulo,modelo_id,visit_kind,auditor_auth_user_id,data_prevista,created_by,updated_by)
select pg_temp.id(1000+n),pg_temp.id(101),'QUALIDADE',null,'ACOMPANHAMENTO',pg_temp.id(2),date '2026-10-01',pg_temp.id(1),pg_temp.id(1) from generate_series(1,100) n;
insert into public.follow_up_work_findings(id,work_id,auditor_auth_user_id,modulo,description,correction,photo_file_name)
select pg_temp.id(2000+n),pg_temp.id(101),pg_temp.id(2),'QUALIDADE','Apontamento de teste '||n,'Orientação de teste '||n,pg_temp.id(2000+n)::text||'_'||pg_temp.id(3000+n)::text||'.jpg' from generate_series(1,30) n;
insert into storage.objects(id,bucket_id,name)
select pg_temp.id(4000+n),'follow-up-photos',pg_temp.id(2)::text||'/'||pg_temp.id(1000+n)::text||'/'||pg_temp.id(2000+n)::text||'_'||pg_temp.id(3000+n)::text||'.jpg' from generate_series(1,100) n;
insert into storage.objects(id,bucket_id,name)
select pg_temp.id(5000+n),'follow-up-photos',pg_temp.id(2)::text||'/'||pg_temp.id(101)::text||'/'||photo_file_name from public.follow_up_work_findings f cross join lateral(select substring(f.id::text from 25)::integer-2000 as n) z;
insert into storage.objects(id,bucket_id,name)
select pg_temp.id(6000+n),'published-audits',pg_temp.id(101)::text||'/'||pg_temp.id(701)::text||'/'||n||'.jpg' from generate_series(1,201) n;
-- A realistic bucket also has unrelated owners and directories. Never return them.
insert into storage.objects(id,bucket_id,name)
select pg_temp.id(20000+n),'follow-up-photos',pg_temp.id(4)::text||'/'||pg_temp.id(1000+n%100)::text||'/unrelated-'||n||'.jpg' from generate_series(1,3000) n;
create index fixture_storage_names on storage.objects(bucket_id,name);
analyze storage.objects;
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
-- NPLUS1_FIXTURES_READY

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
select pg_temp.expect_error('select * from public.standalone_follow_up_reports','42501');
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
create function pg_temp.save_report(request integer,ids uuid[] default '{}',work integer default 101,title text default 'Orientações') returns uuid language sql as $f$
 select public.save_standalone_follow_up_report('AUDITOR_QUALIDADE',pg_temp.id(work),date '2026-09-30',title,'','Orientações da obra','',ids,pg_temp.id(request));
$f$;
select set_config('dialogo.test.report',pg_temp.save_report(201)::text,true);
create function pg_temp.report_id() returns uuid language sql as $f$ select current_setting('dialogo.test.report')::uuid $f$;
select pg_temp.assert_true(pg_temp.save_report(201)=pg_temp.report_id(),'Retry returns same independent report');
select pg_temp.expect_error($s$select pg_temp.save_report(201,'{}',101,'Changed')$s$,'22023');
select pg_temp.expect_error($s$select pg_temp.save_report(202,'{}',102)$s$,'42501');
select pg_temp.expect_error($s$select public.save_standalone_follow_up_report('AUDITOR_SEGURANCA',pg_temp.id(101),current_date,'Title','','Body','','{}',pg_temp.id(203))$s$,'42501');
select pg_temp.expect_error($s$select public.save_standalone_follow_up_report('AUDITOR_QUALIDADE',pg_temp.id(101),current_date+2,'Title','','Body','','{}',pg_temp.id(203))$s$,'22023');
select pg_temp.assert_true(public.read_standalone_follow_up_reports('AUDITOR_QUALIDADE')->'reports'->0->>'workName'='Report work','Index includes work without any visit');
select pg_temp.assert_true(not ((public.read_standalone_follow_up_reports('AUDITOR_QUALIDADE')->'reports'->0) ? 'subjects'),'Index omits full body');
select pg_temp.assert_true(public.read_standalone_follow_up_reports('AUDITOR_QUALIDADE',null,null,pg_temp.report_id())->'reports'->0->'findings'='[]'::jsonb,'Zero findings is allowed');
reset role;
select pg_temp.assert_true(not exists(select 1 from public.audit_visits),'Saving creates no synthetic visits');
select pg_temp.assert_true((select count(*)=1 from public.standalone_follow_up_reports),'Retry never duplicates reports');
insert into public.follow_up_work_findings(id,work_id,auditor_auth_user_id,modulo,description,correction,photo_file_name,serious)
 values(pg_temp.id(301),pg_temp.id(101),pg_temp.id(2),'QUALIDADE','Canonical description','Canonical correction',pg_temp.id(301)::text||'_'||pg_temp.id(401)::text||'.png',true),
 (pg_temp.id(302),pg_temp.id(102),pg_temp.id(2),'QUALIDADE','Wrong work description','Wrong work correction',pg_temp.id(302)::text||'_'||pg_temp.id(402)::text||'.png',false);
set local role authenticated;
select pg_temp.assert_true(jsonb_array_length(public.read_standalone_report_findings('AUDITOR_QUALIDADE',pg_temp.id(101)))=1,'Finding selector scopes the work');
select pg_temp.expect_error($s$select pg_temp.save_report(204,array[pg_temp.id(302)])$s$,'42501');
select pg_temp.expect_error($s$select pg_temp.save_report(204,array[pg_temp.id(301),pg_temp.id(301)])$s$,'22023');
select pg_temp.expect_error($s$select pg_temp.save_report(204,array[pg_temp.id(301)])$s$,'23514');
insert into storage.objects(id,bucket_id,name) values(pg_temp.id(501),'follow-up-photos',pg_temp.id(2)::text||'/'||pg_temp.id(101)::text||'/'||pg_temp.id(301)::text||'_'||pg_temp.id(401)::text||'.png');
select set_config('dialogo.test.with_photo',pg_temp.save_report(204,array[pg_temp.id(301)])::text,true);
select pg_temp.assert_true(public.read_standalone_follow_up_reports('AUDITOR_QUALIDADE',null,null,current_setting('dialogo.test.with_photo')::uuid)->'reports'->0->'findings'->0->>'description'='Canonical description','Content is copied from authoritative finding');
delete from storage.objects where id=pg_temp.id(501);
select pg_temp.assert_true((select count(*)=1 from storage.objects where id=pg_temp.id(501)),'Report photo cannot be deleted by author');
reset role;
update public.follow_up_work_findings set description='Later edited description',completed_at=now() where id=pg_temp.id(301);
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
update public.access_works set nome='Renamed work' where id=pg_temp.id(101);
select pg_temp.expect_error('delete from public.standalone_follow_up_reports','55000');
select pg_temp.expect_error('truncate public.standalone_follow_up_reports','55000');
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
set local role authenticated;
select pg_temp.assert_true(pg_temp.save_report(204,array[pg_temp.id(301)])::text=current_setting('dialogo.test.with_photo'),'Retry succeeds after finding completion');
select pg_temp.assert_true(public.read_standalone_follow_up_reports('AUDITOR_QUALIDADE',null,null,pg_temp.report_id())->'reports'->0->>'workName'='Report work','Work snapshot is immutable');
select set_config('request.jwt.claim.sub',pg_temp.id(3)::text,true);
select pg_temp.assert_true(jsonb_array_length(public.read_standalone_follow_up_reports('ENGENHARIA','EQUIPE_OBRA')->'reports')=2,'Engineering sees standalone publications');
select pg_temp.assert_true((select count(*)=1 from storage.objects where id=pg_temp.id(501)),'Engineering can read report evidence');
select pg_temp.expect_error($s$select pg_temp.save_report(205)$s$,'42501');
select pg_temp.expect_error($s$select public.read_standalone_follow_up_reports('ENGENHARIA','COORDENACAO')$s$,'42501');
select set_config('request.jwt.claim.sub',pg_temp.id(5)::text,true);
select pg_temp.assert_true(jsonb_array_length(public.read_standalone_follow_up_reports('ENGENHARIA','COORDENACAO')->'reports')=2,'Coordination sees reports for its works');
select set_config('request.jwt.claim.sub',pg_temp.id(4)::text,true);
select pg_temp.assert_true(public.read_standalone_follow_up_reports('ENGENHARIA','EQUIPE_OBRA',null,pg_temp.report_id())->'reports'='[]'::jsonb,'Other work cannot read exact document');
select pg_temp.assert_true((select count(*)=0 from storage.objects where id=pg_temp.id(501)),'Other work cannot read evidence');
reset role;
delete from public.access_grants where auth_user_id=pg_temp.id(2);
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
set local role authenticated;
select pg_temp.assert_true(public.read_standalone_follow_up_reports('AUDITOR_QUALIDADE')->'reports'='[]'::jsonb,'Revoked work immediately disappears');
select pg_temp.expect_error('select pg_temp.save_report(201)','42501');
reset role;
select pg_temp.assert_true(not exists(select 1 from public.audit_visits),'All operations remain independent of agenda');
rollback;

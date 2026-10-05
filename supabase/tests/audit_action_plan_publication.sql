-- Synthetic fixtures only; never run this suite on a hosted database.
begin;
do $t$ begin
 if current_setting('dialogo.test_database',true) is distinct from 'isolated-local' or exists(select 1 from auth.users) then
 raise exception 'Requires empty isolated database'; end if;
end $t$;
create function pg_temp.assert_true(v boolean,label text) returns void language plpgsql as $f$
begin if v is distinct from true then raise exception 'Failed: %',label; end if; end $f$;
create function pg_temp.expect_error(statement text,code text) returns void language plpgsql as $f$
begin begin execute statement; exception when others then
 if sqlstate=code then return; end if; raise exception 'Expected %, got %: %',code,sqlstate,sqlerrm;
 end; raise exception 'Expected %: %',code,statement; end $f$;
create function pg_temp.id(n integer) returns uuid language sql immutable as $f$
 select case when n=1 then '13044e3f-e8d2-4b4b-9981-22a8de22c610'::uuid else ('aabb0000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid end;
$f$;
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 (pg_temp.id(1),'emanuel.locchi@dialogo.com.br','{"nome":"Test admin"}',now()),
 (pg_temp.id(2),'pub.auditor@dialogo.com.br','{"nome":"Test auditor"}',now()),
 (pg_temp.id(3),'pub.engineer@dialogo.com.br','{"nome":"Test engineer"}',now()),
 (pg_temp.id(4),'pub.other@dialogo.com.br','{"nome":"Other engineer"}',now()),
 (pg_temp.id(5),'pub.coord@dialogo.com.br','{"nome":"Test coordinator"}',now());
update public.access_requests set email_confirmado_em=clock_timestamp();
select dialogo_private.bootstrap_first_administrator(pg_temp.id(1),'emanuel.locchi@dialogo.com.br','Isolated publication fixture');
update public.access_accounts set atuacao_administrativa='GERAL' where auth_user_id=pg_temp.id(1);
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
insert into public.access_works(id,nome,created_by) values(pg_temp.id(101),'Publication work',pg_temp.id(1)),(pg_temp.id(102),'Other work',pg_temp.id(1));
set local role authenticated;
select public.approve_access_request_v3(pg_temp.id(2),array['AUDITOR_QUALIDADE'],null,null,
 jsonb_build_array(jsonb_build_object('perfil','AUDITOR_QUALIDADE','obra_id',pg_temp.id(101),'modulo','QUALIDADE')),'Isolated auditor');
select public.approve_access_request_v3(pg_temp.id(3),array['ENGENHARIA'],'EQUIPE_OBRA',null,
 jsonb_build_array(jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(101),'modulo','QUALIDADE'),jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(101),'modulo','SEGURANCA')),'Isolated engineer');
select public.approve_access_request_v3(pg_temp.id(4),array['ENGENHARIA'],'EQUIPE_OBRA',null,
 jsonb_build_array(jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(102),'modulo','QUALIDADE'),jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(102),'modulo','SEGURANCA')),'Isolated outsider');
select public.approve_access_request_v3(pg_temp.id(5),array['ENGENHARIA'],'COORDENACAO',null,
 jsonb_build_array(jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(101),'modulo','QUALIDADE'),jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(101),'modulo','SEGURANCA')),'Isolated coordinator');
-- Clients cannot forge actor, score, snapshots or final PDFs via direct RPC/table/storage.
select pg_temp.expect_error($s$select public.publication_command(pg_temp.id(2),'AUDITOR_QUALIDADE',null,null,'list')$s$,'42501');
select pg_temp.expect_error('select * from public.audit_drafts','42501');
select pg_temp.expect_error('insert into storage.objects(id,bucket_id,name) values(gen_random_uuid(),''audit-drafts'',''forged.jpg'')','42501');
reset role;
insert into public.audit_visits(id,obra_id,modulo,modelo_id,auditor_auth_user_id,data_prevista,created_by,updated_by,confirmation_status,confirmed_by,confirmed_at)
 select pg_temp.id(n),pg_temp.id(101),'QUALIDADE','quality-f175',pg_temp.id(2),(clock_timestamp() at time zone 'America/Sao_Paulo')::date,pg_temp.id(1),pg_temp.id(1),'confirmed',pg_temp.id(2),now() from generate_series(201,202) n;
create function pg_temp.start_payload() returns jsonb language sql as $f$
 select '{"modelId":"quality-f175","label":"00","fvsServices":[],"criteria":[{"id":"item1","code":"1","title":"Fixture","text":"Fixture description","group":"Group","subgroup":"","source":"F175","locator":"1","documentedWeight":10,"orientations":[],"verificationRule":"Conforme/Não Conforme"}]}'::jsonb;
$f$;
set local role service_role;
select pg_temp.expect_error($s$select public.publication_command(pg_temp.id(3),'ENGENHARIA','EQUIPE_OBRA',null,'start-audit',pg_temp.id(201),null,pg_temp.start_payload())$s$,'42501');
select set_config('dialogo.test.draft',(public.publication_command(pg_temp.id(2),'AUDITOR_QUALIDADE',null,null,'start-audit',pg_temp.id(201),null,pg_temp.start_payload())->>'id'),true);
create function pg_temp.draft_id() returns uuid language sql as $f$ select current_setting('dialogo.test.draft')::uuid $f$;
select pg_temp.assert_true(public.publication_command(pg_temp.id(2),'AUDITOR_QUALIDADE',null,null,'start-audit',pg_temp.id(201),null,pg_temp.start_payload())->>'id'=pg_temp.draft_id()::text,'Starting twice resumes one draft');
select public.publication_command(pg_temp.id(2),'AUDITOR_QUALIDADE',null,null,'save-audit',pg_temp.draft_id(),1,'{"responses":{"quality-f175":{"item1":{"answer":"Não conforme","note":"Fixture finding","photos":[]}}},"photos":{}}');
select pg_temp.assert_true(public.publication_command(pg_temp.id(2),'AUDITOR_QUALIDADE',null,null,'read-audit',pg_temp.draft_id())->>'revision'='2','Draft survives fresh read');
select pg_temp.expect_error($s$select public.publication_command(pg_temp.id(2),'AUDITOR_QUALIDADE',null,null,'save-audit',pg_temp.draft_id(),1,'{}')$s$,'40001');
select pg_temp.expect_error($s$select public.publication_command(pg_temp.id(3),'ENGENHARIA','EQUIPE_OBRA',null,'read-audit',pg_temp.draft_id())$s$,'42501');
create function pg_temp.audit_payload() returns jsonb language sql as $f$
 select jsonb_build_object('score',0,'responses','{"item1":{"answer":"Não conforme","note":"Fixture finding","photos":[]}}'::jsonb,'evidenceFiles','[]'::jsonb,'reportFileName',repeat('a',64)||'.pdf');
$f$;
select pg_temp.expect_error($s$select public.publication_command(pg_temp.id(2),'AUDITOR_QUALIDADE',null,null,'publish-audit',pg_temp.draft_id(),2,pg_temp.audit_payload())$s$,'23514');
reset role;
select pg_temp.assert_true(not exists(select 1 from public.published_audits) and (select published_audit_id is null from public.audit_visits where id=pg_temp.id(201)),'Missing PDF rolls back entire publication');
insert into storage.objects(id,bucket_id,name) values(gen_random_uuid(),'published-audits',pg_temp.id(101)::text||'/'||pg_temp.draft_id()::text||'/'||repeat('a',64)||'.pdf');
set local role service_role;
select public.publication_command(pg_temp.id(2),'AUDITOR_QUALIDADE',null,null,'publish-audit',pg_temp.draft_id(),2,pg_temp.audit_payload());
select public.publication_command(pg_temp.id(2),'AUDITOR_QUALIDADE',null,null,'publish-audit',pg_temp.draft_id(),2,pg_temp.audit_payload());
select pg_temp.expect_error($s$select public.publication_command(pg_temp.id(2),'AUDITOR_QUALIDADE',null,null,'save-audit',pg_temp.draft_id(),2,'{}')$s$,'55000');
reset role;
select pg_temp.assert_true((select count(*)=1 from public.published_audits) and (select count(*)=1 from public.audit_visit_events where event_type='published'),'Retries never duplicate publication/events');
select pg_temp.assert_true((select published_audit_id=pg_temp.draft_id() from public.audit_visits where id=pg_temp.id(201)) and (select published_audit_id is null from public.audit_visits where id=pg_temp.id(202)),'Exact visit completes even with same-day duplicate');
select pg_temp.expect_error('delete from public.published_audits','55000');
insert into storage.objects(id,bucket_id,name) values(gen_random_uuid(),'published-audits',pg_temp.id(101)::text||'/'||pg_temp.draft_id()::text||'/uncommitted.pdf');
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
set local role authenticated;
select pg_temp.assert_true((select count(*)=1 from storage.objects where bucket_id='published-audits'),'Only committed PDF is readable; staged orphan is hidden');
reset role;
set local role service_role;
select pg_temp.expect_error($s$select public.publication_command(pg_temp.id(4),'ENGENHARIA','EQUIPE_OBRA',null,'read-plan',pg_temp.draft_id())$s$,'42501');
select pg_temp.expect_error($s$select public.publication_command(pg_temp.id(5),'ENGENHARIA','COORDENACAO',null,'save-plan',pg_temp.draft_id(),0,'{}')$s$,'42501');
select public.publication_command(pg_temp.id(3),'ENGENHARIA','EQUIPE_OBRA',null,'save-plan',pg_temp.draft_id(),0,'{"rows":[{"id":"item1","correctiveAction":"Fix","responsible":"Engineer","startDate":"2026-10-01","dueDate":"2026-10-02"}]}');
select pg_temp.expect_error($s$select public.publication_command(pg_temp.id(3),'ENGENHARIA','EQUIPE_OBRA',null,'save-plan',pg_temp.draft_id(),0,'{}')$s$,'40001');
select pg_temp.expect_error($s$select public.publication_command(pg_temp.id(3),'ENGENHARIA','EQUIPE_OBRA',null,'publish-plan',pg_temp.draft_id(),1,jsonb_build_object('reportFileName',repeat('b',64)||'.pdf'))$s$,'23514');
reset role;
insert into storage.objects(id,bucket_id,name) values(gen_random_uuid(),'action-plans',pg_temp.id(101)::text||'/'||pg_temp.draft_id()::text||'/'||repeat('b',64)||'.pdf');
set local role service_role;
select public.publication_command(pg_temp.id(3),'ENGENHARIA','EQUIPE_OBRA',null,'publish-plan',pg_temp.draft_id(),1,jsonb_build_object('reportFileName',repeat('b',64)||'.pdf'));
select public.publication_command(pg_temp.id(3),'ENGENHARIA','EQUIPE_OBRA',null,'publish-plan',pg_temp.draft_id(),1,jsonb_build_object('reportFileName',repeat('b',64)||'.pdf'));
select pg_temp.assert_true(public.publication_command(pg_temp.id(5),'ENGENHARIA','COORDENACAO',null,'read-plan',pg_temp.draft_id())->'publication'->>'audit_id'=pg_temp.draft_id()::text,'Coordination reads only the published plan');
select pg_temp.expect_error($s$select public.publication_command(pg_temp.id(3),'ENGENHARIA','EQUIPE_OBRA',null,'save-plan',pg_temp.draft_id(),1,'{}')$s$,'55000');
reset role;
select pg_temp.assert_true((select count(*)=1 from public.published_action_plans),'One immutable plan per audit');
select pg_temp.expect_error('delete from public.published_action_plans','55000');
update public.access_accounts set ativo=false where auth_user_id=pg_temp.id(3);
set local role service_role;
select pg_temp.expect_error($s$select public.publication_command(pg_temp.id(3),'ENGENHARIA','EQUIPE_OBRA',null,'read-plan',pg_temp.draft_id())$s$,'42501');
reset role;
rollback;

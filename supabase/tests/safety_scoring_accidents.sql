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
select public.approve_access_request_v3(pg_temp.id(2),array['AUDITOR_SEGURANCA'],null,null,
 jsonb_build_array(jsonb_build_object('perfil','AUDITOR_SEGURANCA','obra_id',pg_temp.id(101),'modulo','SEGURANCA')),'Isolated auditor');
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

create function pg_temp.publish_test(score numeric, response text, closure jsonb, penalty integer) returns void language plpgsql as $f$
begin
 insert into public.published_audits(id,work_id,modulo,model_id,audit_date,auditor_auth_user_id,auditor_name,final_score,catalog_version,catalog_revision_label,criteria,responses,evidence_files,report_file_name,source_file_name,safety_closure,accident_penalty,published_at)
 values(gen_random_uuid(),pg_temp.id(101),'SEGURANCA','security-it07-r02','2026-10-05',pg_temp.id(2),'Test auditor',score,0,'02',
 '[{"id":"a","code":"1","group":"A","groupWeight":2,"configuredWeight":10,"documentedWeight":null,"title":"Fixture","text":"Fixture description","subgroup":"","source":"IT07","locator":"1","orientations":[]}]',
 jsonb_build_object('a',jsonb_build_object('answer',response,'note','')),'[]',repeat('a',64)||'.pdf','Fixture',closure,penalty,now());
end;
$f$;
select pg_temp.expect_error($s$select pg_temp.publish_test(10,'10',null,0)$s$,'23514');
select pg_temp.expect_error($s$select pg_temp.publish_test(10,'10','{"hadAccidents":true,"accidents":[]}',0)$s$,'23514');
select pg_temp.expect_error($s$select pg_temp.publish_test(9,'10','{"hadAccidents":false,"accidents":[]}',0)$s$,'23514');
select pg_temp.expect_error($s$select pg_temp.publish_test(10,null,'{"hadAccidents":false,"accidents":[]}',0)$s$,'23514');
select pg_temp.publish_test(10,'10','{"hadAccidents":false,"accidents":[]}',0);
select pg_temp.publish_test(null,'N/A','{"hadAccidents":false,"accidents":[]}',0);
select pg_temp.publish_test(7,'10','{"hadAccidents":true,"accidents":[{"date":"2026-10-01","type":"common","event":"A","justification":"B"},{"date":"2026-10-02","type":"leave","event":"C","justification":"D"}]}',3);
select pg_temp.publish_test(0,'0','{"hadAccidents":true,"accidents":[{"date":"2026-10-01","type":"leave","event":"A","justification":"B"}]}',2);
select pg_temp.expect_error($s$select pg_temp.publish_test(9,'10','{"hadAccidents":true,"accidents":[{"date":"2026-09-30","type":"common","event":"A","justification":"B"}]}',1)$s$,'23514');
select pg_temp.assert_true((select count(*)=4 from public.published_audits),'Only four valid snapshots');
select pg_temp.assert_true((select raw_score=10 and accident_penalty=3 from public.published_audits where final_score=7),'Raw score and deductions persisted');
select pg_temp.expect_error('update public.published_audits set safety_closure=null','55000');

-- Exercise the actual draft RPC, not just the immutable snapshot trigger.
insert into public.audit_visits(id,obra_id,modulo,modelo_id,auditor_auth_user_id,data_prevista,created_by,updated_by,confirmation_status,confirmed_by,confirmed_at)
values(pg_temp.id(201),pg_temp.id(101),'SEGURANCA','security-it07-r02',pg_temp.id(2),(clock_timestamp() at time zone 'America/Sao_Paulo')::date,pg_temp.id(1),pg_temp.id(1),'confirmed',pg_temp.id(2),now());
create function pg_temp.start_payload() returns jsonb language sql security definer set search_path='' as $f$
 select jsonb_build_object('modelId','security-it07-r02','label','02','fvsServices','[]'::jsonb,'criteria',criteria) from public.published_audits limit 1;
$f$;
set local role service_role;
select set_config('dialogo.test.draft',public.publication_command(pg_temp.id(2),'AUDITOR_SEGURANCA',null,null,'start-audit',pg_temp.id(201),null,pg_temp.start_payload())->>'id',true);
create function pg_temp.draft_id() returns uuid language sql as $f$ select current_setting('dialogo.test.draft')::uuid $f$;
select public.publication_command(pg_temp.id(2),'AUDITOR_SEGURANCA',null,null,'save-audit',pg_temp.draft_id(),1,'{"responses":{"security-it07-r02":{"a":{"answer":"N/A","note":"Preserved","autoGroupNA":true}}},"photos":{},"safetyClosure":{"hadAccidents":false,"accidents":[]}}');
select pg_temp.assert_true(public.publication_command(pg_temp.id(2),'AUDITOR_SEGURANCA',null,null,'read-audit',pg_temp.draft_id())->'safety_closure'->>'hadAccidents'='false','Accident declaration survives reload');
select pg_temp.assert_true(public.publication_command(pg_temp.id(2),'AUDITOR_SEGURANCA',null,null,'read-audit',pg_temp.draft_id())->'responses'->'security-it07-r02'->'a'->>'autoGroupNA'='true','Group restoration state survives reload');
reset role;
insert into storage.objects(id,bucket_id,name) values(gen_random_uuid(),'published-audits',pg_temp.id(101)::text||'/'||pg_temp.draft_id()::text||'/'||repeat('b',64)||'.pdf');
set local role service_role;
select public.publication_command(pg_temp.id(2),'AUDITOR_SEGURANCA',null,null,'publish-audit',pg_temp.draft_id(),2,jsonb_build_object('score',null,'rawScore',null,'penalty',0,'responses','{"a":{"answer":"N/A","note":"Preserved"}}'::jsonb,'evidenceFiles','[]'::jsonb,'reportFileName',repeat('b',64)||'.pdf'));
reset role;
select pg_temp.assert_true((select final_score is null and safety_closure->>'hadAccidents'='false' from public.published_audits where id=pg_temp.draft_id()),'All-NA publication keeps declaration without invented score');
select pg_temp.assert_true((select published_audit_id=pg_temp.draft_id() from public.audit_visits where id=pg_temp.id(201)),'Publication completes exact visit');
rollback;

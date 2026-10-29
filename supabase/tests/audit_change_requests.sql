-- Synthetic fixtures only; never run this suite on a hosted database.
-- Change requests for published audits: request, decision, controlled republication.
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
 select case when n=1 then '13044e3f-e8d2-4b4b-9981-22a8de22c610'::uuid else ('aacc0000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid end;
$f$;
create function pg_temp.as_user(n integer) returns void language sql as $f$
 select set_config('request.jwt.claim.sub',pg_temp.id(n)::text,true);
 select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id(n),'role','authenticated')::text,true);
$f$;
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 (pg_temp.id(1),'emanuel.locchi@dialogo.com.br','{"nome":"Test admin"}',now()),
 (pg_temp.id(2),'chg.auditor@dialogo.com.br','{"nome":"Owner auditor"}',now()),
 (pg_temp.id(3),'chg.engineer@dialogo.com.br','{"nome":"Site engineer"}',now()),
 (pg_temp.id(6),'chg.other@dialogo.com.br','{"nome":"Other auditor"}',now()),
 (pg_temp.id(7),'chg.safety@dialogo.com.br','{"nome":"Safety admin"}',now()),
 (pg_temp.id(8),'chg.quality@dialogo.com.br','{"nome":"Quality admin"}',now());
update public.access_requests set email_confirmado_em=clock_timestamp();
select dialogo_private.bootstrap_first_administrator(pg_temp.id(1),'emanuel.locchi@dialogo.com.br','Isolated change fixture');
update public.access_accounts set atuacao_administrativa='GERAL' where auth_user_id=pg_temp.id(1);
select pg_temp.as_user(1);
insert into public.access_works(id,nome,created_by) values(pg_temp.id(101),'Change work',pg_temp.id(1));
set local role authenticated;
select public.approve_access_request_v3(pg_temp.id(2),array['AUDITOR_QUALIDADE'],null,null,
 jsonb_build_array(jsonb_build_object('perfil','AUDITOR_QUALIDADE','obra_id',pg_temp.id(101),'modulo','QUALIDADE')),'Isolated auditor');
select public.approve_access_request_v3(pg_temp.id(6),array['AUDITOR_QUALIDADE'],null,null,
 jsonb_build_array(jsonb_build_object('perfil','AUDITOR_QUALIDADE','obra_id',pg_temp.id(101),'modulo','QUALIDADE')),'Isolated other auditor');
select public.approve_access_request_v3(pg_temp.id(3),array['ENGENHARIA'],'EQUIPE_OBRA',null,
 jsonb_build_array(jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(101),'modulo','QUALIDADE'),jsonb_build_object('perfil','ENGENHARIA','obra_id',pg_temp.id(101),'modulo','SEGURANCA')),'Isolated engineer');
select public.approve_access_request_v3(pg_temp.id(7),array['ADMINISTRATIVO'],null,'SEGURANCA','[]','Isolated safety admin');
select public.approve_access_request_v3(pg_temp.id(8),array['ADMINISTRATIVO'],null,'QUALIDADE','[]','Isolated quality admin');
reset role;

-- Published Quality audit with one Conforme/Não Conforme item and one quantitative item.
insert into public.audit_visits(id,obra_id,modulo,modelo_id,auditor_auth_user_id,data_prevista,created_by,updated_by,confirmation_status,confirmed_by,confirmed_at)
 values(pg_temp.id(201),pg_temp.id(101),'QUALIDADE','quality-f175',pg_temp.id(2),(clock_timestamp() at time zone 'America/Sao_Paulo')::date,pg_temp.id(1),pg_temp.id(1),'confirmed',pg_temp.id(2),now());
create function pg_temp.criteria() returns jsonb language sql as $f$ select '[
 {"id":"item1","code":"01.03","title":"Acompanhamento semanal","text":"Fixture description","group":"01. Grupo","subgroup":"","source":"F175","locator":"1","documentedWeight":5,"orientations":[],"verificationRule":"Conforme/Não Conforme"},
 {"id":"item2","code":"01.04","title":"Armazenamento","text":"Fixture description","group":"01. Grupo","subgroup":"","source":"F175","locator":"2","documentedWeight":5,"orientations":[],"verificationRule":"Dividido pela quantidade verificada"}]'::jsonb $f$;
create function pg_temp.responses(note1 text,check_note text) returns jsonb language sql as $f$ select jsonb_build_object(
 'item1',jsonb_build_object('answer','Não conforme','note',note1,'photos','[]'::jsonb),
 'item2',jsonb_build_object('note','','checks',jsonb_build_array(
   jsonb_build_object('id','c1','label','Cimento','compliant',false,'note',check_note,'photos','[]'::jsonb),
   jsonb_build_object('id','c2','label','Aço','compliant',true,'note','','photos','[]'::jsonb)))) $f$;
set local role service_role;
select set_config('dialogo.test.draft',(public.publication_command(pg_temp.id(2),'AUDITOR_QUALIDADE',null,null,'start-audit',pg_temp.id(201),null,
 jsonb_build_object('modelId','quality-f175','label','00','fvsServices','[]'::jsonb,'criteria',pg_temp.criteria()))->>'id'),true);
create function pg_temp.audit() returns uuid language sql as $f$ select current_setting('dialogo.test.draft')::uuid $f$;
select public.publication_command(pg_temp.id(2),'AUDITOR_QUALIDADE',null,null,'save-audit',pg_temp.audit(),1,
 jsonb_build_object('responses',jsonb_build_object('quality-f175',pg_temp.responses('Texto original','Fora do especificado')),'photos','{}'::jsonb));
reset role;
insert into storage.objects(id,bucket_id,name) values(gen_random_uuid(),'published-audits',pg_temp.id(101)::text||'/'||pg_temp.audit()::text||'/'||repeat('a',64)||'.pdf');
set local role service_role;
select public.publication_command(pg_temp.id(2),'AUDITOR_QUALIDADE',null,null,'publish-audit',pg_temp.audit(),2,
 jsonb_build_object('score',2.5,'responses',pg_temp.responses('Texto original','Fora do especificado'),'evidenceFiles','[]'::jsonb,'reportFileName',repeat('a',64)||'.pdf'));
reset role;
select pg_temp.assert_true((select content_revision=0 and findings_summary::text like '%Texto original%' from public.published_audits where id=pg_temp.audit()),'Publication starts at content revision 0');

-- Clients never write the tables directly.
select pg_temp.as_user(2);
set local role authenticated;
select pg_temp.expect_error($s$insert into public.audit_change_requests(audit_id,work_id,modulo,criterion_id,criterion_code,criterion_title,reason,requested_by,requested_by_name) values(pg_temp.audit(),pg_temp.id(101),'QUALIDADE','item1','1','x','Forged reason',pg_temp.id(2),'x')$s$,'42501');
select pg_temp.expect_error('select * from public.published_audit_versions','42501');
select pg_temp.expect_error('update public.published_audits set report_file_name=report_file_name','42501');
reset role;

-- Only the owner auditor asks; item and reason are required; one open request per audit.
select pg_temp.as_user(6);
set local role authenticated;
select pg_temp.expect_error($s$select public.request_audit_change('AUDITOR_QUALIDADE',pg_temp.audit(),'item1','Observação incorreta')$s$,'42501');
select pg_temp.assert_true(public.read_audit_change_items('AUDITOR_QUALIDADE',pg_temp.audit())='[]'::jsonb,'Another auditor does not see the items');
reset role;
select pg_temp.as_user(2);
set local role authenticated;
select pg_temp.assert_true(jsonb_array_length(public.read_audit_change_items('AUDITOR_QUALIDADE',pg_temp.audit()))=2,'Owner sees the audit items');
select pg_temp.expect_error($s$select public.request_audit_change('AUDITOR_QUALIDADE',pg_temp.audit(),'missing','Observação incorreta')$s$,'22023');
select pg_temp.expect_error($s$select public.request_audit_change('AUDITOR_QUALIDADE',pg_temp.audit(),'item1','  ')$s$,'22023');
select set_config('dialogo.test.request',(public.request_audit_change('AUDITOR_QUALIDADE',pg_temp.audit(),'item2',' Observação do cimento incorreta ')->>'id'),true);
create function pg_temp.request() returns uuid language sql as $f$ select current_setting('dialogo.test.request')::uuid $f$;
select pg_temp.expect_error($s$select public.request_audit_change('AUDITOR_QUALIDADE',pg_temp.audit(),'item1','Outro pedido simultâneo')$s$,'PT409');
select pg_temp.assert_true((public.read_audit_change_requests('AUDITOR_QUALIDADE',null,null,array[pg_temp.audit()])->0->>'status')='pending'
 and (public.read_audit_change_requests('AUDITOR_QUALIDADE',null,null,array[pg_temp.audit()])->0->>'reason')='Observação do cimento incorreta','Card shows the pending request with trimmed reason');
reset role;

-- Bell: the Administrativo of the discipline sees it; another discipline does not.
select pg_temp.as_user(7);
set local role authenticated;
select pg_temp.assert_true(public.read_audit_change_requests('ADMINISTRATIVO',null,'SEGURANCA')='[]'::jsonb,'Safety admin does not see Quality requests');
select pg_temp.expect_error($s$select public.decide_audit_change('SEGURANCA',pg_temp.request(),1,true)$s$,'42501');
select pg_temp.expect_error($s$select public.read_audit_change_source('SEGURANCA',pg_temp.request())$s$,'42501');
reset role;
select pg_temp.as_user(1);
set local role authenticated;
select pg_temp.assert_true(jsonb_array_length(public.read_audit_change_requests('ADMINISTRATIVO',null,'GERAL'))=1,'General admin sees the request');
select pg_temp.expect_error($s$select public.decide_audit_change('SEGURANCA',pg_temp.request(),1,true)$s$,'42501');
reset role;
select pg_temp.as_user(8);
set local role authenticated;
select pg_temp.assert_true(jsonb_array_length(public.read_audit_change_requests('ADMINISTRATIVO',null,'QUALIDADE'))=1,'Quality admin sees the request in the bell');
select pg_temp.expect_error($s$select public.decide_audit_change('QUALIDADE',pg_temp.request(),1,false,'  ')$s$,'22023');
select pg_temp.expect_error($s$select public.decide_audit_change('QUALIDADE',pg_temp.request(),9,true)$s$,'PT409');
select pg_temp.expect_error($s$select public.republish_audit_change('QUALIDADE',pg_temp.request(),1,pg_temp.responses('Texto original','Corrigido'),repeat('c',64)||'.pdf')$s$,'PT409');
select pg_temp.assert_true((public.decide_audit_change('QUALIDADE',pg_temp.request(),1,true)->>'status')='accepted','Quality admin accepts');
select pg_temp.expect_error($s$select public.decide_audit_change('QUALIDADE',pg_temp.request(),2,true)$s$,'PT409');
reset role;

-- While accepted, the action plan cannot be published with old findings.
select pg_temp.expect_error($s$insert into public.published_action_plans(audit_id,work_id,modulo,rows,revision,author_id,author_name,report_file_name)
 values(pg_temp.audit(),pg_temp.id(101),'QUALIDADE','[]',1,pg_temp.id(3),'Site engineer',repeat('e',64)||'.pdf')$s$,'55000');
set local role service_role;
select public.publication_command(pg_temp.id(3),'ENGENHARIA','EQUIPE_OBRA',null,'save-plan',pg_temp.audit(),0,
 '{"rows":[{"id":"item1","correctiveAction":"Corrigir","responsible":"Engenharia","startDate":"2026-10-01","dueDate":"2026-10-02"}]}');
reset role;

select pg_temp.as_user(8);
set local role authenticated;
select pg_temp.assert_true((public.read_audit_change_source('QUALIDADE',pg_temp.request())->'planDraft'->>'revision')='1'
 and (public.read_audit_change_source('QUALIDADE',pg_temp.request())->>'planPublished')='false','Source includes the plan draft');
select set_config('dialogo.test.overview',public.read_published_audit_overview_if_changed('ADMINISTRATIVO',null,'QUALIDADE')->>'revision',true);
-- Only notes of the requested item may change; the new PDF must exist; the plan draft must be rebuilt.
select pg_temp.expect_error($s$select public.republish_audit_change('QUALIDADE',pg_temp.request(),2,pg_temp.responses('Outro texto','Fora do especificado'),repeat('c',64)||'.pdf','[]')$s$,'22023');
select pg_temp.expect_error($s$select public.republish_audit_change('QUALIDADE',pg_temp.request(),2,jsonb_set(pg_temp.responses('Texto original','Corrigido'),'{item2,checks,0,compliant}','true'),repeat('c',64)||'.pdf','[]')$s$,'22023');
select pg_temp.expect_error($s$select public.republish_audit_change('QUALIDADE',pg_temp.request(),2,pg_temp.responses('Texto original','Corrigido'),repeat('c',64)||'.pdf','[]')$s$,'23514');
reset role;
insert into storage.objects(id,bucket_id,name) values(gen_random_uuid(),'published-audits',pg_temp.id(101)::text||'/'||pg_temp.audit()::text||'/'||repeat('c',64)||'.pdf');
select pg_temp.as_user(8);
set local role authenticated;
select pg_temp.expect_error($s$select public.republish_audit_change('QUALIDADE',pg_temp.request(),2,pg_temp.responses('Texto original','Corrigido'),repeat('c',64)||'.pdf')$s$,'22023');
select pg_temp.assert_true((public.republish_audit_change('QUALIDADE',pg_temp.request(),2,pg_temp.responses('Texto original','Cimento sem identificação'),repeat('c',64)||'.pdf',
 '[{"id":"item1","correctiveAction":"Corrigir","responsible":"Engenharia","startDate":"2026-10-01","dueDate":"2026-10-02"},{"id":"item2:c1","correctiveAction":"","responsible":"","startDate":"","dueDate":""}]')->>'status')='republished','Republication completes');
select pg_temp.assert_true((public.republish_audit_change('QUALIDADE',pg_temp.request(),2,pg_temp.responses('Texto original','Cimento sem identificação'),repeat('c',64)||'.pdf')->>'status')='republished','Retry returns the same republication');
select pg_temp.assert_true(public.read_published_audit_overview_if_changed('ADMINISTRATIVO',null,'QUALIDADE')->>'revision' <> current_setting('dialogo.test.overview'),'Dashboard fingerprint changes after republication');
select pg_temp.assert_true((public.read_published_audit_version_report(pg_temp.audit(),0,'ADMINISTRATIVO',null,'QUALIDADE')->>'reportFileName')=repeat('a',64)||'.pdf','Previous PDF is listed for the admin');
reset role;
select pg_temp.assert_true((select content_revision=1 and report_file_name=repeat('c',64)||'.pdf' and final_score=2.5
  and responses->'item1'->>'note'='Texto original' and responses->'item2'->'checks'->0->>'note'='Cimento sem identificação'
  and findings_summary::text like '%Cimento sem identificação%' from public.published_audits where id=pg_temp.audit()),'Only the item note, PDF and revision changed; findings follow');
select pg_temp.assert_true((select count(*)=1 and bool_and(content_revision=0 and report_file_name=repeat('a',64)||'.pdf' and responses->'item2'->'checks'->0->>'note'='Fora do especificado')
  from public.published_audit_versions where audit_id=pg_temp.audit()),'Previous version is kept');
select pg_temp.assert_true((select revision=2 and jsonb_array_length(rows)=2 from public.action_plan_drafts where audit_id=pg_temp.audit()),'Plan draft rebuilt with the new findings');
select pg_temp.assert_true((select status='republished' and previous_content_revision=0 and republished_by=pg_temp.id(8) from public.audit_change_requests where id=pg_temp.request()),'Request records who republished');

-- Old and new PDFs remain readable by the owner auditor; versions are immutable.
select pg_temp.as_user(2);
set local role authenticated;
select pg_temp.assert_true((select count(*)=2 from storage.objects where bucket_id='published-audits'),'Old and new PDFs are readable');
select pg_temp.assert_true((public.read_audit_change_requests('AUDITOR_QUALIDADE')->0->>'status')='republished','Auditor bell shows the republication');
reset role;
select pg_temp.expect_error('update public.published_audit_versions set report_file_name=report_file_name','55000');
select pg_temp.expect_error('delete from public.audit_change_requests','55000');
-- The immutability trigger still rejects every other update, even with the flag.
select pg_temp.expect_error('update public.published_audits set final_score=10','55000');
select set_config('dialogo.audit_republication',pg_temp.audit()::text,true);
select pg_temp.expect_error('update public.published_audits set final_score=10,content_revision=content_revision+1','55000');
select pg_temp.expect_error('update public.published_audits set responses=responses','55000');
select set_config('dialogo.audit_republication','',true);
select pg_temp.expect_error('delete from public.published_audits','55000');

-- A new request may be refused with a reason; then a published plan blocks requests.
select pg_temp.as_user(2);
set local role authenticated;
select set_config('dialogo.test.request',(public.request_audit_change('AUDITOR_QUALIDADE',pg_temp.audit(),'item1','Texto do item 01.03 incompleto')->>'id'),true);
reset role;
select pg_temp.as_user(8);
set local role authenticated;
select pg_temp.assert_true((public.decide_audit_change('QUALIDADE',pg_temp.request(),1,false,'Observação está correta')->>'refusalReason')='Observação está correta','Refusal keeps the reason');
select pg_temp.assert_true(public.read_audit_change_requests('ADMINISTRATIVO',null,'QUALIDADE')='[]'::jsonb,'Decided requests leave the admin bell');
reset role;
select pg_temp.as_user(2);
set local role authenticated;
select pg_temp.assert_true(jsonb_array_length(public.read_audit_change_requests('AUDITOR_QUALIDADE'))=2,'Auditor bell shows refusal and republication');
reset role;
insert into storage.objects(id,bucket_id,name) values(gen_random_uuid(),'action-plans',pg_temp.id(101)::text||'/'||pg_temp.audit()::text||'/'||repeat('b',64)||'.pdf');
set local role service_role;
select public.publication_command(pg_temp.id(3),'ENGENHARIA','EQUIPE_OBRA',null,'publish-plan',pg_temp.audit(),2,jsonb_build_object('reportFileName',repeat('b',64)||'.pdf'));
reset role;
select pg_temp.as_user(2);
set local role authenticated;
select pg_temp.expect_error($s$select public.request_audit_change('AUDITOR_QUALIDADE',pg_temp.audit(),'item1','Texto do item 01.03 incompleto')$s$,'55000');
reset role;
rollback;

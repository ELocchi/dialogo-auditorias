-- B8 isolated PostgreSQL upgrade suite. Never run against a hosted database.
-- Six Auth rows are committed before the upgrade; all B8 fixtures roll back.
begin;
do $test$
begin
  if current_setting('dialogo.test_database',true) is distinct from 'isolated-local'
    or session_user <> 'postgres' or exists(select 1 from auth.users) then
    raise exception 'Requires empty, disposable local database and postgres session';
  end if;
end;
$test$;
create function pg_temp.assert_true(result boolean, test_name text)
returns void language plpgsql as $test$
begin
  if result is distinct from true then raise exception 'Failed: %',test_name; end if;
end;
$test$;
create function pg_temp.expect_error(statement text, expected_state text, expected_message text default null)
returns void language plpgsql as $test$
declare actual_state text; actual_message text;
begin
  begin execute statement;
  exception when others then
    get stacked diagnostics actual_state=returned_sqlstate,actual_message=message_text;
  end;
  if actual_state is distinct from expected_state
    or (expected_message is not null and actual_message is distinct from expected_message) then
    raise exception 'Expected % / %, got % / % for %',expected_state,expected_message,actual_state,actual_message,statement;
  end if;
end;
$test$;
create function pg_temp.b8_baseline_state() returns jsonb language sql as $test$
  select jsonb_build_object(
    'auth',(select jsonb_agg(to_jsonb(u) order by id) from auth.users u),
    'requests',(select jsonb_agg(to_jsonb(r) order by auth_user_id) from public.access_requests r),
    'accounts',(select jsonb_agg(to_jsonb(a) order by auth_user_id) from public.access_accounts a),
    'works',(select jsonb_agg(to_jsonb(w) order by id) from public.access_works w),
    'work_changes',(select jsonb_agg(to_jsonb(c) order by id) from public.access_work_changes c),
    'grants',(select jsonb_agg(to_jsonb(g) order by auth_user_id,perfil,obra_id,modulo) from public.access_grants g),
    'decisions',(select jsonb_agg(to_jsonb(d) order by id) from public.access_decisions d),
    'visits',(select jsonb_agg(to_jsonb(v) order by id) from public.audit_visits v),
    'visit_events',(select jsonb_agg(to_jsonb(e) order by id) from public.audit_visit_events e),
    'visit_operations',(select jsonb_agg(to_jsonb(o) order by actor_auth_user_id,request_id) from dialogo_private.audit_visit_operations o));
$test$;
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 ('13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br','{"nome":"SQL B8 admin"}',clock_timestamp()),
 ('d1a80000-0000-4000-8000-000000000002','fixture.b8.dual@dialogo.com.br','{"nome":"SQL B8 dual auditor"}',clock_timestamp()),
 ('d1a80000-0000-4000-8000-000000000003','fixture.b8.other@dialogo.com.br','{"nome":"SQL B8 other auditor"}',clock_timestamp()),
 ('d1a80000-0000-4000-8000-000000000004','fixture.b8.site@dialogo.com.br','{"nome":"SQL B8 site team"}',clock_timestamp()),
 ('d1a80000-0000-4000-8000-000000000005','fixture.b8.pending@dialogo.com.br','{"nome":"SQL B8 pending"}',clock_timestamp()),
 ('d1a80000-0000-4000-8000-000000000006','fixture.b8.coord@dialogo.com.br','{"nome":"SQL B8 coordination"}',clock_timestamp());
select dialogo_private.bootstrap_first_administrator('13044e3f-e8d2-4b4b-9981-22a8de22c610',
 'emanuel.locchi@dialogo.com.br','Synthetic local bootstrap for catalog revision suite');
insert into public.access_works(id,nome,created_by) values
 ('d1a80000-0000-4000-8000-000000000101','SQL B8 work alpha','13044e3f-e8d2-4b4b-9981-22a8de22c610'),
 ('d1a80000-0000-4000-8000-000000000102','SQL B8 work beta','13044e3f-e8d2-4b4b-9981-22a8de22c610');
set local role authenticated;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select public.approve_access_request_v2('d1a80000-0000-4000-8000-000000000002',array['AUDITOR_SEGURANCA','AUDITOR_QUALIDADE'],null,
 '[{"perfil":"AUDITOR_SEGURANCA","obra_id":"d1a80000-0000-4000-8000-000000000101","modulo":"SEGURANCA"},
   {"perfil":"AUDITOR_QUALIDADE","obra_id":"d1a80000-0000-4000-8000-000000000102","modulo":"QUALIDADE"}]','Synthetic dual auditor');
select public.approve_access_request_v2('d1a80000-0000-4000-8000-000000000003',array['AUDITOR_SEGURANCA'],null,
 '[{"perfil":"AUDITOR_SEGURANCA","obra_id":"d1a80000-0000-4000-8000-000000000101","modulo":"SEGURANCA"}]','Synthetic other auditor');
select public.approve_access_request_v2('d1a80000-0000-4000-8000-000000000004',array['ENGENHARIA'],'EQUIPE_OBRA',
 '[{"perfil":"ENGENHARIA","obra_id":"d1a80000-0000-4000-8000-000000000101","modulo":"SEGURANCA"}]','Synthetic site engineering');
select public.approve_access_request_v2('d1a80000-0000-4000-8000-000000000006',array['ENGENHARIA'],'COORDENACAO',
 '[{"perfil":"ENGENHARIA","obra_id":"d1a80000-0000-4000-8000-000000000102","modulo":"QUALIDADE"}]','Synthetic engineering coordination');
select public.update_access_work('d1a80000-0000-4000-8000-000000000101',0,
 (select (to_jsonb(w)-array['id','ativo','created_at','created_by','revisao','updated_at','updated_by'])
   || '{"observacoes":"Synthetic B5 history preserved by B8"}'::jsonb
  from public.access_works w where id='d1a80000-0000-4000-8000-000000000101'));
select public.create_audit_visit('d1a80000-0000-4000-8000-000000000201','d1a80000-0000-4000-8000-000000000101',
 'SEGURANCA','security-it07-r02','d1a80000-0000-4000-8000-000000000002','2026-09-20','Synthetic B7 baseline');
select public.reschedule_audit_visit('d1a80000-0000-4000-8000-000000000202',
 (select id from public.audit_visits),1,'2026-09-21','Synthetic B7 reschedule');
set local "request.jwt.claim.sub"='d1a80000-0000-4000-8000-000000000002';
select public.confirm_audit_visit('d1a80000-0000-4000-8000-000000000203',(select id from public.audit_visits),2);
reset role;
set local "request.jwt.claim.sub"='';
create temporary table b8_before as select pg_temp.b8_baseline_state() payload;
commit;

-- MIGRATION_UPGRADE_BOUNDARY

begin;
select pg_temp.assert_true(pg_temp.b8_baseline_state()=(select payload from b8_before)
 and not exists(select 1 from public.audit_catalog_revisions)
 and not exists(select 1 from dialogo_private.audit_catalog_documents)
 and not exists(select 1 from dialogo_private.audit_catalog_operations),
 'C01 migration preserves B1-B7 identities, access, work history and confirmed agenda without seeding revisions');
do $test$
declare r text; t text; f text;
begin
  foreach r in array array['anon','authenticated','service_role'] loop
    foreach t in array array['public.audit_catalog_revisions','dialogo_private.audit_catalog_documents','dialogo_private.audit_catalog_operations'] loop
      perform pg_temp.assert_true(not has_table_privilege(r,t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
        'C02 API roles have no direct catalog, binary document or idempotency table privileges');
    end loop;
    foreach f in array array['public.save_audit_catalog_revision(uuid,text,integer,text,text,jsonb,text,text,text,text)',
      'public.read_audit_catalogs(text,text)','public.read_audit_catalog_document(text,boolean,uuid)'] loop
      perform pg_temp.assert_true(has_function_privilege(r,f,'EXECUTE')=(r='authenticated'),
        'C03 only authenticated executes catalog RPCs');
    end loop;
  end loop;
end;
$test$;
select pg_temp.assert_true((select count(*)=3 and bool_and(relrowsecurity) from pg_class
 where oid in ('public.audit_catalog_revisions'::regclass,'dialogo_private.audit_catalog_documents'::regclass,
 'dialogo_private.audit_catalog_operations'::regclass)), 'C04 all three catalog tables enable RLS');

create function pg_temp.b8_criteria() returns jsonb language sql immutable as $test$
  select '[{"id":"SQL-01","code":"1.1","title":"Synthetic criterion","text":"Inspect the synthetic item.",
    "group":"Synthetic group","subgroup":"Synthetic subgroup","source":"Synthetic source.pdf","locator":"page 1",
    "documentedWeight":0.5,"configuredWeight":1.25,"weightConfigurationId":"SQL-B8-WEIGHTS",
    "orientations":[{"id":"SQL-O1","scope":"criterion","text":"Synthetic orientation","pages":[1,2],"highlighted":true,"groups":["05","06"]}],
    "verificationRule":"Conforme/Não Conforme","sourceNote":"Synthetic source note","interpretation":"Synthetic interpretation"}]'::jsonb;
$test$;
create function pg_temp.b8_pdf(p_suffix text default 'original') returns text language sql immutable as $test$
  select encode(convert_to('%PDF-1.7 Synthetic SQL B8 '||p_suffix,'UTF8'),'base64');
$test$;
create function pg_temp.b8_docx() returns text language sql immutable as $test$
  select encode(decode('504b0304','hex')||convert_to('Synthetic SQL B8 DOCX','UTF8'),'base64');
$test$;
create function pg_temp.b8_save(p_request integer default 11,p_model text default 'security-it07-r02',
 p_expected integer default 0,p_criteria jsonb default pg_temp.b8_criteria(),p_label text default 'SQL B8 revision',
 p_note text default 'Synthetic catalog revision',p_pdf text default null,p_pdf_name text default null,
 p_original text default null,p_original_name text default null)
returns uuid language sql as $test$
  select public.save_audit_catalog_revision(('d1a80000-0000-4000-8000-'||lpad(p_request::text,12,'0'))::uuid,
    p_model,p_expected,p_label,p_note,p_criteria,p_pdf,p_pdf_name,p_original,p_original_name);
$test$;
create function pg_temp.b8_catalog_state() returns jsonb language sql as $test$
  select jsonb_build_object(
    'revisions',(select jsonb_agg(to_jsonb(r) order by id) from public.audit_catalog_revisions r),
    'documents',(select jsonb_agg(to_jsonb(d) order by revision_id) from dialogo_private.audit_catalog_documents d),
    'operations',(select jsonb_agg(to_jsonb(o) order by actor_auth_user_id,request_id) from dialogo_private.audit_catalog_operations o));
$test$;
create temporary table b8_ids(label text primary key,id uuid not null);
grant select,insert on b8_ids to authenticated;

set local role anon;
select pg_temp.expect_error($sql$select public.read_audit_catalogs('ADMINISTRATIVO')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_audit_catalog_document('security-it07-r02')$sql$,'42501');
select pg_temp.expect_error($sql$select pg_temp.b8_save()$sql$,'42501');
reset role;
set local role service_role;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select pg_temp.expect_error($sql$select public.read_audit_catalogs('ADMINISTRATIVO')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_audit_catalog_document('security-it07-r02')$sql$,'42501');
select pg_temp.expect_error($sql$select pg_temp.b8_save()$sql$,'42501');
reset role;
set local role authenticated;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select pg_temp.assert_true(public.read_audit_catalogs('ADMINISTRATIVO')='[]'::jsonb
 and public.read_audit_catalog_document('security-it07-r02') is null,
 'C05 no saved revision or document is invented before the first save');
select pg_temp.expect_error($sql$select * from public.audit_catalog_revisions$sql$,'42501');
select pg_temp.expect_error($sql$select * from dialogo_private.audit_catalog_documents$sql$,'42501');
select pg_temp.expect_error($sql$select * from dialogo_private.audit_catalog_operations$sql$,'42501');
select pg_temp.expect_error($sql$insert into public.audit_catalog_revisions default values$sql$,'42501');
select pg_temp.expect_error($sql$update public.audit_catalog_revisions set revision_label='Forbidden'$sql$,'42501');
select pg_temp.expect_error($sql$delete from public.audit_catalog_revisions$sql$,'42501');
select pg_temp.expect_error($sql$truncate public.audit_catalog_revisions$sql$,'42501');

insert into b8_ids values('security-v1',pg_temp.b8_save(11,p_pdf=>pg_temp.b8_pdf(),p_pdf_name=>'SQL-B8.PDF',
 p_original=>pg_temp.b8_docx(),p_original_name=>'SQL-B8.DOCX'));
select pg_temp.assert_true(pg_temp.b8_save(11,p_pdf=>pg_temp.b8_pdf(),p_pdf_name=>'SQL-B8.PDF',
 p_original=>pg_temp.b8_docx(),p_original_name=>'SQL-B8.DOCX')=(select id from b8_ids where label='security-v1'),
 'C06 identical request returns the same saved revision');
select pg_temp.assert_true((select c->>'id'=(select id::text from b8_ids where label='security-v1')
 and c->>'version'='1' and c->>'label'='SQL B8 revision' and c->>'changeNote'='Synthetic catalog revision'
 and c->'criteria'=pg_temp.b8_criteria() and c->>'createdAt' is not null
 from jsonb_array_elements(public.read_audit_catalogs('ADMINISTRATIVO')) c where c->>'modelId'='security-it07-r02'),
 'C07 latest metadata and all Criterion fields round-trip without weakening weights or source detail');
insert into b8_ids values('quality-f175-v1',pg_temp.b8_save(12,'quality-f175'));
insert into b8_ids values('quality-f176-v1',pg_temp.b8_save(13,'quality-f176',p_pdf=>pg_temp.b8_pdf('quality'),p_pdf_name=>'quality.pdf'));
select pg_temp.assert_true(jsonb_array_length(public.read_audit_catalogs('ADMINISTRATIVO'))=3
 and public.read_audit_catalog_document('quality-f175') is null
 and public.read_audit_catalog_document('quality-f175',true) is null,
 'C08 three model slugs are supported, and a first revision without a document has no document');
select pg_temp.assert_true(public.read_audit_catalog_document('security-it07-r02')=
 jsonb_build_object('name','SQL-B8.PDF','contentType','application/pdf','base64',pg_temp.b8_pdf())
 and public.read_audit_catalog_document('security-it07-r02',true)=
 jsonb_build_object('name','SQL-B8.DOCX','contentType','application/vnd.openxmlformats-officedocument.wordprocessingml.document','base64',pg_temp.b8_docx())
 and public.read_audit_catalog_document('quality-f176',true)=public.read_audit_catalog_document('quality-f176'),
 'C09 PDFs and DOCX originals retain their exact bytes/names; a PDF-only original falls back to PDF');

insert into b8_ids values('security-v2',pg_temp.b8_save(14,p_expected=>1,p_note=>'Weights changed, existing source retained'));
select pg_temp.assert_true(public.read_audit_catalog_document('security-it07-r02')->>'base64'=pg_temp.b8_pdf()
 and public.read_audit_catalog_document('security-it07-r02',true)->>'base64'=pg_temp.b8_docx(),
 'C10 saving without an upload inherits both the preceding PDF and original');
insert into b8_ids values('security-v3',pg_temp.b8_save(15,p_expected=>2,p_pdf=>pg_temp.b8_pdf('replacement'),p_pdf_name=>'replacement.pdf'));
insert into b8_ids values('security-v4',pg_temp.b8_save(16,p_expected=>3,p_note=>'Inherit the replacement document'));
select pg_temp.assert_true(public.read_audit_catalog_document('security-it07-r02')=
 jsonb_build_object('name','replacement.pdf','contentType','application/pdf','base64',pg_temp.b8_pdf('replacement'))
 and public.read_audit_catalog_document('security-it07-r02',true)=public.read_audit_catalog_document('security-it07-r02')
 and public.read_audit_catalog_document('security-it07-r02',false,(select id from b8_ids where label='security-v1'))->>'base64'=pg_temp.b8_pdf()
 and public.read_audit_catalog_document('security-it07-r02',true,(select id from b8_ids where label='security-v1'))->>'base64'=pg_temp.b8_docx(),
 'C11 a new PDF drops the previous original, later inheritance preserves that fallback, and historical reads stay exact');
select pg_temp.assert_true(pg_temp.b8_save(11,p_pdf=>pg_temp.b8_pdf(),p_pdf_name=>'SQL-B8.PDF',
 p_original=>pg_temp.b8_docx(),p_original_name=>'SQL-B8.DOCX')=(select id from b8_ids where label='security-v1')
 and (select c->>'version'='4' from jsonb_array_elements(public.read_audit_catalogs('ADMINISTRATIVO')) c where c->>'modelId'='security-it07-r02'),
 'C12 replay of an old applied request succeeds without replacing the latest revision');
select pg_temp.expect_error($sql$select pg_temp.b8_save(17,p_expected=>1)$sql$,'40001','catalog_revision_conflict');
select pg_temp.expect_error($sql$select pg_temp.b8_save(11,p_note=>'Changed request payload')$sql$,'22023','catalog_request_id_reused');
select pg_temp.expect_error($sql$select pg_temp.b8_save(11,'quality-f175')$sql$,'22023','catalog_request_id_reused');
select pg_temp.expect_error($sql$select pg_temp.b8_save(11,p_pdf=>pg_temp.b8_pdf('different bytes'),p_pdf_name=>'SQL-B8.PDF',p_original=>pg_temp.b8_docx(),p_original_name=>'SQL-B8.DOCX')$sql$,
 '22023','catalog_request_id_reused');
reset role;
select pg_temp.assert_true((select count(*)=6 from public.audit_catalog_revisions)
 and (select count(*)=6 from dialogo_private.audit_catalog_operations)
 and (select bool_and(created_by='13044e3f-e8d2-4b4b-9981-22a8de22c610' and created_at is not null and version>=1)
  from public.audit_catalog_revisions)
 and (select count(distinct (model_id,version))=count(*) and count(distinct (created_by,request_id))=count(*) from public.audit_catalog_revisions),
 'C13 retries/conflicts create no duplicates and all revisions use the verified server actor');

set local role authenticated;
set local "request.jwt.claim.sub"='d1a80000-0000-4000-8000-000000000002';
select pg_temp.assert_true(jsonb_array_length(public.read_audit_catalogs('AUDITOR_SEGURANCA'))=1
 and public.read_audit_catalogs('AUDITOR_SEGURANCA')->0->>'modelId'='security-it07-r02'
 and public.read_audit_catalogs('AUDITOR_SEGURANCA')->0->'criteria'=pg_temp.b8_criteria()
 and jsonb_array_length(public.read_audit_catalogs('AUDITOR_QUALIDADE'))=2
 and (select bool_and(c->>'modelId' in ('quality-f175','quality-f176') and c->'criteria'=pg_temp.b8_criteria())
   from jsonb_array_elements(public.read_audit_catalogs('AUDITOR_QUALIDADE')) c),
 'C14 selected auditor profile sees only its granted discipline, preserving technical weights');
select pg_temp.expect_error($sql$select public.read_audit_catalogs('ADMINISTRATIVO')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_audit_catalogs('AUDITOR_SEGURANCA','EQUIPE_OBRA')$sql$,'42501');
select pg_temp.expect_error($sql$select pg_temp.b8_save(70,p_expected=>4)$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_audit_catalog_document('security-it07-r02')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_audit_catalog_document('security-it07-r02',true,(select id from b8_ids where label='security-v1'))$sql$,'42501');
set local "request.jwt.claim.sub"='d1a80000-0000-4000-8000-000000000004';
select pg_temp.assert_true(jsonb_array_length(public.read_audit_catalogs('ENGENHARIA','EQUIPE_OBRA'))=1
 and public.read_audit_catalogs('ENGENHARIA','EQUIPE_OBRA')->0->>'modelId'='security-it07-r02'
 and public.read_audit_catalogs('ENGENHARIA','EQUIPE_OBRA')->0->'criteria'=
   jsonb_build_array(((pg_temp.b8_criteria()->0)-array['configuredWeight','weightConfigurationId'])||'{"documentedWeight":null}'::jsonb),
 'C15 site Engineering receives exact non-weight criteria with documentedWeight null and configured fields removed');
select pg_temp.expect_error($sql$select public.read_audit_catalogs('ENGENHARIA','COORDENACAO')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_audit_catalogs('ENGENHARIA')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_audit_catalogs('AUDITOR_SEGURANCA')$sql$,'42501');
select pg_temp.expect_error($sql$select pg_temp.b8_save(70,p_expected=>4)$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_audit_catalog_document('security-it07-r02')$sql$,'42501');
select pg_temp.expect_error($sql$select * from public.audit_catalog_revisions$sql$,'42501');
set local "request.jwt.claim.sub"='d1a80000-0000-4000-8000-000000000006';
select pg_temp.assert_true(jsonb_array_length(public.read_audit_catalogs('ENGENHARIA','COORDENACAO'))=2
 and (select bool_and(c->>'modelId' in ('quality-f175','quality-f176')
   and c->'criteria'=jsonb_build_array(((pg_temp.b8_criteria()->0)-array['configuredWeight','weightConfigurationId'])||'{"documentedWeight":null}'::jsonb))
  from jsonb_array_elements(public.read_audit_catalogs('ENGENHARIA','COORDENACAO')) c),
 'C16 valid Coordination scope reads only its granted discipline and gets the same weight redaction');
select pg_temp.expect_error($sql$select public.read_audit_catalogs('ENGENHARIA','EQUIPE_OBRA')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_audit_catalog_document('quality-f175')$sql$,'42501');
set local "request.jwt.claim.sub"='d1a80000-0000-4000-8000-000000000005';
select pg_temp.expect_error($sql$select public.read_audit_catalogs('ADMINISTRATIVO')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_audit_catalogs('AUDITOR_SEGURANCA')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_audit_catalog_document('security-it07-r02')$sql$,'42501');
select pg_temp.expect_error($sql$select pg_temp.b8_save(70,p_expected=>4)$sql$,'42501');
set local "request.jwt.claim.sub"='';
select pg_temp.expect_error($sql$select public.read_audit_catalogs('ADMINISTRATIVO')$sql$,'42501');
select pg_temp.expect_error($sql$select pg_temp.b8_save(70,p_expected=>4)$sql$,'42501');
reset role;

savepoint b8_revoked_grants;
delete from public.access_grants where auth_user_id='d1a80000-0000-4000-8000-000000000002' and perfil='AUDITOR_SEGURANCA';
delete from public.access_grants where auth_user_id='d1a80000-0000-4000-8000-000000000004';
set local role authenticated;
set local "request.jwt.claim.sub"='d1a80000-0000-4000-8000-000000000002';
select pg_temp.assert_true(public.read_audit_catalogs('AUDITOR_SEGURANCA')='[]'::jsonb
 and jsonb_array_length(public.read_audit_catalogs('AUDITOR_QUALIDADE'))=2,
 'C17 revoked auditor module grant removes only that module immediately');
set local "request.jwt.claim.sub"='d1a80000-0000-4000-8000-000000000004';
select pg_temp.assert_true(public.read_audit_catalogs('ENGENHARIA','EQUIPE_OBRA')='[]'::jsonb,
 'C18 Engineering profile alone supplies no implied catalog grant');
reset role;
rollback to savepoint b8_revoked_grants;
savepoint b8_inactive_work;
update public.access_works set ativo=false where id='d1a80000-0000-4000-8000-000000000101';
set local role authenticated;
set local "request.jwt.claim.sub"='d1a80000-0000-4000-8000-000000000002';
select pg_temp.assert_true(public.read_audit_catalogs('AUDITOR_SEGURANCA')='[]'::jsonb,
 'C19 inactive work no longer supplies a discipline grant');
reset role;
rollback to savepoint b8_inactive_work;
savepoint b8_inactive_identity;
update public.access_accounts set ativo=false where auth_user_id in
 ('13044e3f-e8d2-4b4b-9981-22a8de22c610','d1a80000-0000-4000-8000-000000000002');
set local role authenticated;
set local "request.jwt.claim.sub"='d1a80000-0000-4000-8000-000000000002';
select pg_temp.expect_error($sql$select public.read_audit_catalogs('AUDITOR_SEGURANCA')$sql$,'42501');
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select pg_temp.expect_error($sql$select public.read_audit_catalogs('ADMINISTRATIVO')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_audit_catalog_document('security-it07-r02')$sql$,'42501');
select pg_temp.expect_error($sql$select pg_temp.b8_save(14,p_expected=>1,p_note=>'Weights changed, existing source retained')$sql$,'42501');
reset role;
rollback to savepoint b8_inactive_identity;
savepoint b8_unconfirmed_identity;
update auth.users set email_confirmed_at=null where id='13044e3f-e8d2-4b4b-9981-22a8de22c610';
set local role authenticated;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select pg_temp.expect_error($sql$select public.read_audit_catalogs('ADMINISTRATIVO')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_audit_catalog_document('security-it07-r02',true)$sql$,'42501');
select pg_temp.expect_error($sql$select pg_temp.b8_save(14,p_expected=>1,p_note=>'Weights changed, existing source retained')$sql$,'42501');
reset role;
rollback to savepoint b8_unconfirmed_identity;
savepoint b8_banned_identity;
update auth.users set banned_until=clock_timestamp()+interval '1 day' where id='13044e3f-e8d2-4b4b-9981-22a8de22c610';
set local role authenticated;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select pg_temp.expect_error($sql$select public.read_audit_catalogs('ADMINISTRATIVO')$sql$,'42501');
select pg_temp.expect_error($sql$select pg_temp.b8_save(70,p_expected=>4)$sql$,'42501');
reset role;
rollback to savepoint b8_banned_identity;

set local role authenticated;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select pg_temp.expect_error($sql$select public.read_audit_catalogs(null)$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_audit_catalogs('UNKNOWN')$sql$,'42501');
select pg_temp.expect_error($sql$select public.read_audit_catalogs('ADMINISTRATIVO','COORDENACAO')$sql$,'42501');
select pg_temp.expect_error($sql$select public.save_audit_catalog_revision(null,'security-it07-r02',4,'Revision','Change',pg_temp.b8_criteria())$sql$,'22023');
select pg_temp.expect_error($sql$select pg_temp.b8_save(90,null,4)$sql$,'22023');
select pg_temp.expect_error($sql$select pg_temp.b8_save(90,'unknown',4)$sql$,'22023');
select pg_temp.expect_error($sql$select pg_temp.b8_save(90,p_expected=>null)$sql$,'22023');
select pg_temp.expect_error($sql$select pg_temp.b8_save(90,p_expected=>-1)$sql$,'22023');
select pg_temp.expect_error($sql$select pg_temp.b8_save(90,p_expected=>2147483647)$sql$,'22023');
select pg_temp.expect_error($sql$select pg_temp.b8_save(90,p_expected=>4,p_label=>null)$sql$,'22023');
select pg_temp.expect_error($sql$select pg_temp.b8_save(90,p_expected=>4,p_label=>'  ')$sql$,'22023');
select pg_temp.expect_error($sql$select pg_temp.b8_save(90,p_expected=>4,p_label=>repeat('x',81))$sql$,'22023');
select pg_temp.expect_error($sql$select pg_temp.b8_save(90,p_expected=>4,p_note=>null)$sql$,'22023');
select pg_temp.expect_error($sql$select pg_temp.b8_save(90,p_expected=>4,p_note=>' ')$sql$,'22023');
select pg_temp.expect_error($sql$select pg_temp.b8_save(90,p_expected=>4,p_note=>repeat('x',2001))$sql$,'22023');

-- Validate through the public RPC, not solely by invoking its private predicate.
do $test$
declare bad jsonb; base jsonb:=pg_temp.b8_criteria()->0; field text;
begin
  foreach field in array array['id','code','title','text','group','subgroup','source','locator','documentedWeight','orientations'] loop
    perform pg_temp.expect_error(format('select pg_temp.b8_save(90,p_expected=>4,p_criteria=>%L::jsonb)',jsonb_build_array(base-field)::text),
      '22023','invalid_catalog_criteria');
  end loop;
  foreach field in array array['id','code','title','text','group','subgroup','source','locator','weightConfigurationId','verificationRule','sourceNote','interpretation'] loop
    perform pg_temp.expect_error(format('select pg_temp.b8_save(90,p_expected=>4,p_criteria=>%L::jsonb)',jsonb_build_array(base||jsonb_build_object(field,42))::text),
      '22023','invalid_catalog_criteria');
  end loop;
  for bad in select value from jsonb_array_elements(jsonb_build_array(
    'null'::jsonb,'{}'::jsonb,'[]'::jsonb,'[null]'::jsonb,'[3]'::jsonb,'["item"]'::jsonb,
    jsonb_build_array(base||'{"unexpected":"field"}'::jsonb),
    jsonb_build_array(base||'{"id":" "}'::jsonb),
    jsonb_build_array(base||'{"code":""}'::jsonb),
    jsonb_build_array(base||'{"title":null}'::jsonb),
    jsonb_build_array(base||'{"documentedWeight":-0.1}'::jsonb),
    jsonb_build_array(base||'{"documentedWeight":1000.1}'::jsonb),
    jsonb_build_array(base||'{"documentedWeight":"1"}'::jsonb),
    jsonb_build_array(base||'{"configuredWeight":null}'::jsonb),
    jsonb_build_array(base||'{"configuredWeight":-1}'::jsonb),
    jsonb_build_array(base||'{"configuredWeight":1001}'::jsonb),
    jsonb_build_array(base||'{"configuredWeight":true}'::jsonb),
    jsonb_build_array(base||'{"orientations":{}}'::jsonb),
    jsonb_build_array(base||'{"orientations":[null]}'::jsonb),
    jsonb_build_array(base||jsonb_build_object('orientations',jsonb_build_array((base->'orientations'->0)-'pages'))),
    jsonb_build_array(base||jsonb_build_object('orientations',jsonb_build_array((base->'orientations'->0)||'{"extra":true}'::jsonb))),
    jsonb_build_array(base||jsonb_build_object('orientations',jsonb_build_array((base->'orientations'->0)||'{"highlighted":"true"}'::jsonb))),
    jsonb_build_array(base||jsonb_build_object('orientations',jsonb_build_array((base->'orientations'->0)||'{"pages":["1"]}'::jsonb))),
    jsonb_build_array(base||jsonb_build_object('orientations',jsonb_build_array((base->'orientations'->0)||'{"pages":[0]}'::jsonb))),
    jsonb_build_array(base||jsonb_build_object('orientations',jsonb_build_array((base->'orientations'->0)||'{"pages":[1.5]}'::jsonb))),
    jsonb_build_array(base||jsonb_build_object('orientations',jsonb_build_array((base->'orientations'->0)||'{"pages":[10000]}'::jsonb))),
    jsonb_build_array(base||jsonb_build_object('orientations',jsonb_build_array((base->'orientations'->0)||'{"groups":null}'::jsonb))),
    jsonb_build_array(base||jsonb_build_object('orientations',jsonb_build_array((base->'orientations'->0)||'{"groups":"05"}'::jsonb))),
    jsonb_build_array(base||jsonb_build_object('orientations',jsonb_build_array((base->'orientations'->0)||'{"groups":[5]}'::jsonb))),
    jsonb_build_array(base||jsonb_build_object('orientations',jsonb_build_array((base->'orientations'->0)||jsonb_build_object('groups',jsonb_build_array(repeat('x',101)))))),
    jsonb_build_array(base,base||'{"code":"different-code"}'::jsonb),
    jsonb_build_array(base,base||'{"id":"different-id"}'::jsonb)
  )) loop
    perform pg_temp.expect_error(format('select pg_temp.b8_save(90,p_expected=>4,p_criteria=>%L::jsonb)',bad::text),
      '22023','invalid_catalog_criteria');
  end loop;
end;
$test$;
select pg_temp.expect_error($sql$select pg_temp.b8_save(90,p_expected=>4,p_criteria=>null)$sql$,'22023','invalid_catalog_criteria');
select pg_temp.expect_error($sql$select pg_temp.b8_save(90,p_expected=>4,p_criteria=>jsonb_set(pg_temp.b8_criteria(),'{0,orientations,0,groups}',(select jsonb_agg('GROUP-'||n) from generate_series(1,101) n)))$sql$,
 '22023','invalid_catalog_criteria');
select pg_temp.expect_error($sql$select pg_temp.b8_save(90,p_expected=>4,p_criteria=>(select jsonb_agg((pg_temp.b8_criteria()->0)||jsonb_build_object('id','ITEM-'||n,'code','CODE-'||n)) from generate_series(1,501) n))$sql$,
 '22023','invalid_catalog_criteria');
select pg_temp.expect_error($sql$select pg_temp.b8_save(90,p_expected=>4,p_criteria=>(select jsonb_agg((pg_temp.b8_criteria()->0)||jsonb_build_object('id','ITEM-'||n,'code','CODE-'||n,'text',repeat('x',30000))) from generate_series(1,150) n))$sql$,
 '22023','invalid_catalog_criteria');
select pg_temp.expect_error($sql$select pg_temp.b8_save(90,p_expected=>4,p_criteria=>jsonb_set(pg_temp.b8_criteria(),'{0,text}',to_jsonb(repeat('x',30001))))$sql$,
 '22023','invalid_catalog_criteria');

select pg_temp.expect_error($sql$select pg_temp.b8_save(90,p_expected=>4,p_pdf_name=>'orphan.pdf')$sql$,'22023','invalid_catalog_document');
select pg_temp.expect_error($sql$select pg_temp.b8_save(90,p_expected=>4,p_original=>pg_temp.b8_docx(),p_original_name=>'orphan.docx')$sql$,'22023','invalid_catalog_document');
select pg_temp.expect_error($sql$select pg_temp.b8_save(90,p_expected=>4,p_pdf=>pg_temp.b8_pdf())$sql$,'22023','invalid_catalog_document');
select pg_temp.expect_error($sql$select pg_temp.b8_save(90,p_expected=>4,p_pdf=>'***',p_pdf_name=>'invalid.pdf')$sql$,'22023','invalid_catalog_document');
select pg_temp.expect_error($sql$select pg_temp.b8_save(90,p_expected=>4,p_pdf=>'',p_pdf_name=>'empty.pdf')$sql$,'22023','invalid_catalog_document');
select pg_temp.expect_error($sql$select pg_temp.b8_save(90,p_expected=>4,p_pdf=>encode(convert_to('not PDF bytes','UTF8'),'base64'),p_pdf_name=>'invalid.pdf')$sql$,'22023','invalid_catalog_document');
select pg_temp.expect_error($sql$select pg_temp.b8_save(90,p_expected=>4,p_pdf=>encode(convert_to('%PDF-'||repeat('x',5242876),'UTF8'),'base64'),p_pdf_name=>'too-large.pdf')$sql$,'22023','invalid_catalog_document');
select pg_temp.expect_error($sql$select pg_temp.b8_save(90,p_expected=>4,p_pdf=>pg_temp.b8_pdf(),p_pdf_name=>'valid.pdf',p_original=>pg_temp.b8_docx())$sql$,'22023','invalid_catalog_document');
select pg_temp.expect_error($sql$select pg_temp.b8_save(90,p_expected=>4,p_pdf=>pg_temp.b8_pdf(),p_pdf_name=>'valid.pdf',p_original_name=>'orphan.docx')$sql$,'22023','invalid_catalog_document');
select pg_temp.expect_error($sql$select pg_temp.b8_save(90,p_expected=>4,p_pdf=>pg_temp.b8_pdf(),p_pdf_name=>'valid.pdf',p_original=>'???',p_original_name=>'invalid.docx')$sql$,'22023','invalid_catalog_document');
select pg_temp.expect_error($sql$select pg_temp.b8_save(90,p_expected=>4,p_pdf=>pg_temp.b8_pdf(),p_pdf_name=>'valid.pdf',p_original=>pg_temp.b8_pdf(),p_original_name=>'invalid.docx')$sql$,'22023','invalid_catalog_document');
select pg_temp.expect_error($sql$select pg_temp.b8_save(90,p_expected=>4,p_pdf=>pg_temp.b8_pdf(),p_pdf_name=>'valid.pdf',p_original=>encode(decode('504b0304','hex')||convert_to(repeat('x',2097149),'UTF8'),'base64'),p_original_name=>'too-large.docx')$sql$,'22023','invalid_catalog_document');
do $test$
declare bad_name text;
begin
  foreach bad_name in array array['../escape.pdf','folder/file.pdf',E'folder\\file.pdf','wrong.docx','hidden.pdf.exe','',repeat('x',177)||'.pdf',E'line\nbreak.pdf'] loop
    perform pg_temp.expect_error(format('select pg_temp.b8_save(90,p_expected=>4,p_pdf=>pg_temp.b8_pdf(),p_pdf_name=>%L)',bad_name),
      '22023','invalid_catalog_document');
  end loop;
  foreach bad_name in array array['../escape.docx','folder/file.docx',E'folder\\file.docx','wrong.pdf','hidden.docx.exe','',repeat('x',176)||'.docx'] loop
    perform pg_temp.expect_error(format('select pg_temp.b8_save(90,p_expected=>4,p_pdf=>pg_temp.b8_pdf(),p_pdf_name=>''valid.pdf'',p_original=>pg_temp.b8_docx(),p_original_name=>%L)',bad_name),
      '22023','invalid_catalog_document');
  end loop;
end;
$test$;
select pg_temp.expect_error($sql$select public.read_audit_catalog_document('unknown')$sql$,'22023');
select pg_temp.expect_error($sql$select public.read_audit_catalog_document('security-it07-r02',null)$sql$,'22023');
select pg_temp.expect_error($sql$select public.read_audit_catalog_document('quality-f175',false,(select id from b8_ids where label='security-v1'))$sql$,'22023','invalid_catalog_document_revision');
select pg_temp.expect_error($sql$select public.read_audit_catalog_document('security-it07-r02',false,'d1a80000-0000-4000-8000-000000000999')$sql$,'22023','invalid_catalog_document_revision');
reset role;
select pg_temp.assert_true((select count(*)=6 from public.audit_catalog_revisions)
 and (select count(*)=6 from dialogo_private.audit_catalog_operations)
 and not exists(select 1 from dialogo_private.audit_catalog_operations where request_id='d1a80000-0000-4000-8000-000000000090'),
 'C20 invalid criteria, revisions and documents neither append history nor consume retry keys');

savepoint b8_valid_boundaries;
set local role authenticated;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select pg_temp.b8_save(90,p_expected=>4,p_criteria=>(select jsonb_agg((pg_temp.b8_criteria()->0)
 ||jsonb_build_object('id','ITEM-'||n,'code','CODE-'||n,'documentedWeight',0,'configuredWeight',1000)) from generate_series(1,500) n));
select pg_temp.assert_true((select jsonb_array_length(c->'criteria')=500
 from jsonb_array_elements(public.read_audit_catalogs('ADMINISTRATIVO')) c where c->>'modelId'='security-it07-r02'),
 'C21 500 unique criteria and both inclusive weight bounds are accepted');
select pg_temp.b8_save(91,p_expected=>5,p_criteria=>jsonb_build_array((pg_temp.b8_criteria()->0)
 -array['configuredWeight','weightConfigurationId','verificationRule','sourceNote','interpretation']
 ||'{"documentedWeight":null,"subgroup":"","locator":"","orientations":[]}'::jsonb),
 p_pdf=>encode(convert_to('%PDF-'||repeat('x',5242875),'UTF8'),'base64'),p_pdf_name=>repeat('x',176)||'.pdf',
 p_original=>encode(decode('504b0304','hex')||convert_to(repeat('x',2097148),'UTF8'),'base64'),p_original_name=>repeat('x',175)||'.docx');
select pg_temp.assert_true(octet_length(decode(public.read_audit_catalog_document('security-it07-r02')->>'base64','base64'))=5242880
 and octet_length(decode(public.read_audit_catalog_document('security-it07-r02',true)->>'base64','base64'))=2097152,
 'C22 exact 5 MiB PDF, 2 MiB DOCX, 180-character names and nullable documented weight are accepted');
reset role;
rollback to savepoint b8_valid_boundaries;

select pg_temp.expect_error($sql$insert into public.audit_catalog_revisions(model_id,version,revision_label,change_note,criteria,created_by,request_id)
 values('security-it07-r02',4,'Duplicate version','Synthetic conflict',pg_temp.b8_criteria(),'13044e3f-e8d2-4b4b-9981-22a8de22c610','d1a80000-0000-4000-8000-000000000090')$sql$,'23505');
select pg_temp.expect_error($sql$insert into public.audit_catalog_revisions(model_id,version,revision_label,change_note,criteria,created_by,request_id)
 values('security-it07-r02',5,'Duplicate request','Synthetic conflict',pg_temp.b8_criteria(),'13044e3f-e8d2-4b4b-9981-22a8de22c610','d1a80000-0000-4000-8000-000000000011')$sql$,'23505');
select pg_temp.expect_error($sql$insert into public.audit_catalog_revisions(model_id,version,revision_label,change_note,criteria,created_by,request_id)
 values('security-it07-r02',0,'Invalid version','Synthetic constraint',pg_temp.b8_criteria(),'13044e3f-e8d2-4b4b-9981-22a8de22c610','d1a80000-0000-4000-8000-000000000090')$sql$,'23514');
select pg_temp.expect_error($sql$insert into public.audit_catalog_revisions(model_id,version,revision_label,change_note,criteria,created_by,request_id)
 values('unknown',1,'Invalid model','Synthetic constraint',pg_temp.b8_criteria(),'13044e3f-e8d2-4b4b-9981-22a8de22c610','d1a80000-0000-4000-8000-000000000090')$sql$,'23514');
select pg_temp.expect_error($sql$insert into public.audit_catalog_revisions(model_id,version,revision_label,change_note,criteria,created_by,request_id)
 values('security-it07-r02',5,'Invalid criteria','Synthetic constraint','[]','13044e3f-e8d2-4b4b-9981-22a8de22c610','d1a80000-0000-4000-8000-000000000090')$sql$,'23514');

create temporary table b8_atomic_before as select pg_temp.b8_catalog_state() payload;
create function pg_temp.reject_b8_catalog_write() returns trigger language plpgsql as $test$
begin raise exception using errcode='P0088',message='Synthetic catalog document/operation failure'; end;
$test$;
create trigger b8_reject_document before insert on dialogo_private.audit_catalog_documents
 for each row execute function pg_temp.reject_b8_catalog_write();
set local role authenticated;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select pg_temp.expect_error($sql$select pg_temp.b8_save(91,p_expected=>4,p_pdf=>pg_temp.b8_pdf('atomic'),p_pdf_name=>'atomic.pdf')$sql$,'P0088');
reset role;
select pg_temp.assert_true(pg_temp.b8_catalog_state()=(select payload from b8_atomic_before),
 'C23 failed document insertion rolls back the revision and does not consume its retry key');
drop trigger b8_reject_document on dialogo_private.audit_catalog_documents;
create trigger b8_reject_operation before insert on dialogo_private.audit_catalog_operations
 for each row execute function pg_temp.reject_b8_catalog_write();
set local role authenticated;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select pg_temp.expect_error($sql$select pg_temp.b8_save(92,p_expected=>4,p_pdf=>pg_temp.b8_pdf('atomic'),p_pdf_name=>'atomic.pdf')$sql$,'P0088');
reset role;
select pg_temp.assert_true(pg_temp.b8_catalog_state()=(select payload from b8_atomic_before),
 'C24 failed operation insertion rolls back the revision, binary document and retry key together');
drop trigger b8_reject_operation on dialogo_private.audit_catalog_operations;
set local role authenticated;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
insert into b8_ids values('security-v5',pg_temp.b8_save(91,p_expected=>4,p_pdf=>pg_temp.b8_pdf('atomic'),p_pdf_name=>'atomic.pdf'));
select pg_temp.assert_true(pg_temp.b8_save(91,p_expected=>4,p_pdf=>pg_temp.b8_pdf('atomic'),p_pdf_name=>'atomic.pdf')=
 (select id from b8_ids where label='security-v5')
 and (select c->>'version'='5' from jsonb_array_elements(public.read_audit_catalogs('ADMINISTRATIVO')) c where c->>'modelId'='security-it07-r02'),
 'C25 the same request succeeds once after the injected failure is removed');
reset role;
select pg_temp.expect_error($sql$update public.audit_catalog_revisions set revision_label='Overwritten'$sql$,'55000');
select pg_temp.expect_error($sql$delete from public.audit_catalog_revisions$sql$,'55000');
-- CASCADE includes FK dependants so the immutable BEFORE TRUNCATE trigger is exercised.
select pg_temp.expect_error($sql$truncate public.audit_catalog_revisions cascade$sql$,'55000');
select pg_temp.expect_error($sql$update dialogo_private.audit_catalog_documents set pdf_name='overwritten.pdf'$sql$,'55000');
select pg_temp.expect_error($sql$delete from dialogo_private.audit_catalog_documents$sql$,'55000');
select pg_temp.expect_error($sql$truncate dialogo_private.audit_catalog_documents$sql$,'55000');
select pg_temp.expect_error($sql$update dialogo_private.audit_catalog_operations set payload_hash=repeat('0',64)$sql$,'55000');
select pg_temp.expect_error($sql$delete from dialogo_private.audit_catalog_operations$sql$,'55000');
select pg_temp.expect_error($sql$truncate dialogo_private.audit_catalog_operations$sql$,'55000');
select pg_temp.assert_true((select count(*)=7 from public.audit_catalog_revisions)
 and (select count(*)=7 from dialogo_private.audit_catalog_operations)
 and (select count(*)=6 from dialogo_private.audit_catalog_documents),
 'C26 all catalog snapshots, documents and retry records remain append-only even for the database owner');
select pg_temp.assert_true(pg_temp.b8_baseline_state()=(select payload from b8_before),
 'C27 every catalog operation preserves existing B1-B7 Auth, accounts, grants, work history, visits and events exactly');
rollback;

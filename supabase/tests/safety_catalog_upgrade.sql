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


select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
insert into public.audit_catalog_revisions(model_id,version,revision_label,change_note,criteria,created_by,request_id)
values('security-it07-r02',1,'02','Original fixture','[{"id":"item","code":"01.01.01","title":"Preservar título","text":"Preservar descrição","analysisCriterion":"Preservar critério","group":"01 — Grupo","subgroup":"Subgrupo","source":"IT07","locator":"1","documentedWeight":null,"configuredWeight":1,"groupWeight":1,"orientations":[]}]',pg_temp.id(1),gen_random_uuid());
insert into dialogo_private.audit_catalog_documents(revision_id,pdf,pdf_name)
select id,decode('255044462d','hex'),'roteiro.pdf' from public.audit_catalog_revisions;
commit;
-- MIGRATION_UPGRADE_BOUNDARY
begin;
select pg_temp.assert_true((select count(*)=2 from public.audit_catalog_revisions),'New revision preserves old version');
select pg_temp.assert_true((select criteria->0->>'configuredWeight'='5' and criteria->0->>'groupWeight'='2' from public.audit_catalog_revisions where version=2),'Both approved weights applied');
select pg_temp.assert_true((select criteria->0->>'configuredWeight'='1' from public.audit_catalog_revisions where version=1),'Historic weights unchanged');
select pg_temp.assert_true((select ((a.criteria->0) - 'configuredWeight' - 'groupWeight' - 'weightConfigurationId')=((b.criteria->0) - 'configuredWeight' - 'groupWeight' - 'weightConfigurationId') from public.audit_catalog_revisions a, public.audit_catalog_revisions b where a.version=1 and b.version=2),'Documentary text unchanged');
select pg_temp.assert_true((select count(*)=2 from dialogo_private.audit_catalog_documents where pdf_name='roteiro.pdf'),'Reference documents copied to new revision');
rollback;

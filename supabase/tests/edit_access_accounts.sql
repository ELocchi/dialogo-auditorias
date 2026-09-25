-- Isolated regression for administrator account editing. Never run on hosted data.
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
  exception when others then get stacked diagnostics received=returned_sqlstate;
    if received=expected_code then return; end if;
    raise exception 'Expected %, got %: %',expected_code,received,sqlerrm;
  end;
  raise exception 'Expected error %, statement succeeded',expected_code;
end $test$;

insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 ('13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br','{"nome":"Editing administrator"}',clock_timestamp()),
 ('d1ed0000-0000-4000-8000-000000000002','edited.user@dialogo.com.br','{"nome":"Edited user"}',clock_timestamp());
select dialogo_private.bootstrap_first_administrator('13044e3f-e8d2-4b4b-9981-22a8de22c610',
 'emanuel.locchi@dialogo.com.br','Isolated account editing bootstrap');
update public.access_accounts set atuacao_administrativa='GERAL'
 where auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610';
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
set local role authenticated;
select set_config('dialogo.edit.work',public.create_access_work('Editing fixture work')::text,true);
select public.approve_access_request_v3('d1ed0000-0000-4000-8000-000000000002',
 array['AUDITOR_SEGURANCA'],null,null,
 jsonb_build_array(jsonb_build_object('perfil','AUDITOR_SEGURANCA','obra_id',current_setting('dialogo.edit.work'),'modulo','SEGURANCA')),
 'Initial account approval for editing fixture');

select public.update_access_account('d1ed0000-0000-4000-8000-000000000002',
 array['ADMINISTRATIVO','ENGENHARIA'],array['EQUIPE_OBRA','COORDENACAO'],'QUALIDADE',
 jsonb_build_array(
   jsonb_build_object('perfil','ENGENHARIA','obra_id',current_setting('dialogo.edit.work'),'modulo','SEGURANCA'),
   jsonb_build_object('perfil','ENGENHARIA','obra_id',current_setting('dialogo.edit.work'),'modulo','QUALIDADE')),
 true,'Administrator changed profiles and work access');
select pg_temp.assert_true(
 (select ativo and perfis=array['ADMINISTRATIVO','ENGENHARIA']::text[]
   and atuacoes_engenharia=array['EQUIPE_OBRA','COORDENACAO']::text[]
   and atuacao_administrativa='QUALIDADE' from public.access_accounts
   where auth_user_id='d1ed0000-0000-4000-8000-000000000002')
 and (select count(*)=2 from public.access_grants
   where auth_user_id='d1ed0000-0000-4000-8000-000000000002')
 and (select before_access_snapshot->'account'->'perfis'='["AUDITOR_SEGURANCA"]'::jsonb
   and request_snapshot->'access_edit'->>'ativo'='true'
   and actor_auth_user_id='13044e3f-e8d2-4b4b-9981-22a8de22c610'::uuid
   from public.access_decisions where auth_user_id='d1ed0000-0000-4000-8000-000000000002'
   and decision_type='EDICAO_USUARIO'),
 'edit atomically replaces authorization and records before/after summaries');

select public.update_access_account('d1ed0000-0000-4000-8000-000000000002',
 array['ADMINISTRATIVO'],array[]::text[],'GERAL','[]'::jsonb,false,
 'Administrator deactivated the edited account');
select pg_temp.assert_true(
 (select not ativo from public.access_accounts where auth_user_id='d1ed0000-0000-4000-8000-000000000002'),
 'inactive account state is persisted');

select pg_temp.expect_error($sql$select public.update_access_account(
 '13044e3f-e8d2-4b4b-9981-22a8de22c610',array['AUDITOR_SEGURANCA'],array[]::text[],null,
 jsonb_build_array(jsonb_build_object('perfil','AUDITOR_SEGURANCA','obra_id',current_setting('dialogo.edit.work'),'modulo','SEGURANCA')),
 true,'Must preserve the last general administrator')$sql$,'55000');
select pg_temp.expect_error($sql$select public.update_access_account(
 'd1ed0000-0000-4000-8000-000000000002',array['ENGENHARIA'],array['EQUIPE_OBRA'],null,
 jsonb_build_array(jsonb_build_object('perfil','ENGENHARIA','obra_id',current_setting('dialogo.edit.work'),'modulo','SEGURANCA')),
 true,'Engineering requires both modules')$sql$,'22023');

reset role;
set local role authenticated;
set local "request.jwt.claim.sub"='d1ed0000-0000-4000-8000-000000000002';
select pg_temp.expect_error($sql$select public.update_access_account(
 'd1ed0000-0000-4000-8000-000000000002',array['ADMINISTRATIVO'],array[]::text[],'GERAL','[]'::jsonb,true,
 'Inactive user cannot edit itself')$sql$,'42501');
reset role;

select pg_temp.expect_error($sql$update public.access_decisions set reason='tamper'
 where decision_type='EDICAO_USUARIO'$sql$,'55000');
rollback;

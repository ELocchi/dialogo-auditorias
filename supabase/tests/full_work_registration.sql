-- B.9 isolated PostgreSQL suite. Never execute against a hosted database.
begin;
do $test$
begin
  if current_setting('dialogo.test_database', true) is distinct from 'isolated-local'
    or session_user <> 'postgres' or exists (select 1 from auth.users) then
    raise exception 'Requires empty, disposable local database and postgres session';
  end if;
end;
$test$;
create function pg_temp.assert_true(result boolean, test_name text)
returns void language plpgsql as $test$
begin
  if result is distinct from true then raise exception 'Failed: %', test_name; end if;
end;
$test$;
create function pg_temp.expect_error(statement text, expected_state text)
returns void language plpgsql as $test$
declare actual_state text;
begin
  begin execute statement;
  exception when others then get stacked diagnostics actual_state=returned_sqlstate;
  end;
  if actual_state is distinct from expected_state then
    raise exception 'Expected %, got % for %', expected_state, actual_state, statement;
  end if;
end;
$test$;
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 ('13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br','{"nome":"SQL B9 admin fixture"}',clock_timestamp());
select dialogo_private.bootstrap_first_administrator('13044e3f-e8d2-4b4b-9981-22a8de22c610',
 'emanuel.locchi@dialogo.com.br','Synthetic local bootstrap for full work registration suite');
commit;

-- MIGRATION_UPGRADE_BOUNDARY

begin;
create function pg_temp.work_payload(p_name text)
returns jsonb language sql as $test$
  select jsonb_build_object(
    'nome',p_name,'logradouro','','numero','','complemento','','bairro','','cidade','',
    'uf','','cep','','responsavel_tecnico','','registro_tecnico','','coordenacao','',
    'observacoes','','equipe_obra','[]'::jsonb);
$test$;
select pg_temp.assert_true(
 has_function_privilege('authenticated','public.create_access_work_full(jsonb)','EXECUTE')
 and not has_function_privilege('anon','public.create_access_work_full(jsonb)','EXECUTE')
 and not has_function_privilege('service_role','public.create_access_work_full(jsonb)','EXECUTE')
 and not has_table_privilege('authenticated','public.access_works','INSERT,UPDATE'),
 'B9 API grants preserve server-side work creation');

set local role authenticated;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select set_config('dialogo.b9.work_minimal',
 public.create_access_work_full(pg_temp.work_payload('SQL B9 minimal work'))::text,true);
select pg_temp.assert_true(
 (select nome='SQL B9 minimal work' and logradouro='' and equipe_obra='[]'::jsonb
   and revisao=0 and updated_at is null and created_by='13044e3f-e8d2-4b4b-9981-22a8de22c610'
  from public.access_works where id=current_setting('dialogo.b9.work_minimal')::uuid),
 'B9 accepts only the required name without fabricating details');

select set_config('dialogo.b9.work_full', public.create_access_work_full(
 pg_temp.work_payload('SQL B9 detailed work') ||
 '{"logradouro":" Rua A ","numero":" 15 ","cidade":" São Paulo ","uf":"sp","cep":"01234567", "responsavel_tecnico":" Eng. Exemplo ","equipe_obra":[{"nome":" Pessoa da obra ","funcao":" Coordenação "}]}'::jsonb
)::text,true);
select pg_temp.assert_true(
 (select logradouro='Rua A' and numero='15' and cidade='São Paulo' and uf='SP' and cep='01234567'
   and responsavel_tecnico='Eng. Exemplo' and equipe_obra='[{"nome":"Pessoa da obra","funcao":"Coordenação"}]'::jsonb
   and revisao=0 and updated_at is null
  from public.access_works where id=current_setting('dialogo.b9.work_full')::uuid)
 and not exists (select 1 from public.access_work_changes)
 and not exists (select 1 from public.access_grants),
 'B9 stores all supplied details atomically without inventing edits or access grants');

select pg_temp.expect_error($sql$select public.create_access_work_full(
 pg_temp.work_payload('SQL B9 invalid CEP') || '{"cep":"123"}'::jsonb)$sql$,'22023');
select pg_temp.expect_error($sql$select public.create_access_work_full(
 pg_temp.work_payload('SQL B9 invalid team') || '{"equipe_obra":[{"nome":""}]}'::jsonb)$sql$,'22023');
select pg_temp.expect_error($sql$select public.create_access_work_full(
 pg_temp.work_payload('SQL B9 minimal work'))$sql$,'23505');
select pg_temp.assert_true((select count(*)=2 from public.access_works),
 'B9 invalid or duplicate submissions leave no partial work');

set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000001';
select pg_temp.expect_error($sql$select public.create_access_work_full(
 pg_temp.work_payload('SQL B9 forbidden work'))$sql$,'42501');
reset role;
select pg_temp.assert_true((select count(*)=2 from public.access_works),
 'B9 unauthorized identity cannot create work');
rollback;

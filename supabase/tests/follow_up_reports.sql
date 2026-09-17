-- Disposable database only. The report is tied to an authorized, confirmed
-- follow-up and cannot be read or saved as an audit or by another profile.
begin;
do $test$ begin
  if current_setting('dialogo.test_database', true) is distinct from 'isolated-local'
    or session_user <> 'postgres' or exists (select 1 from auth.users) then
    raise exception 'Requires empty disposable local database';
  end if;
end $test$;
create function pg_temp.assert_true(result boolean, label text)
returns void language plpgsql as $test$ begin
  if result is distinct from true then raise exception 'Failed: %',label; end if;
end $test$;
create function pg_temp.expect_error(statement text, expected_code text)
returns void language plpgsql as $test$
declare received text;
begin
  begin execute statement;
  exception when others then
    get stacked diagnostics received = returned_sqlstate;
    if received = expected_code then return; end if;
    raise exception 'Expected SQLSTATE %, got %',expected_code,received;
  end;
  raise exception 'Expected SQLSTATE %, statement succeeded',expected_code;
end $test$;

insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 ('13044e3f-e8d2-4b4b-9981-22a8de22c610','emanuel.locchi@dialogo.com.br','{"nome":"Admin fixture"}',clock_timestamp()),
 ('d1b60000-0000-4000-8000-000000000002','auditor.followup@dialogo.com.br','{"nome":"Auditor fixture"}',clock_timestamp());
select dialogo_private.bootstrap_first_administrator('13044e3f-e8d2-4b4b-9981-22a8de22c610',
 'emanuel.locchi@dialogo.com.br','Synthetic bootstrap for follow-up reports');
update public.access_accounts set atuacao_administrativa = 'GERAL'
  where auth_user_id = '13044e3f-e8d2-4b4b-9981-22a8de22c610';
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
insert into public.access_works(id,nome,created_by) values
 ('d1b60000-0000-4000-8000-000000000101','Follow-up work','13044e3f-e8d2-4b4b-9981-22a8de22c610');

select pg_temp.assert_true(
 not has_table_privilege('authenticated','public.follow_up_reports','SELECT')
 and not has_table_privilege('authenticated','public.follow_up_reports','INSERT')
 and not has_function_privilege('anon','public.save_follow_up_report(text,uuid,integer,text,jsonb)','EXECUTE'),
 'report table is private and anonymous callers cannot save');

set local role authenticated;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select public.approve_access_request_v3('d1b60000-0000-4000-8000-000000000002',
 array['AUDITOR_SEGURANCA'],null,null,
 '[{"perfil":"AUDITOR_SEGURANCA","obra_id":"d1b60000-0000-4000-8000-000000000101","modulo":"SEGURANCA"}]',
 'Synthetic Safety auditor');
select set_config('dialogo.followup.visit',public.create_work_follow_up_visit(
 'd1b60000-0000-4000-8000-000000000201','d1b60000-0000-4000-8000-000000000101',
 'SEGURANCA','d1b60000-0000-4000-8000-000000000002',
 (clock_timestamp() at time zone 'America/Sao_Paulo')::date,'Visit for orientative report')::text,true);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub"='d1b60000-0000-4000-8000-000000000002';
select pg_temp.expect_error(format(
 'select public.save_follow_up_report(''AUDITOR_SEGURANCA'',%L::uuid,0,%L,''[]''::jsonb)',
 current_setting('dialogo.followup.visit'), 'Orientações suficientes para a visita.'), '42501');
select public.confirm_audit_visit('d1b60000-0000-4000-8000-000000000202',
 current_setting('dialogo.followup.visit')::uuid,1);
select pg_temp.assert_true(
 (public.save_follow_up_report('AUDITOR_SEGURANCA',current_setting('dialogo.followup.visit')::uuid,
  0,'Orientações suficientes para a visita.',
  '[{"id":"d1b60000-0000-4000-8000-000000000301","location":"Bloco A","description":"Guarda-corpo incompleto","correction":"Instalar o guarda-corpo"}]'::jsonb)->>'revision')::integer=1,
 'assigned auditor saves one orientative report with a correction finding');
select pg_temp.assert_true(jsonb_array_length(public.read_follow_up_reports('AUDITOR_SEGURANCA'))=1,
 'assigned auditor reads the saved report');
select pg_temp.expect_error(format(
 'select public.save_follow_up_report(''AUDITOR_SEGURANCA'',%L::uuid,0,%L,''[]''::jsonb)',
 current_setting('dialogo.followup.visit'), 'Orientações suficientes para a visita.'), '40001');
select pg_temp.expect_error(format(
 'select public.save_follow_up_report(''AUDITOR_SEGURANCA'',%L::uuid,1,%L,%L::jsonb)',
 current_setting('dialogo.followup.visit'), 'Orientações suficientes para a visita.',
 '[{"id":"d1b60000-0000-4000-8000-000000000301","location":"","description":"a","correction":"b"}]'), '22023');
select pg_temp.assert_true(
 (public.save_follow_up_report('AUDITOR_SEGURANCA',current_setting('dialogo.followup.visit')::uuid,
  1,'Orientações atualizadas para a visita.', '[]'::jsonb)->>'revision')::integer=2,
 'editing increments the report revision');
select pg_temp.expect_error('select public.read_follow_up_reports(''AUDITOR_QUALIDADE'')','42501');
reset role;

set local role authenticated;
set local "request.jwt.claim.sub"='13044e3f-e8d2-4b4b-9981-22a8de22c610';
select pg_temp.expect_error('select public.read_follow_up_reports(''ADMINISTRATIVO'')','42501');
reset role;
rollback;

-- B.14: one administrative activity per account. Existing administrators keep general access.
begin;

alter table public.access_accounts add column atuacao_administrativa text;
update public.access_accounts set atuacao_administrativa = 'GERAL'
  where 'ADMINISTRATIVO' = any(perfis);
alter table public.access_accounts add constraint access_accounts_administrative_scope_check check (
  (atuacao_administrativa is null or atuacao_administrativa in ('SEGURANCA','QUALIDADE','GERAL'))
  and (atuacao_administrativa is null or 'ADMINISTRATIVO' = any(perfis))
);
comment on column public.access_accounts.atuacao_administrativa is
  'One administrative activity: Safety, Quality, or General. Existing administrators were retained as General.';

create table dialogo_private.administrative_scope_decisions (
  decision_id uuid primary key references public.access_decisions(id) on delete restrict,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  atuacao_administrativa text check (atuacao_administrativa in ('SEGURANCA','QUALIDADE','GERAL')),
  recorded_at timestamptz not null default clock_timestamp()
);
alter table dialogo_private.administrative_scope_decisions enable row level security;
revoke all on dialogo_private.administrative_scope_decisions from public, anon, authenticated, service_role;
create function dialogo_private.reject_administrative_scope_decision_mutation()
returns trigger language plpgsql set search_path = '' as $function$
begin
  raise exception using errcode = '55000', message = 'administrative_scope_history_is_immutable';
end;
$function$;
revoke all on function dialogo_private.reject_administrative_scope_decision_mutation()
  from public, anon, authenticated, service_role;
create trigger administrative_scope_decisions_immutable before update or delete
  on dialogo_private.administrative_scope_decisions for each row
  execute function dialogo_private.reject_administrative_scope_decision_mutation();
create trigger administrative_scope_decisions_no_truncate before truncate
  on dialogo_private.administrative_scope_decisions for each statement
  execute function dialogo_private.reject_administrative_scope_decision_mutation();

-- General authority controls accounts, works and platform maintenance.
create or replace function public.is_current_access_administrator()
returns boolean language sql stable security definer set search_path = '' as $function$
  select exists (
    select 1 from public.access_accounts a
    join auth.users u on u.id = a.auth_user_id
    join public.access_requests r on r.auth_user_id = a.auth_user_id
    where a.auth_user_id = (select auth.uid()) and a.ativo
      and 'ADMINISTRATIVO' = any(a.perfis) and a.atuacao_administrativa = 'GERAL'
      and u.email_confirmed_at is not null and r.status_acesso = 'APROVADO' and r.email = u.email
      and public.is_dialogo_corporate_email(u.email)
      and u.deleted_at is null and (u.banned_until is null or u.banned_until <= statement_timestamp())
  );
$function$;

create function public.has_current_administrative_module(p_modulo text)
returns boolean language sql stable security definer set search_path = '' as $function$
  select p_modulo in ('SEGURANCA','QUALIDADE') and public.is_current_access_active()
    and exists (select 1 from public.access_accounts a
      where a.auth_user_id = auth.uid() and a.ativo and 'ADMINISTRATIVO' = any(a.perfis)
        and a.atuacao_administrativa in (p_modulo,'GERAL'));
$function$;
revoke all on function public.has_current_administrative_module(text) from public, anon, authenticated, service_role;
grant execute on function public.has_current_administrative_module(text) to authenticated;

-- The old approval endpoint is no longer callable by an authenticated client.
-- v3 calls it within the same transaction, then stores the selected activity.
revoke all on function public.approve_access_request_v2(uuid,text[],text,jsonb,text)
  from public, anon, authenticated, service_role;
create function public.approve_access_request_v3(
  p_auth_user_id uuid, p_perfis text[], p_atuacao_engenharia text,
  p_atuacao_administrativa text, p_grants jsonb, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $function$
declare v_decision uuid;
begin
  if not public.is_current_access_administrator() then
    raise exception using errcode = '42501', message = 'general_administrator_required';
  end if;
  if (p_perfis is not null and 'ADMINISTRATIVO' = any(p_perfis)
      and p_atuacao_administrativa not in ('SEGURANCA','QUALIDADE','GERAL'))
    or (p_perfis is not null and not ('ADMINISTRATIVO' = any(p_perfis))
      and p_atuacao_administrativa is not null)
    or ('ADMINISTRATIVO' = any(p_perfis) and p_atuacao_administrativa is null) then
    raise exception using errcode = '22023', message = 'invalid_administrative_scope';
  end if;
  v_decision := public.approve_access_request_v2(p_auth_user_id,p_perfis,p_atuacao_engenharia,p_grants,p_reason);
  update public.access_accounts set atuacao_administrativa = p_atuacao_administrativa
    where auth_user_id = p_auth_user_id;
  insert into dialogo_private.administrative_scope_decisions(decision_id,auth_user_id,atuacao_administrativa)
    values(v_decision,p_auth_user_id,p_atuacao_administrativa);
  return v_decision;
end;
$function$;
revoke all on function public.approve_access_request_v3(uuid,text[],text,text,jsonb,text)
  from public, anon, authenticated, service_role;
grant execute on function public.approve_access_request_v3(uuid,text[],text,text,jsonb,text) to authenticated;

create function public.read_administrative_scope_history()
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
begin
  if not public.is_current_access_administrator() then
    raise exception using errcode = '42501', message = 'general_administrator_required';
  end if;
  return (select coalesce(jsonb_object_agg(decision_id::text,atuacao_administrativa),'{}'::jsonb)
    from dialogo_private.administrative_scope_decisions);
end;
$function$;
revoke all on function public.read_administrative_scope_history()
  from public, anon, authenticated, service_role;
grant execute on function public.read_administrative_scope_history() to authenticated;

-- Keep the existing, audited RPC implementations unchanged. The public
-- entrypoints enforce the module before delegating to their private copies.
alter function public.read_audit_agenda(text,text) set schema dialogo_private;
alter function dialogo_private.read_audit_agenda(text,text) rename to read_audit_agenda_unscoped;
revoke all on function dialogo_private.read_audit_agenda_unscoped(text,text)
  from public, anon, authenticated, service_role;
create function public.read_audit_agenda(p_profile text,p_engineering_scope text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare v_data jsonb;
begin
  v_data := dialogo_private.read_audit_agenda_unscoped(p_profile,p_engineering_scope);
  if p_profile <> 'ADMINISTRATIVO' then return v_data; end if;
  return jsonb_build_object(
    'visits',(select coalesce(jsonb_agg(value),'[]'::jsonb) from jsonb_array_elements(v_data->'visits') value
      where public.has_current_administrative_module(case value->>'module' when 'safety' then 'SEGURANCA' else 'QUALIDADE' end)),
    'auditors',(select coalesce(jsonb_agg(value),'[]'::jsonb) from jsonb_array_elements(v_data->'auditors') value
      where public.has_current_administrative_module(case value->>'role' when 'safety-auditor' then 'SEGURANCA' else 'QUALIDADE' end)));
end;
$function$;
revoke all on function public.read_audit_agenda(text,text) from public, anon, authenticated, service_role;
grant execute on function public.read_audit_agenda(text,text) to authenticated;

alter function public.read_audit_catalogs(text,text) set schema dialogo_private;
alter function dialogo_private.read_audit_catalogs(text,text) rename to read_audit_catalogs_unscoped;
revoke all on function dialogo_private.read_audit_catalogs_unscoped(text,text)
  from public, anon, authenticated, service_role;
create function public.read_audit_catalogs(p_profile text,p_engineering_scope text default null)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_data jsonb;
begin
  v_data := dialogo_private.read_audit_catalogs_unscoped(p_profile,p_engineering_scope);
  if p_profile <> 'ADMINISTRATIVO' then return v_data; end if;
  return (select coalesce(jsonb_agg(value),'[]'::jsonb) from jsonb_array_elements(v_data) value
    where public.has_current_administrative_module(
      case value->>'modelId' when 'security-it07-r02' then 'SEGURANCA' else 'QUALIDADE' end));
end;
$function$;
revoke all on function public.read_audit_catalogs(text,text) from public, anon, authenticated, service_role;
grant execute on function public.read_audit_catalogs(text,text) to authenticated;

alter function public.list_authorized_visit_auditors(uuid,text) set schema dialogo_private;
alter function dialogo_private.list_authorized_visit_auditors(uuid,text) rename to list_authorized_visit_auditors_unscoped;
revoke all on function dialogo_private.list_authorized_visit_auditors_unscoped(uuid,text)
  from public, anon, authenticated, service_role;
create function public.list_authorized_visit_auditors(p_obra_id uuid,p_modulo text)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
begin
  if not public.has_current_administrative_module(p_modulo) then
    raise exception using errcode = '42501', message = 'administrative_module_required';
  end if;
  if p_obra_id is null then
    raise exception using errcode = '22023', message = 'invalid_visit_scope';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',r.auth_user_id,'name',r.nome)
    order by r.nome,r.auth_user_id), '[]'::jsonb) from public.access_requests r
    where dialogo_private.is_authorized_visit_auditor(r.auth_user_id,p_obra_id,p_modulo));
end;
$function$;
revoke all on function public.list_authorized_visit_auditors(uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function public.list_authorized_visit_auditors(uuid,text) to authenticated;

-- Mutations validate the module through triggers, including callers of the
-- original security-definer functions. This also protects future RPC paths.
create function dialogo_private.check_administrative_visit_module()
returns trigger language plpgsql set search_path = '' as $function$
begin
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.cancelled_at is distinct from old.cancelled_at) then
    if not public.has_current_administrative_module(new.modulo) then
      raise exception using errcode = '42501', message = 'administrative_module_required';
    end if;
  end if;
  return new;
end;
$function$;
revoke all on function dialogo_private.check_administrative_visit_module()
  from public, anon, authenticated, service_role;
create trigger audit_visits_administrative_module before insert or update on public.audit_visits
  for each row execute function dialogo_private.check_administrative_visit_module();

create function dialogo_private.check_administrative_catalog_module()
returns trigger language plpgsql set search_path = '' as $function$
begin
  if not public.has_current_administrative_module(
    case new.model_id when 'security-it07-r02' then 'SEGURANCA' else 'QUALIDADE' end) then
    raise exception using errcode = '42501', message = 'administrative_module_required';
  end if;
  return new;
end;
$function$;
revoke all on function dialogo_private.check_administrative_catalog_module()
  from public, anon, authenticated, service_role;
create trigger audit_catalog_revisions_administrative_module before insert on public.audit_catalog_revisions
  for each row execute function dialogo_private.check_administrative_catalog_module();

create function dialogo_private.check_general_work_maintenance()
returns trigger language plpgsql set search_path = '' as $function$
begin
  if not public.is_current_access_administrator() then
    raise exception using errcode = '42501', message = 'general_administrator_required';
  end if;
  return new;
end;
$function$;
revoke all on function dialogo_private.check_general_work_maintenance()
  from public, anon, authenticated, service_role;
create trigger access_works_general_maintenance before insert or update on public.access_works
  for each row execute function dialogo_private.check_general_work_maintenance();

alter function public.read_audit_catalog_document(text,boolean,uuid) set schema dialogo_private;
alter function dialogo_private.read_audit_catalog_document(text,boolean,uuid) rename to read_audit_catalog_document_unscoped;
revoke all on function dialogo_private.read_audit_catalog_document_unscoped(text,boolean,uuid)
  from public, anon, authenticated, service_role;
create function public.read_audit_catalog_document(p_model_id text,p_original boolean default false,p_revision_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $function$
begin
  if p_model_id not in ('security-it07-r02','quality-f175','quality-f176') or p_model_id is null
    or not public.has_current_administrative_module(
      case p_model_id when 'security-it07-r02' then 'SEGURANCA' else 'QUALIDADE' end) then
    raise exception using errcode = '42501', message = 'administrative_module_required';
  end if;
  return dialogo_private.read_audit_catalog_document_unscoped(p_model_id,p_original,p_revision_id);
end;
$function$;
revoke all on function public.read_audit_catalog_document(text,boolean,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.read_audit_catalog_document(text,boolean,uuid) to authenticated;

alter function public.create_audit_visit(uuid,uuid,text,text,uuid,date,text) set schema dialogo_private;
alter function dialogo_private.create_audit_visit(uuid,uuid,text,text,uuid,date,text) rename to create_audit_visit_unscoped;
revoke all on function dialogo_private.create_audit_visit_unscoped(uuid,uuid,text,text,uuid,date,text)
  from public, anon, authenticated, service_role;
create function public.create_audit_visit(p_request_id uuid,p_obra_id uuid,p_modulo text,p_modelo_id text,
  p_auditor_auth_user_id uuid,p_data_prevista date,p_observacao text)
returns uuid language plpgsql security definer set search_path = '' as $function$
begin
  if not public.has_current_administrative_module(p_modulo) then
    raise exception using errcode = '42501', message = 'administrative_module_required';
  end if;
  return dialogo_private.create_audit_visit_unscoped(p_request_id,p_obra_id,p_modulo,p_modelo_id,
    p_auditor_auth_user_id,p_data_prevista,p_observacao);
end;
$function$;
revoke all on function public.create_audit_visit(uuid,uuid,text,text,uuid,date,text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_audit_visit(uuid,uuid,text,text,uuid,date,text) to authenticated;

alter function public.create_work_follow_up_visit(uuid,uuid,text,uuid,date,text) set schema dialogo_private;
alter function dialogo_private.create_work_follow_up_visit(uuid,uuid,text,uuid,date,text) rename to create_work_follow_up_visit_unscoped;
revoke all on function dialogo_private.create_work_follow_up_visit_unscoped(uuid,uuid,text,uuid,date,text)
  from public, anon, authenticated, service_role;
create function public.create_work_follow_up_visit(p_request_id uuid,p_obra_id uuid,p_modulo text,
  p_auditor_auth_user_id uuid,p_data_prevista date,p_observacao text)
returns uuid language plpgsql security definer set search_path = '' as $function$
begin
  if not public.has_current_administrative_module(p_modulo) then
    raise exception using errcode = '42501', message = 'administrative_module_required';
  end if;
  return dialogo_private.create_work_follow_up_visit_unscoped(p_request_id,p_obra_id,p_modulo,
    p_auditor_auth_user_id,p_data_prevista,p_observacao);
end;
$function$;
revoke all on function public.create_work_follow_up_visit(uuid,uuid,text,uuid,date,text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_work_follow_up_visit(uuid,uuid,text,uuid,date,text) to authenticated;

alter function public.delete_audit_visit(uuid,uuid,integer) set schema dialogo_private;
alter function dialogo_private.delete_audit_visit(uuid,uuid,integer) rename to delete_audit_visit_unscoped;
revoke all on function dialogo_private.delete_audit_visit_unscoped(uuid,uuid,integer)
  from public, anon, authenticated, service_role;
create function public.delete_audit_visit(p_request_id uuid,p_visit_id uuid,p_expected_revision integer)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare v_module text;
begin
  select modulo into v_module from public.audit_visits where id = p_visit_id;
  if v_module is null then
    raise exception using errcode = 'P0002', message = 'visit_not_found';
  end if;
  if not public.has_current_administrative_module(v_module) then
    raise exception using errcode = '42501', message = 'administrative_module_required';
  end if;
  return dialogo_private.delete_audit_visit_unscoped(p_request_id,p_visit_id,p_expected_revision);
end;
$function$;
revoke all on function public.delete_audit_visit(uuid,uuid,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.delete_audit_visit(uuid,uuid,integer) to authenticated;

alter function public.save_audit_catalog_revision(uuid,text,integer,text,text,jsonb,text,text,text,text) set schema dialogo_private;
alter function dialogo_private.save_audit_catalog_revision(uuid,text,integer,text,text,jsonb,text,text,text,text) rename to save_audit_catalog_revision_unscoped;
revoke all on function dialogo_private.save_audit_catalog_revision_unscoped(uuid,text,integer,text,text,jsonb,text,text,text,text)
  from public, anon, authenticated, service_role;
create function public.save_audit_catalog_revision(p_request_id uuid,p_model_id text,p_expected_version integer,
  p_revision_label text,p_change_note text,p_criteria jsonb,p_pdf_base64 text default null,
  p_pdf_name text default null,p_original_base64 text default null,p_original_name text default null)
returns uuid language plpgsql security definer set search_path = '' as $function$
begin
  if p_model_id not in ('security-it07-r02','quality-f175','quality-f176') or p_model_id is null
    or not public.has_current_administrative_module(
      case p_model_id when 'security-it07-r02' then 'SEGURANCA' else 'QUALIDADE' end) then
    raise exception using errcode = '42501', message = 'administrative_module_required';
  end if;
  return dialogo_private.save_audit_catalog_revision_unscoped(p_request_id,p_model_id,p_expected_version,
    p_revision_label,p_change_note,p_criteria,p_pdf_base64,p_pdf_name,p_original_base64,p_original_name);
end;
$function$;
revoke all on function public.save_audit_catalog_revision(uuid,text,integer,text,text,jsonb,text,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.save_audit_catalog_revision(uuid,text,integer,text,text,jsonb,text,text,text,text)
  to authenticated;

commit;

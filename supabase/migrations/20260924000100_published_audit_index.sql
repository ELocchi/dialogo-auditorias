-- Keep ranking metadata independent from large evidence and response snapshots.
begin;

do $integrity$
begin
  if not exists (
    select 1 from public.published_audits
    where id = 'b1760000-2026-4923-8000-000000000001'::uuid
      and work_id = '6c735db0-abd6-4ed7-b66e-6c253ed8a880'::uuid
      and model_id = 'quality-f176'
      and audit_date = '2026-09-23'::date
      and final_score = 6.74
      and jsonb_array_length(criteria) = 23
      and (select count(*) from jsonb_object_keys(responses)) = 23
      and jsonb_array_length(evidence_files) = 37
      and report_file_name = 'relatorio-final.pdf'
  ) then
    raise exception using errcode = '23514', message = 'published_boulevard_audit_integrity_failed';
  end if;
end;
$integrity$;

create function public.read_published_audit_index(
  p_profile text,
  p_engineering_scope text default null,
  p_administrative_scope text default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare v_result jsonb;
begin
  perform dialogo_private.lock_agenda_identity(auth.uid(),p_profile);
  if p_profile = 'ENGENHARIA' and (p_engineering_scope not in ('EQUIPE_OBRA','COORDENACAO') or not exists (
      select 1 from public.access_accounts a where a.auth_user_id = auth.uid()
        and p_engineering_scope = any(a.atuacoes_engenharia))) then
    raise exception using errcode = '42501', message = 'active_published_audit_profile_required';
  elsif p_profile = 'ADMINISTRATIVO' and p_administrative_scope not in ('SEGURANCA','QUALIDADE','GERAL') then
    raise exception using errcode = '42501', message = 'active_published_audit_profile_required';
  elsif p_profile not in ('ADMINISTRATIVO','AUDITOR_SEGURANCA','AUDITOR_QUALIDADE','ENGENHARIA')
    or (p_profile <> 'ENGENHARIA' and p_engineering_scope is not null)
    or (p_profile <> 'ADMINISTRATIVO' and p_administrative_scope is not null) then
    raise exception using errcode = '42501', message = 'active_published_audit_profile_required';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'workId',a.work_id,'modelId',a.model_id,'date',a.audit_date,
    'auditorId',a.auditor_auth_user_id,'auditor',a.auditor_name,'finalScore',a.final_score,
    'catalogRevisionId',a.catalog_revision_id,'catalogVersion',a.catalog_version,
    'catalogRevisionLabel',a.catalog_revision_label)
    order by a.audit_date desc,a.id),'[]'::jsonb) into v_result
  from public.published_audits a join public.access_works w on w.id = a.work_id
  where w.ativo and (
    (p_profile = 'ADMINISTRATIVO' and public.has_current_administrative_module(a.modulo)
      and (p_administrative_scope = 'GERAL' or p_administrative_scope = a.modulo))
    or (p_profile <> 'ADMINISTRATIVO' and exists (
      select 1 from public.access_grants g where g.auth_user_id = auth.uid()
        and g.perfil = p_profile and g.obra_id = a.work_id and g.modulo = a.modulo))
  );
  return v_result;
end;
$function$;

revoke all on function public.read_published_audit_index(text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.read_published_audit_index(text,text,text) to authenticated;
comment on function public.read_published_audit_index(text,text,text) is
  'Reads only authorized published-audit metadata used by rankings; evidence remains in the detailed private reader.';

commit;

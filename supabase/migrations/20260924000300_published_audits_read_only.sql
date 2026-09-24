-- Published audit reads must work inside PostgREST READ ONLY transactions.
-- Preserve account, profile, work/module permissions and Engineering projection.
begin;

create or replace function public.read_published_audit_index(
  p_profile text,
  p_engineering_scope text default null,
  p_administrative_scope text default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare v_result jsonb;
begin
  -- RPCs declared STABLE run in READ ONLY transactions in PostgREST.
  -- Use the same current-account checks as agenda reads, without row locks.
  if p_profile is null or not public.is_current_access_active()
    or not exists (select 1 from public.access_accounts a
      where a.auth_user_id = auth.uid() and p_profile = any(a.perfis)) then
    raise exception using errcode = '42501', message = 'active_published_audit_profile_required';
  end if;
  if p_profile = 'ENGENHARIA' and (p_engineering_scope is null or p_engineering_scope not in ('EQUIPE_OBRA','COORDENACAO') or not exists (
      select 1 from public.access_accounts a where a.auth_user_id = auth.uid()
        and p_engineering_scope = any(a.atuacoes_engenharia))) then
    raise exception using errcode = '42501', message = 'active_published_audit_profile_required';
  elsif p_profile = 'ADMINISTRATIVO' and (p_administrative_scope is null or p_administrative_scope not in ('SEGURANCA','QUALIDADE','GERAL')) then
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

create or replace function public.read_published_audits(
  p_profile text,
  p_engineering_scope text default null,
  p_administrative_scope text default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare v_result jsonb;
begin
  -- RPCs declared STABLE run in READ ONLY transactions in PostgREST.
  -- Use the same current-account checks as agenda reads, without row locks.
  if p_profile is null or not public.is_current_access_active()
    or not exists (select 1 from public.access_accounts a
      where a.auth_user_id = auth.uid() and p_profile = any(a.perfis)) then
    raise exception using errcode = '42501', message = 'active_published_audit_profile_required';
  end if;
  if p_profile = 'ENGENHARIA' and (p_engineering_scope is null or p_engineering_scope not in ('EQUIPE_OBRA','COORDENACAO') or not exists (
      select 1 from public.access_accounts a where a.auth_user_id = auth.uid()
        and p_engineering_scope = any(a.atuacoes_engenharia))) then
    raise exception using errcode = '42501', message = 'active_published_audit_profile_required';
  elsif p_profile = 'ADMINISTRATIVO' and (p_administrative_scope is null or p_administrative_scope not in ('SEGURANCA','QUALIDADE','GERAL')) then
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
    'catalogRevisionLabel',a.catalog_revision_label,
    'criteria',case when p_profile='ENGENHARIA' then (
      select jsonb_agg((c.value-array['configuredWeight','weightConfigurationId']) || '{"documentedWeight":null}'::jsonb order by c.ordinality)
      from jsonb_array_elements(a.criteria) with ordinality c(value,ordinality)
    ) else a.criteria end,
    'responses',case when p_profile='ENGENHARIA' then (
      select jsonb_object_agg(e.key,case when jsonb_typeof(e.value->'checks')='array' then
        jsonb_set(e.value,'{checks}',coalesce((select jsonb_agg(c.value-'weight' order by c.ordinality)
          from jsonb_array_elements(e.value->'checks') with ordinality c(value,ordinality)),'[]'::jsonb))
        else e.value end) from jsonb_each(a.responses) e
    ) else a.responses end,
    'evidenceFiles',a.evidence_files,'reportFileName',a.report_file_name,'publishedAt',a.published_at)
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

notify pgrst, 'reload schema';
commit;

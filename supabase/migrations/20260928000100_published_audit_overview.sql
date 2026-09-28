-- Compact dashboard payload and strictly scoped detail/report reads.
-- Evidence signing is performed only after the user opens a publication.
begin;

create function dialogo_private.require_published_audit_profile(
  p_profile text,p_engineering_scope text,p_administrative_scope text
) returns void language plpgsql stable security definer set search_path = '' as $function$
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

end;
$function$;
revoke all on function dialogo_private.require_published_audit_profile(text,text,text) from public,anon,authenticated,service_role;

-- This projection follows the existing UI extraction exactly: each failed
-- quantitative check is a finding; parent notes are used only without failures.
create function dialogo_private.published_audit_findings(p_criteria jsonb,p_responses jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $function$
declare
  v_criterion jsonb; v_response jsonb; v_check jsonb; v_result jsonb := '[]'::jsonb;
  v_title text; v_note text; v_count integer; v_serious boolean;
begin
  for v_criterion in select value from jsonb_array_elements(p_criteria) loop
    v_response := p_responses->(v_criterion->>'id');
    if v_response is null then continue; end if;
    v_title := coalesce(nullif(v_criterion->>'title',''),v_criterion->>'text');
    v_serious := coalesce(v_response->'serious' = 'true'::jsonb,false);
    v_count := 0;
    for v_check in select value from jsonb_array_elements(
      case when jsonb_typeof(v_response->'checks')='array' then v_response->'checks' else '[]'::jsonb end)
      where value->'compliant' = 'false'::jsonb loop
      v_note := regexp_replace(coalesce(v_check->>'note',''),'^[[:space:]]+|[[:space:]]+$','','g');
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'id',(v_criterion->>'id') || ':' || (v_check->>'id'),
        'item',v_criterion->>'code','description',v_title || ' — ' || (v_check->>'label'),
        'criterionTitle',v_title,'subitem',v_check->>'label','serious',v_serious,
        'nonconformity',coalesce(nullif(v_note,''),'Verificação “' || (v_check->>'label') || '” registrada como não conforme.')));
      v_count := v_count + 1;
    end loop;
    if v_count > 0 then continue; end if;
    v_note := regexp_replace(coalesce(v_response->>'note',''),'^[[:space:]]+|[[:space:]]+$','','g');
    if v_response->>'answer' in ('0','5','Não conforme') or v_serious
      or (v_note <> '' and v_note !~* '^aprovado[.]?$') then
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'id',v_criterion->>'id','item',v_criterion->>'code','description',v_title,
        'criterionTitle',v_title,'serious',v_serious,
        'nonconformity',coalesce(nullif(v_note,''),v_criterion->>'text')));
    end if;
  end loop;
  return v_result;
end;
$function$;
revoke all on function dialogo_private.published_audit_findings(jsonb,jsonb) from public,anon,authenticated,service_role;

create function public.read_published_audit_overview(
  p_profile text,p_engineering_scope text default null,p_administrative_scope text default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare v_result jsonb;
begin
  perform dialogo_private.require_published_audit_profile(p_profile,p_engineering_scope,p_administrative_scope);
  with visible as materialized (
    select jsonb_build_object('id',a.id,'workId',a.work_id,'modelId',a.model_id,'date',a.audit_date,
    'auditorId',a.auditor_auth_user_id,'auditor',a.auditor_name,'finalScore',a.final_score,
    'catalogRevisionId',a.catalog_revision_id,'catalogVersion',a.catalog_version,
    'catalogRevisionLabel',a.catalog_revision_label) as metadata,
      dialogo_private.published_audit_findings(a.criteria,a.responses) as findings,
      a.id,a.work_id,a.model_id,a.audit_date,a.auditor_name,
      case when a.modulo='SEGURANCA' then 'safety' else 'quality' end as module
    from public.published_audits a join public.access_works w on w.id=a.work_id
    where w.ativo and (
    (p_profile = 'ADMINISTRATIVO' and public.has_current_administrative_module(a.modulo)
      and (p_administrative_scope = 'GERAL' or p_administrative_scope = a.modulo))
    or (p_profile = 'ENGENHARIA' and public.has_current_engineering_scope(p_engineering_scope,a.work_id,a.modulo))
    or (p_profile in ('AUDITOR_SEGURANCA','AUDITOR_QUALIDADE') and exists (
      select 1 from public.access_grants g where g.auth_user_id = auth.uid()
        and g.perfil = p_profile and g.obra_id = a.work_id and g.modulo = a.modulo))
  )
  ) select jsonb_build_object(
    'audits',coalesce((select jsonb_agg(metadata order by audit_date desc,id) from visible),'[]'::jsonb),
    'findings',coalesce((select jsonb_agg(f.value || jsonb_build_object(
      'auditId',v.id,'workId',v.work_id,'auditDate',v.audit_date,'auditor',v.auditor_name,
      'modelId',v.model_id,'module',v.module) order by v.audit_date desc,v.id,f.ordinality)
      from visible v cross join lateral jsonb_array_elements(v.findings) with ordinality f(value,ordinality)),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;

create function public.read_published_audit_detail(
  p_audit_id uuid,p_profile text,p_engineering_scope text default null,p_administrative_scope text default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare v_result jsonb;
begin
  perform dialogo_private.require_published_audit_profile(p_profile,p_engineering_scope,p_administrative_scope);
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'workId',a.work_id,'modelId',a.model_id,'date',a.audit_date,
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
    'evidenceFiles',a.evidence_files,'reportFileName',a.report_file_name,'publishedAt',a.published_at)),'[]'::jsonb) into v_result
  from public.published_audits a join public.access_works w on w.id=a.work_id
  where a.id=p_audit_id and w.ativo and (
    (p_profile = 'ADMINISTRATIVO' and public.has_current_administrative_module(a.modulo)
      and (p_administrative_scope = 'GERAL' or p_administrative_scope = a.modulo))
    or (p_profile = 'ENGENHARIA' and public.has_current_engineering_scope(p_engineering_scope,a.work_id,a.modulo))
    or (p_profile in ('AUDITOR_SEGURANCA','AUDITOR_QUALIDADE') and exists (
      select 1 from public.access_grants g where g.auth_user_id = auth.uid()
        and g.perfil = p_profile and g.obra_id = a.work_id and g.modulo = a.modulo))
  );
  return v_result;
end;
$function$;

create function public.read_published_audit_report(
  p_audit_id uuid,p_profile text,p_engineering_scope text default null,p_administrative_scope text default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare v_result jsonb;
begin
  perform dialogo_private.require_published_audit_profile(p_profile,p_engineering_scope,p_administrative_scope);
  select jsonb_build_object('id',a.id,'workId',a.work_id,'modelId',a.model_id,'reportFileName',a.report_file_name)
    into v_result
  from public.published_audits a join public.access_works w on w.id=a.work_id
  where a.id=p_audit_id and w.ativo and (
    (p_profile = 'ADMINISTRATIVO' and public.has_current_administrative_module(a.modulo)
      and (p_administrative_scope = 'GERAL' or p_administrative_scope = a.modulo))
    or (p_profile = 'ENGENHARIA' and public.has_current_engineering_scope(p_engineering_scope,a.work_id,a.modulo))
    or (p_profile in ('AUDITOR_SEGURANCA','AUDITOR_QUALIDADE') and exists (
      select 1 from public.access_grants g where g.auth_user_id = auth.uid()
        and g.perfil = p_profile and g.obra_id = a.work_id and g.modulo = a.modulo))
  );
  return v_result;
end;
$function$;

revoke all on function public.read_published_audit_overview(text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.read_published_audit_detail(uuid,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.read_published_audit_report(uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.read_published_audit_overview(text,text,text) to authenticated;
grant execute on function public.read_published_audit_detail(uuid,text,text,text) to authenticated;
grant execute on function public.read_published_audit_report(uuid,text,text,text) to authenticated;
notify pgrst, 'reload schema';
commit;

-- Revalidate the current profile before reusing a server-side dashboard summary.
-- Published audits are immutable: their authorized ID set is the revision input.
begin;

create function public.read_published_audit_overview_if_changed(
  p_profile text,p_engineering_scope text default null,p_administrative_scope text default null,p_known_revision text default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare v_result jsonb;
begin
  perform dialogo_private.require_published_audit_profile(p_profile,p_engineering_scope,p_administrative_scope);
  -- Evaluate current scope once per active work/module pair, rather than once
  -- for each immutable publication in a long history. The materialized boundary
  -- prevents the planner from moving these permission checks into the audit scan.
  with authorized_work_modules as materialized (
    select w.id as work_id,m.modulo
    from public.access_works w cross join (values ('SEGURANCA'),('QUALIDADE')) m(modulo)
    where w.ativo and (
      (p_profile='ADMINISTRATIVO' and public.has_current_administrative_module(m.modulo)
        and (p_administrative_scope='GERAL' or p_administrative_scope=m.modulo))
      or (p_profile='ENGENHARIA' and public.has_current_engineering_scope(p_engineering_scope,w.id,m.modulo))
      or (p_profile in ('AUDITOR_SEGURANCA','AUDITOR_QUALIDADE') and exists (
        select 1 from public.access_grants g where g.auth_user_id=auth.uid()
          and g.perfil=p_profile and g.obra_id=w.id and g.modulo=m.modulo))
    )
  ), visible as materialized (
    select a.id from public.published_audits a
    join authorized_work_modules allowed on allowed.work_id=a.work_id and allowed.modulo=a.modulo
  ), revision as (
    select md5(jsonb_build_array('audit-overview-v1',auth.uid(),p_profile,p_engineering_scope,p_administrative_scope,
      coalesce((select string_agg(id::text,'' order by id) from visible),''))::text) as value
  )
  select case when revision.value=p_known_revision then
    jsonb_build_object('revision',revision.value,'unchanged',true)
  else jsonb_build_object('revision',revision.value,'unchanged',false,
    'audits',coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'workId',a.work_id,'modelId',a.model_id,'date',a.audit_date,
      'auditorId',a.auditor_auth_user_id,'auditor',a.auditor_name,'finalScore',a.final_score,
      'catalogRevisionId',a.catalog_revision_id,'catalogVersion',a.catalog_version,
      'catalogRevisionLabel',a.catalog_revision_label) order by a.audit_date desc,a.id)
      from public.published_audits a join visible v on v.id=a.id),'[]'::jsonb),
    'findings',coalesce((select jsonb_agg(f.value || jsonb_build_object(
      'auditId',a.id,'workId',a.work_id,'auditDate',a.audit_date,'auditor',a.auditor_name,
      'modelId',a.model_id,'module',case when a.modulo='SEGURANCA' then 'safety' else 'quality' end)
      order by a.audit_date desc,a.id,f.ordinality)
      from public.published_audits a join visible v on v.id=a.id
      cross join lateral jsonb_array_elements(a.findings_summary) with ordinality f(value,ordinality)),'[]'::jsonb)
  ) end into v_result from revision;
  return v_result;
end;
$function$;

revoke all on function public.read_published_audit_overview_if_changed(text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.read_published_audit_overview_if_changed(text,text,text,text) to authenticated;
comment on function public.read_published_audit_overview_if_changed(text,text,text,text) is
  'Always authorizes before revision comparison. Unchanged reads skip audit/finding JSON in one statement snapshot. Cache keys must include current workspace names/scopes. Bump audit-overview-v1 when projection semantics change or findings_summary is recomputed: publication IDs alone rely on immutable content.';
notify pgrst, 'reload schema';
commit;

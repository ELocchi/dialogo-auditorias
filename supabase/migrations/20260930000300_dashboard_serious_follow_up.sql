-- Combine active serious follow-up findings with serious published-audit items
-- in the scoped overview projection.
begin;

create or replace function public.read_published_audit_overview_if_changed(
  p_profile text,p_engineering_scope text default null,p_administrative_scope text default null,p_known_revision text default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare v_result jsonb;
begin
  perform dialogo_private.require_published_audit_profile(p_profile,p_engineering_scope,p_administrative_scope);
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
  ), serious_work_findings as materialized (
    select f.id,f.work_id,f.modulo,f.description,f.correction,f.created_at,
      coalesce((select ar.nome from public.access_requests ar
        where ar.auth_user_id=f.auditor_auth_user_id order by ar.created_at desc limit 1),'Responsável') as responsible
    from public.follow_up_work_findings f
    join authorized_work_modules allowed on allowed.work_id=f.work_id and allowed.modulo=f.modulo
    where f.serious and f.completed_at is null
  ), revision as (
    select md5(jsonb_build_array('audit-overview-v2',auth.uid(),p_profile,p_engineering_scope,p_administrative_scope,
      coalesce((select string_agg(id::text,'' order by id) from visible),''),
      coalesce((select string_agg(id::text,'' order by id) from serious_work_findings),''))::text) as value
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
      cross join lateral jsonb_array_elements(a.findings_summary) with ordinality f(value,ordinality)),'[]'::jsonb),
    'workFindings',coalesce((select jsonb_agg(jsonb_build_object(
      'id',f.id,'workId',f.work_id,
      'module',case when f.modulo='SEGURANCA' then 'safety' else 'quality' end,
      'createdDate',to_char(f.created_at at time zone 'America/Sao_Paulo','YYYY-MM-DD'),
      'responsible',f.responsible,'description',f.description,'correction',f.correction)
      order by f.created_at desc,f.id) from serious_work_findings f),'[]'::jsonb)
  ) end into v_result from revision;
  return v_result;
end;
$function$;

comment on function public.read_published_audit_overview_if_changed(text,text,text,text) is
  'Scoped dashboard snapshot combining immutable audit summaries with active serious follow-up findings. Revision v2 changes when either visible source set changes.';
notify pgrst, 'reload schema';
commit;

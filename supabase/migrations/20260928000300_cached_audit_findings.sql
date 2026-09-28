-- Extract finding summaries once when an immutable audit is published.
-- Adding a stored generated column also computes existing rows without UPDATE,
-- preserving the immutable snapshot triggers and all original audit columns.
begin;

alter table public.published_audits
  add column findings_summary jsonb generated always as (
    dialogo_private.published_audit_findings(criteria,responses)
  ) stored not null;

comment on column public.published_audits.findings_summary is
  'Stored compact finding projection of the immutable criteria and responses. If published_audit_findings changes, replace/recompute this generated column in that same migration; replacing the function alone does not refresh stored rows.';

-- Table/column access stays private. The existing profile-scoped RPC remains
-- the only overview API; no criteria, responses, evidence or weights are added.
create or replace function public.read_published_audit_overview(
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
      a.findings_summary as findings,
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

revoke all on function public.read_published_audit_overview(text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.read_published_audit_overview(text,text,text) to authenticated;
notify pgrst, 'reload schema';
commit;

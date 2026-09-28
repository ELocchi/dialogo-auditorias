-- Page publication metadata before projecting any findings or technical detail.
begin;

create index published_audits_history_date_id on public.published_audits(audit_date desc,id desc);
create index published_audits_history_work_model_date_id on public.published_audits(work_id,model_id,audit_date desc,id desc);

create function public.read_published_audit_history(
  p_profile text,p_engineering_scope text default null,p_administrative_scope text default null,
  p_page integer default 1,p_page_size integer default 10,p_work_id uuid default null,
  p_module text default null,p_model_id text default null,p_date_from date default null,p_date_to date default null,
  p_only_with_findings boolean default false,p_include_findings boolean default true,
  p_audit_id uuid default null,p_exclude_audit_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare v_result jsonb;
begin
  perform dialogo_private.require_published_audit_profile(p_profile,p_engineering_scope,p_administrative_scope);
  if p_page is null or p_page < 1 or p_page_size is null or p_page_size not between 1 and 50
    or p_only_with_findings is null or p_include_findings is null
    or (p_module is not null and p_module not in ('safety','quality'))
    or (p_model_id is not null and p_model_id not in ('security-it07-r02','quality-f175','quality-f176'))
    or (p_date_from is not null and (not isfinite(p_date_from) or extract(year from p_date_from) not between 1 and 9999))
    or (p_date_to is not null and (not isfinite(p_date_to) or extract(year from p_date_to) not between 1 and 9999))
    or (p_date_from is not null and p_date_to is not null and p_date_from > p_date_to) then
    raise exception using errcode = '22023', message = 'invalid_audit_history_query';
  end if;

  with visible as materialized (
    select a.id,a.audit_date
    from public.published_audits a join public.access_works w on w.id=a.work_id
    where w.ativo and (p_work_id is null or a.work_id=p_work_id)
      and (p_module is null or a.modulo=case when p_module='safety' then 'SEGURANCA' else 'QUALIDADE' end)
      and (p_model_id is null or a.model_id=p_model_id)
      and (p_date_from is null or a.audit_date>=p_date_from)
      and (p_date_to is null or a.audit_date<=p_date_to)
      and (p_audit_id is null or a.id=p_audit_id)
      and (p_exclude_audit_id is null or a.id<>p_exclude_audit_id)
      and (not p_only_with_findings or jsonb_array_length(a.findings_summary)>0)
      and (
        (p_profile='ADMINISTRATIVO' and public.has_current_administrative_module(a.modulo)
          and (p_administrative_scope='GERAL' or p_administrative_scope=a.modulo))
        or (p_profile='ENGENHARIA' and public.has_current_engineering_scope(p_engineering_scope,a.work_id,a.modulo))
        or (p_profile in ('AUDITOR_SEGURANCA','AUDITOR_QUALIDADE') and exists (
          select 1 from public.access_grants g where g.auth_user_id=auth.uid()
            and g.perfil=p_profile and g.obra_id=a.work_id and g.modulo=a.modulo))
      )
  ), selected_ids as materialized (
    select id from visible order by audit_date desc,id desc
      limit p_page_size offset (p_page::bigint-1)*p_page_size
  ), selected as materialized (
    select a.id,a.work_id,a.audit_date,a.auditor_name,a.model_id,
      case when a.modulo='SEGURANCA' then 'safety' else 'quality' end as module,
      jsonb_build_object('id',a.id,'workId',a.work_id,'modelId',a.model_id,'date',a.audit_date,
        'auditorId',a.auditor_auth_user_id,'auditor',a.auditor_name,'finalScore',a.final_score,
        'catalogRevisionId',a.catalog_revision_id,'catalogVersion',a.catalog_version,
        'catalogRevisionLabel',a.catalog_revision_label) as metadata,
      case when p_include_findings then a.findings_summary else '[]'::jsonb end as findings
    from public.published_audits a join selected_ids s on s.id=a.id
  )
  select jsonb_build_object('total',(select count(*) from visible),'page',p_page,'pageSize',p_page_size,
    'audits',coalesce((select jsonb_agg(metadata order by audit_date desc,id desc) from selected),'[]'::jsonb),
    'findings',coalesce((select jsonb_agg(f.value || jsonb_build_object(
      'auditId',s.id,'workId',s.work_id,'auditDate',s.audit_date,'auditor',s.auditor_name,
      'modelId',s.model_id,'module',s.module) order by s.audit_date desc,s.id desc,f.ordinality)
      from selected s cross join lateral jsonb_array_elements(s.findings) with ordinality f(value,ordinality)),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;

revoke all on function public.read_published_audit_history(text,text,text,integer,integer,uuid,text,text,date,date,boolean,boolean,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_published_audit_history(text,text,text,integer,integer,uuid,text,text,date,date,boolean,boolean,uuid,uuid) to authenticated;
notify pgrst, 'reload schema';
commit;

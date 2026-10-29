-- Reversal of 20261030000100_audit_change_requests.sql.
-- Run only with authorization. Republished audits keep their latest content; the
-- previous PDFs stay in storage but stop being readable when the versions table is dropped.
-- Refuses to run if any republication exists, to avoid losing history silently.
begin;
do $check$ begin
  if exists (select 1 from public.published_audit_versions) then
    raise exception 'Há auditorias republicadas; exporte public.published_audit_versions antes de reverter.';
  end if;
end $check$;

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
create or replace function public.can_read_published_audit_file(p_name text)
returns boolean language plpgsql stable security definer set search_path='' as $fn$
declare v_work_id uuid; v_audit_id uuid; file_name text;
begin
 if p_name !~* '^[a-f0-9-]{36}/[a-f0-9-]{36}/[^/]+$' then return false; end if;
 begin v_work_id:=split_part(p_name,'/',1)::uuid; v_audit_id:=split_part(p_name,'/',2)::uuid;
 exception when invalid_text_representation then return false; end;
 file_name:=split_part(p_name,'/',3);
 return public.can_read_published_audit_storage(v_work_id,v_audit_id) and exists(
  select 1 from public.published_audits a where a.id=v_audit_id and a.work_id=v_work_id
   and (a.report_file_name=file_name or a.evidence_files ? file_name));
end;
$fn$;

drop function public.read_published_audit_version_report(uuid,integer,text,text,text);
drop function public.republish_audit_change(text,uuid,integer,jsonb,text,jsonb);
drop function dialogo_private.only_item_notes_changed(jsonb,jsonb,text);
drop function public.read_audit_change_source(text,uuid);
drop function public.read_audit_change_items(text,uuid);
drop function public.read_audit_change_requests(text,text,text,uuid[]);
drop function public.decide_audit_change(text,uuid,integer,boolean,text);
drop function public.request_audit_change(text,uuid,text,text);
drop function dialogo_private.require_audit_change_administrator(text,text);
drop function dialogo_private.audit_change_request_json(public.audit_change_requests);
drop trigger published_action_plans_audit_change on public.published_action_plans;
drop function dialogo_private.reject_plan_during_audit_change();
drop trigger published_audits_immutable on public.published_audits;
create trigger published_audits_immutable before update or delete on public.published_audits
  for each row execute function dialogo_private.reject_catalog_revision_mutation();
drop function dialogo_private.guard_published_audit_mutation();
drop table public.published_audit_versions;
drop table public.audit_change_requests;
alter table public.published_audits drop column content_revision;
notify pgrst, 'reload schema';
commit;

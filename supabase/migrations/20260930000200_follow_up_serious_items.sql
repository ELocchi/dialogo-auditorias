-- Allow auditors to classify work findings as serious and expose that choice in
-- the existing compact follow-up projections.
begin;

alter table public.follow_up_work_findings
  add column serious boolean not null default false;

comment on column public.follow_up_work_findings.serious is
  'Manual serious-item classification selected by the responsible auditor.';

create or replace function public.read_follow_up_workspace(
  p_profile text,p_engineering_scope text default null,p_administrative_scope text default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare v_result jsonb; v_module text;
begin
  perform dialogo_private.require_published_audit_profile(p_profile,p_engineering_scope,p_administrative_scope);
  if p_profile not in ('AUDITOR_SEGURANCA','AUDITOR_QUALIDADE') then
    raise exception using errcode = '42501', message = 'follow_up_auditor_profile_required';
  end if;
  v_module := case when p_profile='AUDITOR_SEGURANCA' then 'SEGURANCA' else 'QUALIDADE' end;

  with authorized_works as materialized (
    select w.id from public.access_works w
    where w.ativo and public.has_current_access_grant(p_profile,w.id,v_module)
  ), visible_visits as materialized (
    select v.id from public.audit_visits v join authorized_works w on w.id=v.obra_id
    where v.auditor_auth_user_id=auth.uid() and v.modulo=v_module
      and v.visit_kind='ACOMPANHAMENTO' and v.cancelled_at is null
  )
  select jsonb_build_object('available',true,
    'reports',coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'title',r.title,'visitId',r.visit_id,'revision',r.revision,
      'findings',r.findings,'updatedAt',r.updated_at) order by r.updated_at desc,r.id desc)
      from public.follow_up_reports r join visible_visits v on v.id=r.visit_id
      where r.auditor_auth_user_id=auth.uid()),'[]'::jsonb),
    'drafts',coalesce((select jsonb_agg(jsonb_build_object(
      'visitId',d.visit_id,'revision',d.revision,'findings',d.findings,'updatedAt',d.updated_at)
      order by d.updated_at desc,d.visit_id desc)
      from public.follow_up_finding_drafts d join visible_visits v on v.id=d.visit_id
      where d.auditor_auth_user_id=auth.uid()),'[]'::jsonb),
    'completed',coalesce((select jsonb_agg(c.visit_id::text || ':' || c.finding_id::text order by c.visit_id,c.finding_id)
      from public.follow_up_finding_completions c join visible_visits v on v.id=c.visit_id
      where c.auditor_auth_user_id=auth.uid()),'[]'::jsonb),
    'workFindings',coalesce((select jsonb_agg(jsonb_build_object(
      'id',f.id,'workId',f.work_id,'module',case when f.modulo='SEGURANCA' then 'safety' else 'quality' end,
      'location',f.location,'description',f.description,'correction',f.correction,'serious',f.serious,
      'photoFileName',f.photo_file_name,'createdAt',f.created_at) order by f.created_at desc,f.id desc)
      from public.follow_up_work_findings f join authorized_works w on w.id=f.work_id
      where f.auditor_auth_user_id=auth.uid() and f.modulo=v_module and f.completed_at is null),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;

create or replace function public.read_follow_up_visit(
  p_visit_id uuid,p_profile text,p_engineering_scope text default null,p_administrative_scope text default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare v_result jsonb;
begin
  perform dialogo_private.require_published_audit_profile(p_profile,p_engineering_scope,p_administrative_scope);
  if p_profile not in ('AUDITOR_SEGURANCA','AUDITOR_QUALIDADE') then
    raise exception using errcode = '42501', message = 'follow_up_auditor_profile_required';
  end if;
  with visible as materialized (
    select v.id,v.obra_id,v.modulo from public.audit_visits v join public.access_works w on w.id=v.obra_id
    where v.id=p_visit_id and w.ativo and v.visit_kind='ACOMPANHAMENTO' and v.cancelled_at is null
      and v.published_audit_id is null and v.auditor_auth_user_id=auth.uid()
      and v.modulo=case when p_profile='AUDITOR_SEGURANCA' then 'SEGURANCA' else 'QUALIDADE' end
      and public.has_current_access_grant(p_profile,v.obra_id,v.modulo)
  )
  select jsonb_build_object('available',true,
    'visit',(select dialogo_private.follow_up_visit_metadata(v.id) from visible v),
    'reports',coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'title',r.title,'visitId',r.visit_id,'revision',r.revision,
      'participants',r.participants,'subjects',r.guidance,'decisions',r.decisions,
      'findings',r.findings,'updatedAt',r.updated_at) order by r.updated_at desc,r.id desc)
      from public.follow_up_reports r join visible v on v.id=r.visit_id
      where r.auditor_auth_user_id=auth.uid()),'[]'::jsonb),
    'draft',(select jsonb_build_object('visitId',d.visit_id,'revision',d.revision,
      'findings',d.findings,'updatedAt',d.updated_at)
      from public.follow_up_finding_drafts d join visible v on v.id=d.visit_id
      where d.auditor_auth_user_id=auth.uid()),
    'workFindings',coalesce((select jsonb_agg(jsonb_build_object(
      'id',f.id,'workId',f.work_id,'module',case when f.modulo='SEGURANCA' then 'safety' else 'quality' end,
      'location',f.location,'description',f.description,'correction',f.correction,'serious',f.serious,
      'photoFileName',f.photo_file_name,'createdAt',f.created_at) order by f.created_at desc,f.id desc)
      from public.follow_up_work_findings f join visible v on v.obra_id=f.work_id and v.modulo=f.modulo
      where f.auditor_auth_user_id=auth.uid() and f.completed_at is null),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;

notify pgrst, 'reload schema';
commit;

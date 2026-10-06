begin;
create function public.read_follow_up_editor_header(
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
    'hasReports',exists(select 1 from public.follow_up_reports r join visible v on v.id=r.visit_id where r.auditor_auth_user_id=auth.uid()),
    'hasLegacyReport',exists(select 1 from public.follow_up_reports r join visible v on v.id=r.visit_id where r.id=v.id and r.auditor_auth_user_id=auth.uid()),
    'reports','[]'::jsonb,'draft',null,'workFindings','[]'::jsonb
  ) into v_result;
  return v_result;
end;
$function$;

revoke all on function public.read_follow_up_editor_header(uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.read_follow_up_editor_header(uuid,text,text,text) to authenticated;
create function public.read_follow_up_finding_context(
  p_visit_id uuid,p_finding_id uuid,p_profile text,p_engineering_scope text default null,p_administrative_scope text default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare v_result jsonb;
begin
  if p_finding_id is null then raise exception using errcode='22023',message='finding_required'; end if;
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
      from (select r.* from public.follow_up_reports r where r.visit_id=p_visit_id and r.auditor_auth_user_id=auth.uid()
        and r.findings @> jsonb_build_array(jsonb_build_object('id',p_finding_id)) order by r.updated_at desc,r.id desc limit 1) r join visible v on v.id=r.visit_id
      where r.auditor_auth_user_id=auth.uid()),'[]'::jsonb),
    'draft',(select jsonb_build_object('visitId',d.visit_id,'revision',d.revision,
      'findings',d.findings,'updatedAt',d.updated_at)
      from public.follow_up_finding_drafts d join visible v on v.id=d.visit_id
      where d.auditor_auth_user_id=auth.uid()),
    'workFindings','[]'::jsonb
  ) into v_result;
  return v_result;
end;
$function$;
revoke all on function public.read_follow_up_finding_context(uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.read_follow_up_finding_context(uuid,uuid,text,text,text) to authenticated;
notify pgrst,'reload schema';
commit;

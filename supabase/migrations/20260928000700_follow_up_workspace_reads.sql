-- Compact, read-only follow-up projections. Editing and PDF RPCs remain intact.
begin;

create function public.read_follow_up_workspace(
  p_profile text,p_engineering_scope text default null,p_administrative_scope text default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare v_result jsonb; v_module text;
begin
  perform dialogo_private.require_published_audit_profile(p_profile,p_engineering_scope,p_administrative_scope);
  if p_profile not in ('AUDITOR_SEGURANCA','AUDITOR_QUALIDADE') then
    raise exception using errcode = '42501', message = 'follow_up_auditor_profile_required';
  end if;
  v_module := case when p_profile='AUDITOR_SEGURANCA' then 'SEGURANCA' else 'QUALIDADE' end;

  -- Resolve permissions once per work. All four lists share this statement's
  -- snapshot, including completion state, without locking the account or rows.
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
      'location',f.location,'description',f.description,'correction',f.correction,
      'photoFileName',f.photo_file_name,'createdAt',f.created_at) order by f.created_at desc,f.id desc)
      from public.follow_up_work_findings f join authorized_works w on w.id=f.work_id
      where f.auditor_auth_user_id=auth.uid() and f.modulo=v_module and f.completed_at is null),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;

create function public.read_follow_up_report_index(
  p_profile text,p_engineering_scope text default null,p_administrative_scope text default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare v_result jsonb;
begin
  perform dialogo_private.require_published_audit_profile(p_profile,p_engineering_scope,p_administrative_scope);
  if p_profile <> 'ENGENHARIA' then
    raise exception using errcode = '42501', message = 'follow_up_engineering_profile_required';
  end if;
  with authorized_work_modules as materialized (
    select w.id,m.modulo from public.access_works w cross join (values ('SEGURANCA'),('QUALIDADE')) m(modulo)
    where w.ativo and public.has_current_engineering_scope(p_engineering_scope,w.id,m.modulo)
  )
  select jsonb_build_object('available',true,'reports',coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'title',r.title,'visitId',r.visit_id,'updatedAt',r.updated_at)
    order by r.updated_at desc,r.id desc),'[]'::jsonb)) into v_result
    from public.follow_up_reports r join public.audit_visits v on v.id=r.visit_id
    join authorized_work_modules allowed on allowed.id=v.obra_id and allowed.modulo=v.modulo
    where v.visit_kind='ACOMPANHAMENTO' and v.cancelled_at is null;
  return v_result;
end;
$function$;

-- The metadata endpoint authorizes this exact visit before it touches Storage.
-- Confirmation/date restrictions belong to writes, not the existing photo read.
create function public.can_read_follow_up_visit_photos(
  p_visit_id uuid,p_profile text,p_engineering_scope text default null,p_administrative_scope text default null
) returns boolean language plpgsql stable security definer set search_path = '' as $function$
begin
  perform dialogo_private.require_published_audit_profile(p_profile,p_engineering_scope,p_administrative_scope);
  if p_profile not in ('AUDITOR_SEGURANCA','AUDITOR_QUALIDADE') then
    raise exception using errcode = '42501', message = 'follow_up_auditor_profile_required';
  end if;
  return exists (select 1 from public.audit_visits v join public.access_works w on w.id=v.obra_id
    where v.id=p_visit_id and w.ativo and v.auditor_auth_user_id=auth.uid()
      and v.visit_kind='ACOMPANHAMENTO' and v.cancelled_at is null
      and v.modulo=case when p_profile='AUDITOR_SEGURANCA' then 'SEGURANCA' else 'QUALIDADE' end
      and public.has_current_access_grant(p_profile,v.obra_id,v.modulo));
end;
$function$;

revoke all on function public.read_follow_up_workspace(text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.read_follow_up_report_index(text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.can_read_follow_up_visit_photos(uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.read_follow_up_workspace(text,text,text) to authenticated;
grant execute on function public.read_follow_up_report_index(text,text,text) to authenticated;
grant execute on function public.can_read_follow_up_visit_photos(uuid,text,text,text) to authenticated;
comment on function public.read_follow_up_workspace(text,text,text) is
  'One authorized read-only snapshot of auditor report findings, drafts, completions and active work findings; no report prose, Storage reads or row limits.';
comment on function public.read_follow_up_report_index(text,text,text) is
  'Engineering report links only, restricted to the selected engineering scope and current work/module grants.';
notify pgrst, 'reload schema';
commit;

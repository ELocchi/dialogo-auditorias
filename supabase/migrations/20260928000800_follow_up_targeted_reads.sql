-- Target one follow-up visit/report/photo before building its full projection.
-- Existing write RPCs and their row/advisory locks remain unchanged.
begin;

create function dialogo_private.follow_up_visit_metadata(p_visit_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $function$
  select jsonb_build_object(
    'id',v.id,'workId',v.obra_id,'workName',w.nome,
    'module',case v.modulo when 'SEGURANCA' then 'safety' else 'quality' end,
    'kind','follow_up','modelId',v.modelo_id,'auditorId',v.auditor_auth_user_id,
    'date',to_char(v.data_prevista,'YYYY-MM-DD'),'note',v.observacao,
    'createdBy',v.created_by,'createdAt',v.created_at,'revision',v.revision,
    'confirmationStatus',v.confirmation_status,'confirmedAt',v.confirmed_at,
    'auditorName',ar.nome,'createdByName',cr.nome,
    'history',(select coalesce(jsonb_agg(jsonb_build_object(
      'previousDate',e.before_snapshot->>'data_prevista','date',e.after_snapshot->>'data_prevista',
      'note',e.after_snapshot->>'observacao','changedBy',e.actor_auth_user_id,'changedAt',e.occurred_at)
      order by e.revision,e.occurred_at,e.id),'[]'::jsonb)
      from public.audit_visit_events e where e.visit_id=v.id and e.event_type='rescheduled'))
  from public.audit_visits v join public.access_works w on w.id=v.obra_id
    join public.access_requests ar on ar.auth_user_id=v.auditor_auth_user_id
    join public.access_requests cr on cr.auth_user_id=v.created_by
  where v.id=p_visit_id and v.visit_kind='ACOMPANHAMENTO';
$function$;
revoke all on function dialogo_private.follow_up_visit_metadata(uuid) from public,anon,authenticated,service_role;

create function public.read_follow_up_visit(
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
      'location',f.location,'description',f.description,'correction',f.correction,
      'photoFileName',f.photo_file_name,'createdAt',f.created_at) order by f.created_at desc,f.id desc)
      from public.follow_up_work_findings f join visible v on v.obra_id=f.work_id and v.modulo=f.modulo
      where f.auditor_auth_user_id=auth.uid() and f.completed_at is null),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;

create function public.read_follow_up_report_detail(
  p_visit_id uuid,p_profile text,p_engineering_scope text default null,p_administrative_scope text default null,
  p_report_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare v_result jsonb;
begin
  perform dialogo_private.require_published_audit_profile(p_profile,p_engineering_scope,p_administrative_scope);
  if p_profile not in ('AUDITOR_SEGURANCA','AUDITOR_QUALIDADE','ENGENHARIA') then
    raise exception using errcode = '42501', message = 'follow_up_reader_profile_required';
  end if;
  with visible as materialized (
    select v.id,v.obra_id,v.modulo,v.auditor_auth_user_id
    from public.audit_visits v join public.access_works w on w.id=v.obra_id
    where v.id=p_visit_id and w.ativo and v.visit_kind='ACOMPANHAMENTO' and v.cancelled_at is null
      and v.published_audit_id is null and (
        (p_profile='ENGENHARIA' and public.has_current_engineering_scope(p_engineering_scope,v.obra_id,v.modulo))
        or (p_profile in ('AUDITOR_SEGURANCA','AUDITOR_QUALIDADE') and v.auditor_auth_user_id=auth.uid()
          and v.modulo=case when p_profile='AUDITOR_SEGURANCA' then 'SEGURANCA' else 'QUALIDADE' end
          and public.has_current_access_grant(p_profile,v.obra_id,v.modulo)))
  ), candidates as materialized (
    select r.id from public.follow_up_reports r join visible v on v.id=r.visit_id
    where (p_report_id is null or r.id=p_report_id)
      and (p_profile='ENGENHARIA' or r.auditor_auth_user_id=auth.uid())
  ), selected_report as materialized (
    select r.* from public.follow_up_reports r join candidates c on c.id=r.id
    where p_report_id is not null or (select count(*) from candidates)=1
  )
  select jsonb_build_object('available',true,
    'visit',(select dialogo_private.follow_up_visit_metadata(v.id) from visible v),
    'report',(select jsonb_build_object('id',r.id,'title',r.title,'visitId',r.visit_id,'revision',r.revision,
      'participants',r.participants,'subjects',r.guidance,'decisions',r.decisions,
      'findings',r.findings,'updatedAt',r.updated_at) from selected_report r),
    'workPhotos',coalesce((select jsonb_agg(jsonb_build_object(
      'findingId',f.id,'fileName',f.photo_file_name,'scopeId',f.work_id) order by f.id)
      from selected_report r cross join lateral jsonb_array_elements(r.findings) item
      join public.follow_up_work_findings f on f.id=(item->>'id')::uuid
      join visible v on v.obra_id=f.work_id and v.modulo=f.modulo
        and v.auditor_auth_user_id=f.auditor_auth_user_id),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;

create function public.can_read_follow_up_finding_photo(
  p_visit_id uuid,p_finding_id uuid,p_file_name text,p_profile text,
  p_engineering_scope text default null,p_administrative_scope text default null
) returns boolean language plpgsql stable security definer set search_path = '' as $function$
begin
  perform dialogo_private.require_published_audit_profile(p_profile,p_engineering_scope,p_administrative_scope);
  if p_profile not in ('AUDITOR_SEGURANCA','AUDITOR_QUALIDADE') then
    raise exception using errcode = '42501', message = 'follow_up_auditor_profile_required';
  end if;
  if p_visit_id is null or p_finding_id is null or p_file_name is null
    or p_file_name !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$'
    or lower(split_part(p_file_name,'_',1))<>p_finding_id::text then return false; end if;
  return exists (
    select 1 from public.audit_visits v join public.access_works w on w.id=v.obra_id
    where v.id=p_visit_id and w.ativo and v.visit_kind='ACOMPANHAMENTO' and v.cancelled_at is null
      and v.published_audit_id is null and v.auditor_auth_user_id=auth.uid()
      and v.modulo=case when p_profile='AUDITOR_SEGURANCA' then 'SEGURANCA' else 'QUALIDADE' end
      and public.has_current_access_grant(p_profile,v.obra_id,v.modulo)
      and (exists (select 1 from public.follow_up_finding_drafts d
        cross join lateral jsonb_array_elements(d.findings) item
        where d.visit_id=v.id and d.auditor_auth_user_id=auth.uid() and lower(item->>'id')=p_finding_id::text)
        or exists (select 1 from public.follow_up_reports r
          cross join lateral jsonb_array_elements(r.findings) item
          where r.visit_id=v.id and r.auditor_auth_user_id=auth.uid() and lower(item->>'id')=p_finding_id::text))
      -- Recheck object existence even when the application has a warm thumbnail.
      -- No directory listing, Storage download, signing or visit-wide payload.
      and exists (select 1 from storage.objects o where o.bucket_id='follow-up-photos'
        and o.name=auth.uid()::text || '/' || v.id::text || '/' || p_file_name)
  );
end;
$function$;

revoke all on function public.read_follow_up_visit(uuid,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.read_follow_up_report_detail(uuid,text,text,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.can_read_follow_up_finding_photo(uuid,uuid,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.read_follow_up_visit(uuid,text,text,text) to authenticated;
grant execute on function public.read_follow_up_report_detail(uuid,text,text,text,uuid) to authenticated;
grant execute on function public.can_read_follow_up_finding_photo(uuid,uuid,text,text,text,text) to authenticated;
comment on function public.read_follow_up_visit(uuid,text,text,text) is
  'Complete editor/action context for one authorized auditor follow-up visit in a single read-only snapshot; no global agenda/history or silent limits.';
comment on function public.read_follow_up_report_detail(uuid,text,text,text,uuid) is
  'One authorized full report and its work photo references; absent report ID succeeds only when the visit has exactly one readable report.';
comment on function public.can_read_follow_up_finding_photo(uuid,uuid,text,text,text,text) is
  'Revalidates exact auditor, work/module grant, active visit, finding and Storage object existence before original/thumbnail reads, including warm caches.';
notify pgrst, 'reload schema';
commit;

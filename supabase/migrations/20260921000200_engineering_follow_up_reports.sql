-- Engineering reads published orientative reports for its currently authorized works.
begin;

create or replace function public.read_follow_up_reports(p_profile text)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_result jsonb;
begin
  if p_profile not in ('AUDITOR_SEGURANCA','AUDITOR_QUALIDADE','ENGENHARIA') or p_profile is null then
    raise exception using errcode = '42501', message = 'follow_up_reader_profile_required';
  end if;
  perform dialogo_private.lock_agenda_identity(auth.uid(), p_profile);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'title',r.title,'visitId',r.visit_id,'revision',r.revision,'participants',r.participants,
    'subjects',r.guidance,'decisions',r.decisions,'findings',r.findings,'updatedAt',r.updated_at)
    order by r.updated_at desc),'[]'::jsonb)
  into v_result
  from public.follow_up_reports r
    join public.audit_visits v on v.id = r.visit_id
    join public.access_works w on w.id = v.obra_id
  where v.visit_kind = 'ACOMPANHAMENTO' and v.cancelled_at is null and w.ativo and (
    (p_profile in ('AUDITOR_SEGURANCA','AUDITOR_QUALIDADE')
      and r.auditor_auth_user_id = auth.uid() and v.auditor_auth_user_id = auth.uid()
      and v.modulo = case p_profile when 'AUDITOR_SEGURANCA' then 'SEGURANCA' else 'QUALIDADE' end
      and public.has_current_access_grant(p_profile,v.obra_id,v.modulo))
    or (p_profile = 'ENGENHARIA'
      and public.has_current_access_grant('ENGENHARIA',v.obra_id,v.modulo))
  );
  return v_result;
end;
$function$;

drop policy if exists work_findings_engineering_read on public.follow_up_work_findings;
create policy work_findings_engineering_read on public.follow_up_work_findings for select to authenticated
  using (public.has_current_access_grant('ENGENHARIA',work_id,modulo));

create policy "follow_up_photos_engineering_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'follow-up-photos' and (
    exists (select 1 from public.audit_visits v
      where v.id::text = (storage.foldername(name))[2]
        and v.auditor_auth_user_id::text = (storage.foldername(name))[1]
        and v.visit_kind = 'ACOMPANHAMENTO' and v.cancelled_at is null
        and public.has_current_access_grant('ENGENHARIA',v.obra_id,v.modulo))
    or exists (select 1 from public.follow_up_work_findings f
      where f.work_id::text = (storage.foldername(name))[2]
        and f.auditor_auth_user_id::text = (storage.foldername(name))[1]
        and public.has_current_access_grant('ENGENHARIA',f.work_id,f.modulo))
  ));

commit;

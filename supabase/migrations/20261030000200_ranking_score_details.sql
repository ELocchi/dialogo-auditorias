-- The ranking export shows the score before the accident penalty and the penalty itself.
-- Both are already part of the published score (final_score = raw_score - accident_penalty).
begin;
create or replace function public.read_global_audit_ranking()
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
begin
  if auth.uid() is null or not public.is_current_access_active() then
    raise exception using errcode = '42501', message = 'active_profile_required';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'workId', a.work_id,
      'workName', w.nome,
      'month', to_char(a.audit_date, 'YYYY-MM'),
      'discipline', case a.modulo when 'SEGURANCA' then 'safety' else 'quality' end,
      'score', a.final_score,
      'rawScore', a.raw_score,
      'penalty', a.accident_penalty
    ) order by a.audit_date, a.work_id, a.id)
    from public.published_audits a
    join public.access_works w on w.id = a.work_id
  ), '[]'::jsonb);
end;
$function$;
revoke all on function public.read_global_audit_ranking() from public, anon, authenticated, service_role;
grant execute on function public.read_global_audit_ranking() to authenticated;
comment on function public.read_global_audit_ranking() is
  'Same published work/month/discipline scores for every active user, independent of work assignments. Includes the pre-penalty score and accident penalty. No audit IDs, findings, responses, people or documents.';
notify pgrst, 'reload schema';
commit;

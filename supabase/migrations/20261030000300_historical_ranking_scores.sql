-- Monthly scores from before the platform (spreadsheet "Ranking obras - 2026"), used only by the ranking.
-- They have no report, findings or photos. A published audit for the same work, discipline and month
-- always takes precedence, so the ranking never sees two conflicting values for one month.
begin;
create table public.historical_ranking_scores (
  work_id uuid not null references public.access_works(id) on delete restrict,
  modulo text not null check (modulo in ('SEGURANCA','QUALIDADE')),
  month date not null check (month = date_trunc('month', month)::date),
  score numeric(4,2) not null check (score >= 0 and score <= 10),
  source text not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (work_id, modulo, month)
);
alter table public.historical_ranking_scores enable row level security;
revoke all on table public.historical_ranking_scores from public, anon, authenticated, service_role;
comment on table public.historical_ranking_scores is
  'Imported monthly ranking scores without audit reports. Read only through read_global_audit_ranking.';

create or replace function public.read_global_audit_ranking()
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
begin
  if auth.uid() is null or not public.is_current_access_active() then
    raise exception using errcode = '42501', message = 'active_profile_required';
  end if;
  return coalesce((
    select jsonb_agg(r.item order by r.month, r.work_id, r.sort_key)
    from (
      select a.audit_date as month, a.work_id, a.id::text as sort_key, jsonb_build_object(
        'workId', a.work_id,
        'workName', w.nome,
        'month', to_char(a.audit_date, 'YYYY-MM'),
        'discipline', case a.modulo when 'SEGURANCA' then 'safety' else 'quality' end,
        'score', a.final_score,
        'rawScore', a.raw_score,
        'penalty', a.accident_penalty
      ) as item
      from public.published_audits a
      join public.access_works w on w.id = a.work_id
      union all
      select h.month, h.work_id, 'historical' as sort_key, jsonb_build_object(
        'workId', h.work_id,
        'workName', w.nome,
        'month', to_char(h.month, 'YYYY-MM'),
        'discipline', case h.modulo when 'SEGURANCA' then 'safety' else 'quality' end,
        'score', h.score
      ) as item
      from public.historical_ranking_scores h
      join public.access_works w on w.id = h.work_id
      where not exists (
        select 1 from public.published_audits a
        where a.work_id = h.work_id and a.modulo = h.modulo
          and a.audit_date >= h.month and a.audit_date < h.month + interval '1 month')
    ) r
  ), '[]'::jsonb);
end;
$function$;
revoke all on function public.read_global_audit_ranking() from public, anon, authenticated, service_role;
grant execute on function public.read_global_audit_ranking() to authenticated;
comment on function public.read_global_audit_ranking() is
  'Same published work/month/discipline scores for every active user, independent of work assignments, plus imported historical scores for months without a published audit. No audit IDs, findings, responses, people or documents.';
notify pgrst, 'reload schema';
commit;

begin;

create table public.follow_up_finding_completions (
  visit_id uuid not null references public.audit_visits(id) on delete restrict,
  finding_id uuid not null,
  auditor_auth_user_id uuid not null references public.access_accounts(auth_user_id) on delete restrict,
  completed_at timestamptz not null default clock_timestamp(),
  primary key (visit_id, finding_id)
);

alter table public.follow_up_finding_completions enable row level security;
revoke all on public.follow_up_finding_completions from public, anon, authenticated, service_role;
grant select, insert on public.follow_up_finding_completions to authenticated;

create policy follow_up_completion_select on public.follow_up_finding_completions
for select to authenticated using (
  auditor_auth_user_id = auth.uid()
);

create policy follow_up_completion_insert on public.follow_up_finding_completions
for insert to authenticated with check (
  auditor_auth_user_id = auth.uid()
);

create function dialogo_private.lock_closed_follow_up_report()
returns trigger language plpgsql set search_path = '' as $function$
begin
  raise exception using errcode = '42501', message = 'follow_up_report_closed';
end;
$function$;

create trigger lock_closed_follow_up_report
before update or delete on public.follow_up_reports
for each row execute function dialogo_private.lock_closed_follow_up_report();

commit;

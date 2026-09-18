begin;

create table public.follow_up_work_findings (
  id uuid primary key,
  work_id uuid not null references public.access_works(id) on delete restrict,
  auditor_auth_user_id uuid not null references public.access_accounts(auth_user_id) on delete restrict,
  location text not null default '' check (char_length(location) <= 200),
  description text not null check (char_length(btrim(description)) between 5 and 2000),
  correction text not null check (char_length(btrim(correction)) between 5 and 2000),
  photo_file_name text not null check (photo_file_name ~* '^[0-9a-f-]{36}_[0-9a-f-]{36}\.(jpg|png)$'),
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz
);
create index follow_up_work_findings_owner on public.follow_up_work_findings(auditor_auth_user_id, created_at desc);
alter table public.follow_up_work_findings enable row level security;
revoke all on public.follow_up_work_findings from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.follow_up_work_findings to authenticated;

create policy work_findings_read on public.follow_up_work_findings for select to authenticated
  using (auditor_auth_user_id = auth.uid());
create policy work_findings_insert on public.follow_up_work_findings for insert to authenticated
  with check (auditor_auth_user_id = auth.uid() and completed_at is null and (
    public.has_current_access_grant('AUDITOR_SEGURANCA',work_id,'SEGURANCA')
    or public.has_current_access_grant('AUDITOR_QUALIDADE',work_id,'QUALIDADE')));
create policy work_findings_update on public.follow_up_work_findings for update to authenticated
  using (auditor_auth_user_id = auth.uid()) with check (auditor_auth_user_id = auth.uid());
create policy work_findings_delete on public.follow_up_work_findings for delete to authenticated
  using (auditor_auth_user_id = auth.uid() and completed_at is null);

commit;

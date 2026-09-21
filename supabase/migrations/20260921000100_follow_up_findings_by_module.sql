begin;

alter table public.follow_up_work_findings
  add column modulo text check (modulo in ('SEGURANCA', 'QUALIDADE'));

update public.follow_up_work_findings f set modulo = case
  when exists (select 1 from public.access_grants g where g.auth_user_id=f.auditor_auth_user_id and g.obra_id=f.work_id and g.perfil='AUDITOR_SEGURANCA' and g.modulo='SEGURANCA')
   and not exists (select 1 from public.access_grants g where g.auth_user_id=f.auditor_auth_user_id and g.obra_id=f.work_id and g.perfil='AUDITOR_QUALIDADE' and g.modulo='QUALIDADE') then 'SEGURANCA'
  when exists (select 1 from public.access_grants g where g.auth_user_id=f.auditor_auth_user_id and g.obra_id=f.work_id and g.perfil='AUDITOR_QUALIDADE' and g.modulo='QUALIDADE')
   and not exists (select 1 from public.access_grants g where g.auth_user_id=f.auditor_auth_user_id and g.obra_id=f.work_id and g.perfil='AUDITOR_SEGURANCA' and g.modulo='SEGURANCA') then 'QUALIDADE'
  else null end;

create index follow_up_work_findings_owner_module
  on public.follow_up_work_findings(auditor_auth_user_id, modulo, created_at desc);

drop policy work_findings_insert on public.follow_up_work_findings;
drop policy work_findings_update on public.follow_up_work_findings;

create policy work_findings_insert on public.follow_up_work_findings for insert to authenticated
  with check (auditor_auth_user_id = auth.uid() and completed_at is null and (
    (modulo = 'SEGURANCA' and public.has_current_access_grant('AUDITOR_SEGURANCA',work_id,'SEGURANCA'))
    or (modulo = 'QUALIDADE' and public.has_current_access_grant('AUDITOR_QUALIDADE',work_id,'QUALIDADE'))));

create policy work_findings_update on public.follow_up_work_findings for update to authenticated
  using (auditor_auth_user_id = auth.uid()) with check (auditor_auth_user_id = auth.uid() and (
    (modulo = 'SEGURANCA' and public.has_current_access_grant('AUDITOR_SEGURANCA',work_id,'SEGURANCA'))
    or (modulo = 'QUALIDADE' and public.has_current_access_grant('AUDITOR_QUALIDADE',work_id,'QUALIDADE'))));

comment on column public.follow_up_work_findings.modulo is
  'Separates work findings created under the Safety and Quality auditor profiles. Null is retained only for ambiguous legacy rows and is excluded by application reads.';

commit;

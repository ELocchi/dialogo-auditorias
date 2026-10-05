-- Orientative reports are documents of a work/discipline, independent of the agenda.
begin;

create table public.standalone_follow_up_reports (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.access_works(id) on delete restrict,
  modulo text not null check (modulo in ('SEGURANCA','QUALIDADE')),
  auditor_auth_user_id uuid not null references public.access_accounts(auth_user_id) on delete restrict,
  work_name text not null,
  auditor_name text not null,
  report_date date not null check (isfinite(report_date) and report_date between date '0001-01-01' and date '9999-12-31'),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  participants text not null check (char_length(participants) <= 5000),
  subjects text not null check (char_length(btrim(subjects)) between 1 and 10000),
  decisions text not null check (char_length(decisions) <= 10000),
  findings jsonb not null check (jsonb_typeof(findings)='array' and jsonb_array_length(findings)<=30),
  photos jsonb not null check (jsonb_typeof(photos)='array'),
  request_id uuid not null,
  request_payload jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(auditor_auth_user_id,request_id)
);
create index standalone_follow_up_reports_work on public.standalone_follow_up_reports(work_id,modulo,created_at desc);
create index standalone_follow_up_reports_author on public.standalone_follow_up_reports(auditor_auth_user_id,modulo,created_at desc);
alter table public.standalone_follow_up_reports enable row level security;
revoke all on public.standalone_follow_up_reports from public,anon,authenticated,service_role;
create trigger standalone_follow_up_reports_immutable before update or delete on public.standalone_follow_up_reports
  for each row execute function dialogo_private.reject_catalog_revision_mutation();
create trigger standalone_follow_up_reports_no_truncate before truncate on public.standalone_follow_up_reports
  for each statement execute function dialogo_private.reject_catalog_revision_mutation();

create function dialogo_private.standalone_report_header(r public.standalone_follow_up_reports)
returns jsonb language sql immutable set search_path='' as $f$
  select jsonb_build_object('id',r.id,'workId',r.work_id,'module',case r.modulo when 'SEGURANCA' then 'safety' else 'quality' end,
    'workName',r.work_name,'auditorId',r.auditor_auth_user_id,'auditorName',r.auditor_name,
    'date',r.report_date,'title',r.title,'updatedAt',r.created_at);
$f$;
revoke all on function dialogo_private.standalone_report_header(public.standalone_follow_up_reports) from public,anon,authenticated,service_role;

create function public.save_standalone_follow_up_report(p_profile text,p_work_id uuid,p_date date,p_title text,
  p_participants text,p_subjects text,p_decisions text,p_finding_ids uuid[],p_request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $f$
declare
  v_module text; v_payload jsonb; v_existing public.standalone_follow_up_reports%rowtype;
  v_findings jsonb := '[]'; v_photos jsonb := '[]'; v_finding public.follow_up_work_findings%rowtype;
  v_id uuid; v_finding_id uuid; v_work_name text; v_auditor_name text;
begin
  if p_profile is null or p_profile not in ('AUDITOR_SEGURANCA','AUDITOR_QUALIDADE') then
    raise exception using errcode='42501',message='auditor_profile_required';
  end if;
  v_module := case p_profile when 'AUDITOR_SEGURANCA' then 'SEGURANCA' else 'QUALIDADE' end;
  perform dialogo_private.lock_visit_auditor(auth.uid(),p_work_id,v_module);
  if p_request_id is null or p_date is null or not isfinite(p_date)
    or p_date < date '0001-01-01' or p_date > (clock_timestamp() at time zone 'America/Sao_Paulo')::date
    or p_title is null or char_length(btrim(p_title)) not between 1 and 120
    or p_participants is null or char_length(p_participants)>5000
    or p_subjects is null or char_length(btrim(p_subjects)) not between 1 and 10000
    or p_decisions is null or char_length(p_decisions)>10000
    or p_finding_ids is null or cardinality(p_finding_ids)>30
    or exists(select 1 from unnest(p_finding_ids) x where x is null)
    or (select count(distinct x) from unnest(p_finding_ids) x)<>cardinality(p_finding_ids) then
    raise exception using errcode='22023',message='invalid_standalone_report';
  end if;
  v_payload := jsonb_build_object('profile',p_profile,'workId',p_work_id,'date',p_date,'title',btrim(p_title),
    'participants',btrim(p_participants),'subjects',btrim(p_subjects),'decisions',btrim(p_decisions),'findingIds',to_jsonb(p_finding_ids));
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_request_id::text,202610020001));
  select * into v_existing from public.standalone_follow_up_reports
    where auditor_auth_user_id=auth.uid() and request_id=p_request_id;
  if found then
    if v_existing.request_payload is distinct from v_payload then
      raise exception using errcode='22023',message='standalone_report_request_reused';
    end if;
    return v_existing.id;
  end if;
  foreach v_finding_id in array p_finding_ids loop
    select * into v_finding from public.follow_up_work_findings where id=v_finding_id
      and work_id=p_work_id and modulo=v_module and auditor_auth_user_id=auth.uid() and completed_at is null for share;
    if not found then raise exception using errcode='42501',message='report_finding_unavailable'; end if;
    perform 1 from storage.objects where bucket_id='follow-up-photos'
      and name=auth.uid()::text||'/'||p_work_id::text||'/'||v_finding.photo_file_name for share;
    if not found then raise exception using errcode='23514',message='report_photo_unavailable'; end if;
    v_findings := v_findings || jsonb_build_array(jsonb_build_object('id',v_finding.id,'location',v_finding.location,
      'description',v_finding.description,'correction',v_finding.correction,'serious',v_finding.serious));
    v_photos := v_photos || jsonb_build_array(jsonb_build_object('findingId',v_finding.id,'fileName',v_finding.photo_file_name));
  end loop;
  select nome into v_work_name from public.access_works where id=p_work_id;
  select nome into v_auditor_name from public.access_requests where auth_user_id=auth.uid();
  insert into public.standalone_follow_up_reports(work_id,modulo,auditor_auth_user_id,work_name,auditor_name,
    report_date,title,participants,subjects,decisions,findings,photos,request_id,request_payload)
  values(p_work_id,v_module,auth.uid(),v_work_name,v_auditor_name,p_date,btrim(p_title),btrim(p_participants),
    btrim(p_subjects),btrim(p_decisions),v_findings,v_photos,p_request_id,v_payload) returning id into v_id;
  return v_id;
end;
$f$;

-- A compact index, or one full document. Neither read depends on audit_visits.
create function public.read_standalone_follow_up_reports(p_profile text,p_engineering_scope text default null,
  p_administrative_scope text default null,p_report_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $f$
declare v_result jsonb;
begin
  perform dialogo_private.require_published_audit_profile(p_profile,p_engineering_scope,p_administrative_scope);
  if p_profile not in ('AUDITOR_SEGURANCA','AUDITOR_QUALIDADE','ENGENHARIA') then
    raise exception using errcode='42501',message='report_profile_required';
  end if;
  select jsonb_build_object('available',true,'reports',coalesce(jsonb_agg(
    dialogo_private.standalone_report_header(r) || case when p_report_id is null then '{}'::jsonb
      else jsonb_build_object('participants',r.participants,'subjects',r.subjects,'decisions',r.decisions,'findings',r.findings,'photos',r.photos) end
    order by r.created_at desc,r.id),'[]'::jsonb)) into v_result
  from public.standalone_follow_up_reports r
  where (p_report_id is null or r.id=p_report_id) and (
    (p_profile='ENGENHARIA' and public.has_current_engineering_scope(p_engineering_scope,r.work_id,r.modulo))
    or (p_profile in ('AUDITOR_SEGURANCA','AUDITOR_QUALIDADE') and r.auditor_auth_user_id=auth.uid()
      and public.has_current_access_grant(p_profile,r.work_id,r.modulo)));
  return v_result;
end;
$f$;

create function public.read_standalone_report_findings(p_profile text,p_work_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $f$
declare v_module text; v_result jsonb;
begin
  perform dialogo_private.require_published_audit_profile(p_profile,null,null);
  v_module := case p_profile when 'AUDITOR_SEGURANCA' then 'SEGURANCA' when 'AUDITOR_QUALIDADE' then 'QUALIDADE' end;
  if v_module is null or not public.has_current_access_grant(p_profile,p_work_id,v_module) then
    raise exception using errcode='42501',message='authorized_work_required';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'location',f.location,'description',f.description,
    'correction',f.correction,'serious',f.serious) order by f.created_at desc,f.id),'[]'::jsonb) into v_result
  from public.follow_up_work_findings f where f.work_id=p_work_id and f.modulo=v_module
    and f.auditor_auth_user_id=auth.uid() and f.completed_at is null;
  return v_result;
end;
$f$;

-- Preserve evidence referenced by a closed document, including after a finding is completed/deleted.
create function public.is_standalone_report_photo(p_name text,p_reader boolean default false)
returns boolean language sql stable security definer set search_path='' as $f$
  select exists(select 1 from public.standalone_follow_up_reports r
    cross join lateral jsonb_array_elements(r.photos) photo
    where p_name=r.auditor_auth_user_id::text||'/'||r.work_id::text||'/'||(photo->>'fileName')
      and (not p_reader or public.has_current_access_grant('ENGENHARIA',r.work_id,r.modulo)));
$f$;
create policy standalone_report_photo_read on storage.objects for select to authenticated
  using(bucket_id='follow-up-photos' and public.is_standalone_report_photo(name,true));
create policy standalone_report_photo_keep on storage.objects as restrictive for delete to authenticated
  using(bucket_id<>'follow-up-photos' or not public.is_standalone_report_photo(name));
create policy standalone_report_photo_no_replace on storage.objects as restrictive for update to authenticated
  using(bucket_id<>'follow-up-photos' or not public.is_standalone_report_photo(name))
  with check(bucket_id<>'follow-up-photos' or not public.is_standalone_report_photo(name));

revoke all on function public.save_standalone_follow_up_report(text,uuid,date,text,text,text,text,uuid[],uuid),
  public.read_standalone_follow_up_reports(text,text,text,uuid),public.read_standalone_report_findings(text,uuid),
  public.is_standalone_report_photo(text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.save_standalone_follow_up_report(text,uuid,date,text,text,text,text,uuid[],uuid),
  public.read_standalone_follow_up_reports(text,text,text,uuid),public.read_standalone_report_findings(text,uuid),
  public.is_standalone_report_photo(text,boolean) to authenticated;
commit;

-- Orientative reports belong to confirmed follow-up visits. They never carry
-- audit criteria, answers or a monthly score.
begin;

create table public.follow_up_reports (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null unique references public.audit_visits(id) on delete restrict,
  auditor_auth_user_id uuid not null references public.access_accounts(auth_user_id) on delete restrict,
  guidance text not null check (char_length(guidance) between 20 and 10000),
  findings jsonb not null default '[]'::jsonb check (jsonb_typeof(findings) = 'array'),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index follow_up_reports_auditor on public.follow_up_reports(auditor_auth_user_id, updated_at desc);
alter table public.follow_up_reports enable row level security;
revoke all on public.follow_up_reports from public, anon, authenticated, service_role;

create function public.read_follow_up_reports(p_profile text)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_result jsonb;
begin
  if p_profile not in ('AUDITOR_SEGURANCA','AUDITOR_QUALIDADE') or p_profile is null then
    raise exception using errcode = '42501', message = 'auditor_profile_required';
  end if;
  perform dialogo_private.lock_agenda_identity(auth.uid(), p_profile);
  select coalesce(jsonb_agg(jsonb_build_object(
    'visitId',r.visit_id,'revision',r.revision,'guidance',r.guidance,
    'findings',r.findings,'updatedAt',r.updated_at) order by r.updated_at desc),'[]'::jsonb)
    into v_result
  from public.follow_up_reports r
    join public.audit_visits v on v.id = r.visit_id
    join public.access_works w on w.id = v.obra_id
  where r.auditor_auth_user_id = auth.uid() and v.auditor_auth_user_id = auth.uid()
    and v.visit_kind = 'ACOMPANHAMENTO' and v.cancelled_at is null and w.ativo
    and v.modulo = case p_profile when 'AUDITOR_SEGURANCA' then 'SEGURANCA' else 'QUALIDADE' end
    and public.has_current_access_grant(p_profile,v.obra_id,v.modulo);
  return v_result;
end;
$function$;

create function public.save_follow_up_report(
  p_profile text,p_visit_id uuid,p_expected_revision integer,p_guidance text,p_findings jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_visit public.audit_visits%rowtype; v_report public.follow_up_reports%rowtype; v_module text;
begin
  if p_profile not in ('AUDITOR_SEGURANCA','AUDITOR_QUALIDADE') or p_profile is null
    or p_visit_id is null or p_expected_revision is null or p_expected_revision < 0
    or p_guidance is null or char_length(btrim(p_guidance)) < 20 or char_length(p_guidance) > 10000
    or p_findings is null or jsonb_typeof(p_findings) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'invalid_follow_up_report';
  end if;
  if jsonb_array_length(p_findings) > 30 then
    raise exception using errcode = '22023', message = 'invalid_follow_up_report';
  end if;
  v_module := case p_profile when 'AUDITOR_SEGURANCA' then 'SEGURANCA' else 'QUALIDADE' end;
  if exists (select 1 from jsonb_array_elements(p_findings) f(item)
    where jsonb_typeof(f.item) is distinct from 'object'
      or (select count(*) from jsonb_object_keys(case when jsonb_typeof(f.item) = 'object' then f.item else '{}'::jsonb end)) <> 4
      or not (f.item ?& array['id','location','description','correction'])
      or jsonb_typeof(f.item->'id') is distinct from 'string'
      or (f.item->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(f.item->'location') is distinct from 'string'
      or char_length(f.item->>'location') > 200
      or jsonb_typeof(f.item->'description') is distinct from 'string'
      or char_length(btrim(f.item->>'description')) < 5 or char_length(f.item->>'description') > 2000
      or jsonb_typeof(f.item->'correction') is distinct from 'string'
      or char_length(btrim(f.item->>'correction')) < 5 or char_length(f.item->>'correction') > 2000)
    or exists (select 1 from jsonb_array_elements(p_findings) f(item)
      group by f.item->>'id' having count(*) > 1) then
    raise exception using errcode = '22023', message = 'invalid_follow_up_finding';
  end if;

  select * into v_visit from public.audit_visits where id = p_visit_id for share;
  if not found then raise exception using errcode = 'P0002', message = 'follow_up_visit_not_found'; end if;
  if v_visit.visit_kind <> 'ACOMPANHAMENTO' or v_visit.cancelled_at is not null
    or v_visit.confirmation_status <> 'confirmed' or v_visit.auditor_auth_user_id <> auth.uid()
    or v_visit.modulo <> v_module
    or v_visit.data_prevista > (clock_timestamp() at time zone 'America/Sao_Paulo')::date then
    raise exception using errcode = '42501', message = 'confirmed_follow_up_required';
  end if;
  perform dialogo_private.lock_visit_auditor(auth.uid(),v_visit.obra_id,v_visit.modulo);

  -- Serialize first submissions for the same visit as well as later edits.
  perform pg_advisory_xact_lock(hashtextextended(p_visit_id::text,704209170004));
  select * into v_report from public.follow_up_reports where visit_id = p_visit_id for update;
  if not found then
    if v_visit.data_prevista <> (clock_timestamp() at time zone 'America/Sao_Paulo')::date then
      raise exception using errcode = '42501', message = 'follow_up_report_only_on_visit_date';
    end if;
    if p_expected_revision <> 0 then raise exception using errcode = '40001', message = 'follow_up_revision_changed'; end if;
    insert into public.follow_up_reports(visit_id,auditor_auth_user_id,guidance,findings)
      values(p_visit_id,auth.uid(),btrim(p_guidance),p_findings) returning * into v_report;
  else
    if v_report.auditor_auth_user_id <> auth.uid() or v_report.revision <> p_expected_revision then
      raise exception using errcode = '40001', message = 'follow_up_revision_changed';
    end if;
    update public.follow_up_reports set guidance = btrim(p_guidance),findings = p_findings,
      revision = revision + 1,updated_at = clock_timestamp()
      where id = v_report.id returning * into v_report;
  end if;
  return jsonb_build_object('visitId',v_report.visit_id,'revision',v_report.revision,
    'guidance',v_report.guidance,'findings',v_report.findings,'updatedAt',v_report.updated_at);
end;
$function$;

revoke all on function public.read_follow_up_reports(text),
  public.save_follow_up_report(text,uuid,integer,text,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.read_follow_up_reports(text),
  public.save_follow_up_report(text,uuid,integer,text,jsonb) to authenticated;

commit;

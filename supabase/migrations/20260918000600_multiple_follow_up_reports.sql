-- Allow multiple immutable orientative reports for one confirmed visit.
begin;
alter table public.follow_up_reports drop constraint if exists follow_up_reports_visit_id_key;
create index if not exists follow_up_reports_visit on public.follow_up_reports(visit_id, created_at desc);
create or replace function public.read_follow_up_reports(p_profile text)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_result jsonb;
begin
  if p_profile not in ('AUDITOR_SEGURANCA','AUDITOR_QUALIDADE') or p_profile is null then
    raise exception using errcode = '42501', message = 'auditor_profile_required';
  end if;
  perform dialogo_private.lock_agenda_identity(auth.uid(), p_profile);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'visitId',r.visit_id,'revision',r.revision,'participants',r.participants,
    'subjects',r.guidance,'decisions',r.decisions,
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

create or replace function public.save_follow_up_report(
  p_profile text,p_visit_id uuid,p_expected_revision integer,
  p_participants text,p_subjects text,p_decisions text,p_findings jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_visit public.audit_visits%rowtype; v_report public.follow_up_reports%rowtype; v_module text;
begin
  if p_profile not in ('AUDITOR_SEGURANCA','AUDITOR_QUALIDADE') or p_profile is null
    or p_visit_id is null or p_expected_revision is null or p_expected_revision < 0
    or p_participants is null or char_length(btrim(p_participants)) < 1 or char_length(p_participants) > 5000
    or p_subjects is null or char_length(btrim(p_subjects)) < 1 or char_length(p_subjects) > 10000
    or p_decisions is null or char_length(btrim(p_decisions)) < 1 or char_length(p_decisions) > 10000
    or p_findings is null or jsonb_typeof(p_findings) is distinct from 'array'
    or jsonb_array_length(p_findings) > 30 then
    raise exception using errcode = '22023', message = 'invalid_follow_up_report';
  end if;
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

  v_module := case p_profile when 'AUDITOR_SEGURANCA' then 'SEGURANCA' else 'QUALIDADE' end;
  select * into v_visit from public.audit_visits where id = p_visit_id for share;
  if not found then raise exception using errcode = 'P0002', message = 'follow_up_visit_not_found'; end if;
  if v_visit.visit_kind <> 'ACOMPANHAMENTO' or v_visit.cancelled_at is not null
    or v_visit.confirmation_status <> 'confirmed' or v_visit.auditor_auth_user_id <> auth.uid()
    or v_visit.modulo <> v_module
    or v_visit.data_prevista > (clock_timestamp() at time zone 'America/Sao_Paulo')::date then
    raise exception using errcode = '42501', message = 'confirmed_follow_up_required';
  end if;
  perform dialogo_private.lock_visit_auditor(auth.uid(),v_visit.obra_id,v_visit.modulo);
  perform pg_advisory_xact_lock(hashtextextended(p_visit_id::text,704209170004));
  if p_expected_revision <> 0 then
    raise exception using errcode = '40001', message = 'follow_up_report_closed';
  end if;
  insert into public.follow_up_reports(visit_id,auditor_auth_user_id,participants,guidance,decisions,findings)
    values(p_visit_id,auth.uid(),btrim(p_participants),btrim(p_subjects),btrim(p_decisions),p_findings)
    returning * into v_report;
  return jsonb_build_object('id',v_report.id,'visitId',v_report.visit_id,'revision',v_report.revision,
    'participants',v_report.participants,'subjects',v_report.guidance,'decisions',v_report.decisions,
    'findings',v_report.findings,'updatedAt',v_report.updated_at);
end;
$function$;

commit;

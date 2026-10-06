-- Batch selected findings and photo existence checks; preserve snapshots, locks and idempotency.
begin;
create or replace function public.save_standalone_follow_up_report(p_profile text,p_work_id uuid,p_date date,p_title text,
  p_participants text,p_subjects text,p_decisions text,p_finding_ids uuid[],p_request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $f$
declare
  v_module text; v_payload jsonb; v_existing public.standalone_follow_up_reports%rowtype;
  v_findings jsonb := '[]'; v_photos jsonb := '[]'; v_count integer; v_photo_paths text[];
  v_id uuid; v_work_name text; v_auditor_name text;
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
  -- Lock and snapshot the selected rows in a stable order, once for the set.
  with selected as materialized (
    select id,location,description,correction,serious,photo_file_name
    from public.follow_up_work_findings
    where id=any(p_finding_ids) and work_id=p_work_id and modulo=v_module
      and auditor_auth_user_id=auth.uid() and completed_at is null
    order by id for share
  ) select count(*),
    coalesce(jsonb_agg(jsonb_build_object('id',id,'location',location,'description',description,
      'correction',correction,'serious',serious) order by array_position(p_finding_ids,id)),'[]'),
    coalesce(jsonb_agg(jsonb_build_object('findingId',id,'fileName',photo_file_name)
      order by array_position(p_finding_ids,id)),'[]'),
    coalesce(array_agg(distinct auth.uid()::text||'/'||p_work_id::text||'/'||photo_file_name),'{}')
  into v_count,v_findings,v_photos,v_photo_paths from selected;
  if v_count<>cardinality(p_finding_ids) then raise exception using errcode='42501',message='report_finding_unavailable';end if;
  perform 1 from storage.objects where bucket_id='follow-up-photos' and name=any(v_photo_paths) order by name for share;
  get diagnostics v_count = row_count;
  if v_count<>cardinality(v_photo_paths) then raise exception using errcode='23514',message='report_photo_unavailable';end if;
  select nome into v_work_name from public.access_works where id=p_work_id;
  select nome into v_auditor_name from public.access_requests where auth_user_id=auth.uid();
  insert into public.standalone_follow_up_reports(work_id,modulo,auditor_auth_user_id,work_name,auditor_name,
    report_date,title,participants,subjects,decisions,findings,photos,request_id,request_payload)
  values(p_work_id,v_module,auth.uid(),v_work_name,v_auditor_name,p_date,btrim(p_title),btrim(p_participants),
    btrim(p_subjects),btrim(p_decisions),v_findings,v_photos,p_request_id,v_payload) returning id into v_id;
  return v_id;
end;
$f$;

notify pgrst,'reload schema';
commit;

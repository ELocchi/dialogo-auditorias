begin;

create function public.save_fvs_services_revision(
  p_request_id uuid,
  p_expected_version integer,
  p_revision_label text,
  p_change_note text,
  p_services jsonb
) returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
  v_existing public.audit_fvs_weight_revisions%rowtype;
  v_latest_version integer;
begin
  if not public.has_current_administrative_module('QUALIDADE') then
    raise exception using errcode = '42501', message = 'quality_administrator_required';
  end if;
  if p_request_id is null or p_expected_version is null or p_expected_version < 0 or p_expected_version = 2147483647
    or p_revision_label is null or char_length(btrim(p_revision_label)) not between 1 and 80
    or p_change_note is null or char_length(btrim(p_change_note)) not between 1 and 2000
    or not dialogo_private.valid_fvs_services(p_services) then
    raise exception using errcode = '22023', message = 'invalid_fvs_weight_revision';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_actor::text || ':' || p_request_id::text, 923001));
  select * into v_existing from public.audit_fvs_weight_revisions
    where created_by = v_actor and request_id = p_request_id;
  if found then
    if v_existing.version <> p_expected_version + 1
      or v_existing.revision_label <> btrim(p_revision_label)
      or v_existing.change_note <> btrim(p_change_note)
      or v_existing.services <> p_services then
      raise exception using errcode = '22023', message = 'fvs_request_id_reused';
    end if;
    return v_existing.id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('audit_fvs_weight_revisions', 923002));
  select coalesce(max(version), 0) into v_latest_version from public.audit_fvs_weight_revisions;
  if v_latest_version <> p_expected_version then
    raise exception using errcode = '40001', message = 'fvs_weight_revision_conflict';
  end if;
  insert into public.audit_fvs_weight_revisions(
    version, revision_label, change_note, services, created_by, request_id
  ) values (
    p_expected_version + 1, btrim(p_revision_label), btrim(p_change_note), p_services, v_actor, p_request_id
  ) returning id into v_id;
  return v_id;
end;
$function$;

revoke all on function public.save_fvs_services_revision(uuid,integer,text,text,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.save_fvs_services_revision(uuid,integer,text,text,jsonb) to authenticated;
comment on function public.save_fvs_services_revision(uuid,integer,text,text,jsonb) is
  'Appends one immutable FVS weight snapshot for an authorized Quality administrator, with optimistic concurrency and idempotent retries.';

notify pgrst, 'reload schema';
commit;

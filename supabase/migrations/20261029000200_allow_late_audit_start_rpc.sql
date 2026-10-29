-- Administrative action that grants the per-visit late start exception from the agenda card.
-- Conflicts use PT409: PostgREST retries 40001 forever (see 20261027000200_conflict_sqlstate.sql).
begin;
create or replace function public.allow_late_audit_start(p_request_id uuid,p_visit_id uuid,p_expected_revision integer)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare v_actor uuid := auth.uid(); v_visit public.audit_visits%rowtype; v_payload jsonb; v_replay uuid;
begin
  perform dialogo_private.lock_agenda_identity(v_actor,'ADMINISTRATIVO');
  if p_request_id is null or p_visit_id is null or p_expected_revision is null or p_expected_revision < 1 then
    raise exception using errcode = '22023', message = 'invalid_visit_revision';
  end if;
  select * into v_visit from public.audit_visits where id = p_visit_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'visit_not_found'; end if;
  if not public.has_current_administrative_module(v_visit.modulo) then
    raise exception using errcode = '42501', message = 'administrative_module_required';
  end if;
  v_payload := jsonb_build_object('operation','allow_late_start','visit_id',p_visit_id,'expected_revision',p_expected_revision);
  v_replay := dialogo_private.replay_visit_operation(v_actor,p_request_id,v_payload);
  if v_replay is not null then return v_replay; end if;
  if v_visit.cancelled_at is not null or v_visit.published_audit_id is not null or v_visit.revision <> p_expected_revision then
    raise exception using errcode = 'PT409', message = 'visit_revision_conflict';
  end if;
  if v_visit.visit_kind <> 'AUDITORIA'
    or v_visit.data_prevista >= (clock_timestamp() at time zone 'America/Sao_Paulo')::date then
    raise exception using errcode = '22023', message = 'late_start_requires_past_audit';
  end if;
  if not v_visit.late_start_allowed then
    -- The revision bump refreshes every open agenda through its fingerprint.
    update public.audit_visits set late_start_allowed = true, revision = revision + 1,
      updated_by = v_actor, updated_at = clock_timestamp()
      where id = p_visit_id returning * into v_visit;
  end if;
  insert into dialogo_private.audit_visit_operations(actor_auth_user_id,request_id,payload,visit_id)
    values(v_actor,p_request_id,v_payload,v_visit.id);
  return v_visit.id;
end;
$function$;
revoke all on function public.allow_late_audit_start(uuid,uuid,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.allow_late_audit_start(uuid,uuid,integer) to authenticated;
comment on function public.allow_late_audit_start(uuid,uuid,integer) is
  'Administrative-only, idempotent grant letting the assigned auditor start a past audit; the audit keeps its scheduled date.';
notify pgrst, 'reload schema';
commit;

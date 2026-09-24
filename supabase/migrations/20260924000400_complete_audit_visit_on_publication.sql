-- A published audit completes its originating scheduled visit. Keep the visit
-- and immutable event history, while removing it from active agenda views and
-- notifications.
begin;

alter table public.audit_visits
  add column published_audit_id uuid unique references public.published_audits(id) on delete restrict;
alter table public.audit_visits
  add constraint audit_visits_publication_kind_check
  check (published_audit_id is null or visit_kind = 'AUDITORIA');
comment on column public.audit_visits.published_audit_id is
  'Published audit that completed this scheduled audit; completed visits remain in immutable history.';

alter table public.audit_visit_events drop constraint audit_visit_events_event_type_check;
alter table public.audit_visit_events add constraint audit_visit_events_event_type_check
  check (event_type in ('created', 'rescheduled', 'confirmed', 'cancelled', 'published'));

create function dialogo_private.complete_matching_visit_after_audit_publication()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_ids uuid[];
  v_visit public.audit_visits%rowtype;
  v_before jsonb;
begin
  select array_agg(v.id order by v.created_at,v.id) into v_ids
  from public.audit_visits v
  where v.visit_kind = 'AUDITORIA' and v.cancelled_at is null and v.published_audit_id is null
    and v.obra_id = new.work_id and v.modulo = new.modulo and v.modelo_id = new.model_id
    and v.auditor_auth_user_id = new.auditor_auth_user_id and v.data_prevista = new.audit_date;

  if cardinality(v_ids) > 1 then
    raise exception using errcode = '23514', message = 'ambiguous_published_audit_visit';
  end if;
  if cardinality(v_ids) = 1 then
    select * into v_visit from public.audit_visits where id = v_ids[1] for update;
    if v_visit.cancelled_at is not null or v_visit.published_audit_id is not null then
      raise exception using errcode = '40001', message = 'published_audit_visit_conflict';
    end if;
    v_before := to_jsonb(v_visit);
    update public.audit_visits set published_audit_id = new.id, revision = revision + 1,
      updated_by = new.auditor_auth_user_id, updated_at = new.published_at
      where id = v_visit.id returning * into v_visit;
    insert into public.audit_visit_events(
      visit_id,revision,event_type,before_snapshot,after_snapshot,actor_auth_user_id,occurred_at
    ) values (
      v_visit.id,v_visit.revision,'published',v_before,to_jsonb(v_visit),
      new.auditor_auth_user_id,new.published_at
    );
  end if;
  return new;
end;
$function$;
revoke all on function dialogo_private.complete_matching_visit_after_audit_publication()
  from public,anon,authenticated,service_role;
create trigger published_audits_complete_scheduled_visit after insert on public.published_audits
  for each row execute function dialogo_private.complete_matching_visit_after_audit_publication();

-- Link the one existing real publication after verifying its exact source.
do $backfill$
declare
  v_audit constant uuid := 'b1760000-2026-4923-8000-000000000001';
  v_visit constant uuid := '7aa47ff3-bbb1-4b26-bb4b-23837c607c07';
  v_row public.audit_visits%rowtype;
  v_before jsonb;
  v_published_at timestamptz;
begin
  select v.* into v_row
  from public.audit_visits v join public.published_audits a
    on a.id = v_audit and a.work_id = v.obra_id and a.modulo = v.modulo
      and a.model_id = v.modelo_id and a.auditor_auth_user_id = v.auditor_auth_user_id
      and a.audit_date = v.data_prevista
  where v.id = v_visit and v.visit_kind = 'AUDITORIA'
    and v.cancelled_at is null and v.published_audit_id is null
  for update of v;
  if not found then
    raise exception using errcode = '23514', message = 'boulevard_published_visit_backfill_failed';
  end if;
  select published_at into strict v_published_at from public.published_audits where id = v_audit;
  v_before := to_jsonb(v_row);
  update public.audit_visits set published_audit_id = v_audit, revision = revision + 1,
    updated_by = v_row.auditor_auth_user_id, updated_at = v_published_at
    where id = v_visit returning * into v_row;
  insert into public.audit_visit_events(
    visit_id,revision,event_type,before_snapshot,after_snapshot,actor_auth_user_id,occurred_at
  ) values (
    v_row.id,v_row.revision,'published',v_before,to_jsonb(v_row),
    v_row.auditor_auth_user_id,v_published_at
  );
end;
$backfill$;

-- The public wrapper applies administrative discipline scope and now also
-- removes visits completed by a publication from every active agenda view.
create or replace function public.read_audit_agenda(
  p_profile text,p_engineering_scope text default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_data jsonb;
  v_visits jsonb;
  v_auditors jsonb;
begin
  v_data := dialogo_private.read_audit_agenda_unscoped(p_profile,p_engineering_scope);
  v_visits := (select coalesce(jsonb_agg(value),'[]'::jsonb)
    from jsonb_array_elements(v_data->'visits') value
    where not exists (select 1 from public.audit_visits v
      where v.id = (value->>'id')::uuid and v.published_audit_id is not null)
      and (p_profile <> 'ADMINISTRATIVO' or public.has_current_administrative_module(
        case value->>'module' when 'safety' then 'SEGURANCA' else 'QUALIDADE' end)));
  if p_profile <> 'ADMINISTRATIVO' then
    return jsonb_build_object('visits',v_visits,'auditors',v_data->'auditors');
  end if;
  v_auditors := (select coalesce(jsonb_agg(value),'[]'::jsonb)
    from jsonb_array_elements(v_data->'auditors') value
    where public.has_current_administrative_module(
      case value->>'role' when 'safety-auditor' then 'SEGURANCA' else 'QUALIDADE' end));
  return jsonb_build_object('visits',v_visits,'auditors',v_auditors);
end;
$function$;

comment on function public.read_audit_agenda(text,text) is
  'Authorized active agenda; publications complete and hide their source visits while immutable history is retained.';

notify pgrst, 'reload schema';
commit;

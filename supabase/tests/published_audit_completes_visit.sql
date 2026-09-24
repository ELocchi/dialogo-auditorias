-- The existing real publication must complete, retain and hide its schedule.
-- This regression is read only and changes no shared data.
begin read only;
select set_config('request.jwt.claim.sub','13044e3f-e8d2-4b4b-9981-22a8de22c610',true);
select set_config('request.jwt.claims','{"sub":"13044e3f-e8d2-4b4b-9981-22a8de22c610","role":"authenticated"}',true);
set local role authenticated;

do $test$
declare
  v_visit constant uuid := '7aa47ff3-bbb1-4b26-bb4b-23837c607c07';
  v_audit constant uuid := 'b1760000-2026-4923-8000-000000000001';
  v_user constant uuid := '13044e3f-e8d2-4b4b-9981-22a8de22c610';
  v_context record;
  v_agenda jsonb;
begin
  if not exists (select 1 from public.audit_visits
      where id = v_visit and published_audit_id = v_audit and cancelled_at is null and revision = 2)
    or not exists (select 1 from public.audit_visit_events
      where visit_id = v_visit and revision = 2 and event_type = 'published'
        and actor_auth_user_id = v_user) then
    raise exception 'Published audit did not complete its exact scheduled visit';
  end if;

  for v_context in select * from (values
    ('ADMINISTRATIVO',null::text),
    ('AUDITOR_QUALIDADE',null::text),
    ('ENGENHARIA','EQUIPE_OBRA'),
    ('ENGENHARIA','COORDENACAO')
  ) context(profile,engineering_scope) loop
    v_agenda := public.read_audit_agenda(v_context.profile,v_context.engineering_scope);
    if exists (select 1 from jsonb_array_elements(v_agenda->'visits') item
      where item->>'id' = v_visit::text) then
      raise exception 'Completed schedule remained active for %',v_context;
    end if;
  end loop;
end;
$test$;

rollback;

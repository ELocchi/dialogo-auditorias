-- Batch scheduling is atomic and retains the existing per-visit locks,
-- current authorization checks, events and durable idempotency keys.
begin;

create function public.create_agenda_visits_batch(p_visits jsonb)
returns uuid[] language plpgsql security definer set search_path = '' as $function$
declare
  v_item jsonb;
  v_request uuid;
  v_requests uuid[] := array[]::uuid[];
  v_ids uuid[] := array[]::uuid[];
  v_id uuid;
  v_module text;
  v_uuid_pattern constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  perform dialogo_private.lock_agenda_identity(auth.uid(),'ADMINISTRATIVO');
  if jsonb_typeof(p_visits) is distinct from 'array' then
    raise exception using errcode='22023',message='invalid_agenda_batch';
  end if;
  if jsonb_array_length(p_visits) < 1 or jsonb_array_length(p_visits) > 200 then
    raise exception using errcode='22023',message='invalid_agenda_batch_size';
  end if;
  for v_item in select value from jsonb_array_elements(p_visits) loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or not v_item ?& array['requestId','workId','module','kind','modelId','auditorId','date','note']
      or v_item - array['requestId','workId','module','kind','modelId','auditorId','date','note'] <> '{}'::jsonb
      or jsonb_typeof(v_item->'requestId') is distinct from 'string'
      or jsonb_typeof(v_item->'workId') is distinct from 'string'
      or jsonb_typeof(v_item->'auditorId') is distinct from 'string'
      or (v_item->>'requestId') !~ v_uuid_pattern or (v_item->>'workId') !~ v_uuid_pattern
      or (v_item->>'auditorId') !~ v_uuid_pattern
      or coalesce(v_item->>'module','') not in ('safety','quality')
      or coalesce(v_item->>'kind','') not in ('audit','follow_up')
      or jsonb_typeof(v_item->'date') is distinct from 'string'
      or (v_item->>'date') !~ '^\d{4}-\d{2}-\d{2}$'
      or jsonb_typeof(v_item->'note') is distinct from 'string'
      or length(v_item->>'note') > 2000
      or ((v_item->>'kind')='follow_up' and v_item->'modelId' <> 'null'::jsonb)
      or ((v_item->>'kind')='audit' and jsonb_typeof(v_item->'modelId') is distinct from 'string') then
      raise exception using errcode='22023',message='invalid_agenda_batch_item';
    end if;
    v_request := (v_item->>'requestId')::uuid;
    if v_request = any(v_requests) then
      raise exception using errcode='22023',message='duplicate_agenda_batch_request';
    end if;
    v_requests := array_append(v_requests,v_request);
  end loop;
  -- Overlapping batches acquire replay locks in a fixed order, while results
  -- retain the order selected in the UI. Inner calls reuse these same locks.
  for v_request in select request_id from unnest(v_requests) request_id order by request_id loop
    perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || v_request::text,704209140002));
  end loop;
  for v_item in select value from jsonb_array_elements(p_visits) loop
    v_request := (v_item->>'requestId')::uuid;
    v_module := case v_item->>'module' when 'safety' then 'SEGURANCA' else 'QUALIDADE' end;
    if v_item->>'kind'='audit' then
      v_id := public.create_audit_visit(v_request,(v_item->>'workId')::uuid,v_module,
        v_item->>'modelId',(v_item->>'auditorId')::uuid,(v_item->>'date')::date,v_item->>'note');
    else
      v_id := public.create_work_follow_up_visit(v_request,(v_item->>'workId')::uuid,v_module,
        (v_item->>'auditorId')::uuid,(v_item->>'date')::date,v_item->>'note');
    end if;
    v_ids := array_append(v_ids,v_id);
  end loop;
  return v_ids;
end;
$function$;
revoke all on function public.create_agenda_visits_batch(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.create_agenda_visits_batch(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;

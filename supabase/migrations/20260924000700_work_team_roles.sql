-- Store a work-specific job title with each user linked to the work team.
begin;

alter table public.work_team_links
  add column cargo text not null default '';

alter table public.work_team_links
  add constraint work_team_links_cargo_check check (
    char_length(cargo) <= 100 and cargo = btrim(cargo)
  );

create function dialogo_private.sync_work_team_members(p_work_id uuid, p_members jsonb)
returns boolean language plpgsql security definer set search_path = '' as $function$
declare
  v_member jsonb;
  v_normalized jsonb := '[]'::jsonb;
  v_ids uuid[];
  v_id_text text;
  v_cargo text;
  v_links_changed boolean;
  v_roles_changed boolean;
begin
  if p_members is null or jsonb_typeof(p_members) <> 'array'
    or jsonb_array_length(p_members) > 30 then
    raise exception using errcode = '22023', message = 'invalid_work_team_members';
  end if;
  for v_member in select value from jsonb_array_elements(p_members) loop
    if jsonb_typeof(v_member) <> 'object'
      or (select count(*) from jsonb_object_keys(v_member)) <> 2
      or jsonb_typeof(v_member -> 'id') is distinct from 'string'
      or jsonb_typeof(v_member -> 'cargo') is distinct from 'string' then
      raise exception using errcode = '22023', message = 'invalid_work_team_members';
    end if;
    v_id_text := lower(v_member ->> 'id');
    v_cargo := btrim(v_member ->> 'cargo');
    if v_id_text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or char_length(v_cargo) > 100 then
      raise exception using errcode = '22023', message = 'invalid_work_team_members';
    end if;
    v_normalized := v_normalized || jsonb_build_array(jsonb_build_object('id', v_id_text, 'cargo', v_cargo));
  end loop;
  if (select count(distinct item.value ->> 'id') from jsonb_array_elements(v_normalized) item)
    <> jsonb_array_length(v_normalized) then
    raise exception using errcode = '22023', message = 'invalid_work_team_members';
  end if;
  select coalesce(array_agg((item.value ->> 'id')::uuid order by item.value ->> 'id'), array[]::uuid[])
    into v_ids from jsonb_array_elements(v_normalized) item;
  v_links_changed := dialogo_private.sync_work_team_links(p_work_id, v_ids);
  select exists (
    select 1 from jsonb_array_elements(v_normalized) item
      join public.work_team_links link
        on link.obra_id = p_work_id and link.auth_user_id = (item.value ->> 'id')::uuid
    where link.cargo is distinct from item.value ->> 'cargo'
  ) into v_roles_changed;
  update public.work_team_links link set cargo = item.value ->> 'cargo'
    from jsonb_array_elements(v_normalized) item
    where link.obra_id = p_work_id and link.auth_user_id = (item.value ->> 'id')::uuid;
  return v_links_changed or v_roles_changed;
end;
$function$;
revoke all on function dialogo_private.sync_work_team_members(uuid, jsonb)
  from public, anon, authenticated, service_role;

create function public.create_access_work_with_team_v2(p_data jsonb, p_members jsonb)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare v_id uuid;
begin
  v_id := public.create_access_work_full(p_data);
  perform dialogo_private.sync_work_team_members(v_id, p_members);
  return v_id;
end;
$function$;
revoke all on function public.create_access_work_with_team_v2(jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.create_access_work_with_team_v2(jsonb, jsonb) to authenticated;

create function public.update_access_work_with_team_v2(
  p_work_id uuid, p_expected_revision integer, p_data jsonb, p_members jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_result jsonb; v_team_changed boolean;
begin
  v_result := public.update_access_work(p_work_id, p_expected_revision, p_data);
  v_team_changed := dialogo_private.sync_work_team_members(p_work_id, p_members);
  return v_result || jsonb_build_object('team_changed', v_team_changed);
end;
$function$;
revoke all on function public.update_access_work_with_team_v2(uuid, integer, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.update_access_work_with_team_v2(uuid, integer, jsonb, jsonb) to authenticated;

create or replace function public.access_administration_schema_version()
returns integer language sql stable security invoker set search_path = '' as $function$
  select 7;
$function$;

comment on column public.work_team_links.cargo is
  'Work-specific job title for the linked active user; it does not replace account profiles.';

commit;

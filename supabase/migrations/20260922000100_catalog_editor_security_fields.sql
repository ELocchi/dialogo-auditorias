begin;

create or replace function dialogo_private.valid_catalog_criteria(p_criteria jsonb)
returns boolean language plpgsql immutable set search_path = '' as $function$
declare item jsonb; orientation jsonb; page jsonb; orientation_group jsonb; field text; ids text[] := '{}'; codes text[] := '{}';
begin
  if jsonb_typeof(p_criteria) is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_criteria) not between 1 and 500
    or octet_length(p_criteria::text) > 4194304 then return false; end if;
  for item in select value from jsonb_array_elements(p_criteria) loop
    if jsonb_typeof(item) is distinct from 'object'
      or not (item ?& array['id','code','title','text','group','subgroup','source','locator','documentedWeight','orientations'])
      or (item - array['id','code','title','text','group','subgroup','source','locator','documentedWeight',
        'configuredWeight','groupWeight','weightConfigurationId','orientations','verificationRule','analysisCriterion',
        'sourceNote','interpretation']) <> '{}'::jsonb
      then return false; end if;
    if not dialogo_private.catalog_string(item->'id',1,200)
      or not dialogo_private.catalog_string(item->'code',1,100)
      or not dialogo_private.catalog_string(item->'title',1,2000)
      or not dialogo_private.catalog_string(item->'text',1,30000)
      or not dialogo_private.catalog_string(item->'group',1,2000)
      or not dialogo_private.catalog_string(item->'subgroup',0,2000)
      or not dialogo_private.catalog_string(item->'source',1,1000)
      or not dialogo_private.catalog_string(item->'locator',0,2000)
      then return false; end if;
    if item->>'id' = any(ids) or item->>'code' = any(codes) then return false; end if;
    ids := array_append(ids,item->>'id'); codes := array_append(codes,item->>'code');
    foreach field in array array['documentedWeight','configuredWeight','groupWeight'] loop
      if not (item ? field) then continue; end if;
      if field = 'documentedWeight' and item->field = 'null'::jsonb then continue; end if;
      if jsonb_typeof(item->field) is distinct from 'number' then return false; end if;
      if (item->>field)::numeric not between 0 and 1000 then return false; end if;
    end loop;
    if item ? 'weightConfigurationId' and not dialogo_private.catalog_string(item->'weightConfigurationId',1,200)
      then return false; end if;
    foreach field in array array['verificationRule','analysisCriterion','sourceNote','interpretation'] loop
      if item ? field and not dialogo_private.catalog_string(item->field,0,30000) then return false; end if;
    end loop;
    if jsonb_typeof(item->'orientations') is distinct from 'array' then return false; end if;
    if jsonb_array_length(item->'orientations') > 500 then return false; end if;
    for orientation in select value from jsonb_array_elements(item->'orientations') loop
      if jsonb_typeof(orientation) is distinct from 'object'
        or not (orientation ?& array['id','scope','text','pages','highlighted'])
        or (orientation - array['id','scope','text','pages','highlighted','groups']) <> '{}'::jsonb
        or not dialogo_private.catalog_string(orientation->'id',1,200)
        or not dialogo_private.catalog_string(orientation->'scope',0,2000)
        or not dialogo_private.catalog_string(orientation->'text',1,30000)
        or jsonb_typeof(orientation->'highlighted') is distinct from 'boolean'
        or jsonb_typeof(orientation->'pages') is distinct from 'array' then return false; end if;
      if orientation ? 'groups' then
        if jsonb_typeof(orientation->'groups') is distinct from 'array' then return false; end if;
        if jsonb_array_length(orientation->'groups') > 100 then return false; end if;
        for orientation_group in select value from jsonb_array_elements(orientation->'groups') loop
          if not dialogo_private.catalog_string(orientation_group,0,100) then return false; end if;
        end loop;
      end if;
      if jsonb_array_length(orientation->'pages') > 100 then return false; end if;
      for page in select value from jsonb_array_elements(orientation->'pages') loop
        if jsonb_typeof(page) is distinct from 'number' then return false; end if;
        if page::numeric not between 1 and 9999 or page::numeric <> trunc(page::numeric) then return false; end if;
      end loop;
    end loop;
  end loop;
  return true;
end;
$function$;

commit;

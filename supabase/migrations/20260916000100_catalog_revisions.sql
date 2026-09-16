-- B.8: immutable catalog snapshots and private reference documents. A revision
-- affects future audit starts only; no existing audit, account or grant changes.
-- Documents are committed in the same transaction as their catalog revision.
begin;

create function dialogo_private.catalog_string(p_value jsonb, p_min integer, p_max integer)
returns boolean language sql immutable set search_path = '' as $function$
  select coalesce(jsonb_typeof(p_value) = 'string'
    and char_length(p_value #>> '{}') between p_min and p_max
    and (p_min = 0 or char_length(btrim(p_value #>> '{}')) >= p_min), false);
$function$;

create function dialogo_private.valid_catalog_criteria(p_criteria jsonb)
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
        'configuredWeight','weightConfigurationId','orientations','verificationRule','sourceNote','interpretation']) <> '{}'::jsonb
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
    foreach field in array array['documentedWeight','configuredWeight'] loop
      if not (item ? field) then continue; end if;
      if field = 'documentedWeight' and item->field = 'null'::jsonb then continue; end if;
      if jsonb_typeof(item->field) is distinct from 'number' then return false; end if;
      if (item->>field)::numeric not between 0 and 1000 then return false; end if;
    end loop;
    if item ? 'weightConfigurationId' and not dialogo_private.catalog_string(item->'weightConfigurationId',1,200)
      then return false; end if;
    foreach field in array array['verificationRule','sourceNote','interpretation'] loop
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

create function dialogo_private.valid_catalog_filename(p_name text, p_extension text)
returns boolean language sql immutable set search_path = '' as $function$
  select coalesce(char_length(p_name) between 1 and 180 and p_name = btrim(p_name)
    and p_name !~ '[[:cntrl:]/\\]' and p_name !~ '^\.'
    and lower(right(p_name,char_length(p_extension)+1)) = '.' || p_extension, false);
$function$;
revoke all on function dialogo_private.catalog_string(jsonb,integer,integer),
  dialogo_private.valid_catalog_criteria(jsonb), dialogo_private.valid_catalog_filename(text,text)
  from public, anon, authenticated, service_role;

create table public.audit_catalog_revisions (
  id uuid primary key default gen_random_uuid(),
  model_id text not null check (model_id in ('security-it07-r02','quality-f175','quality-f176')),
  version integer not null check (version >= 1),
  revision_label text not null check (char_length(btrim(revision_label)) between 1 and 80),
  change_note text not null check (char_length(btrim(change_note)) between 1 and 2000),
  criteria jsonb not null check (dialogo_private.valid_catalog_criteria(criteria)),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  request_id uuid not null,
  unique (model_id,version),
  unique (created_by,request_id)
);
create table dialogo_private.audit_catalog_documents (
  revision_id uuid primary key references public.audit_catalog_revisions(id) on delete restrict,
  pdf bytea not null check (octet_length(pdf) between 5 and 5242880 and substring(pdf from 1 for 5) = decode('255044462d','hex')),
  pdf_name text not null check (dialogo_private.valid_catalog_filename(pdf_name,'pdf')),
  original bytea check (octet_length(original) between 4 and 2097152 and substring(original from 1 for 4) = decode('504b0304','hex')),
  original_name text check (original_name is null or dialogo_private.valid_catalog_filename(original_name,'docx')),
  check ((original is null and original_name is null) or (original is not null and original_name is not null))
);
create table dialogo_private.audit_catalog_operations (
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  revision_id uuid not null references public.audit_catalog_revisions(id) on delete restrict,
  primary key (actor_auth_user_id,request_id)
);
alter table public.audit_catalog_revisions enable row level security;
alter table dialogo_private.audit_catalog_documents enable row level security;
alter table dialogo_private.audit_catalog_operations enable row level security;
-- Raw criteria include technical weights. All reading passes through a selected
-- profile RPC; raw SELECT would defeat the Engineering projection.
revoke all on public.audit_catalog_revisions, dialogo_private.audit_catalog_documents,
  dialogo_private.audit_catalog_operations from public, anon, authenticated, service_role;

create function dialogo_private.reject_catalog_revision_mutation()
returns trigger language plpgsql set search_path = '' as $function$
begin
  raise exception using errcode = '55000', message = 'catalog_history_is_immutable';
end;
$function$;
revoke all on function dialogo_private.reject_catalog_revision_mutation() from public, anon, authenticated, service_role;
create trigger audit_catalog_revisions_immutable before update or delete on public.audit_catalog_revisions
  for each row execute function dialogo_private.reject_catalog_revision_mutation();
create trigger audit_catalog_revisions_no_truncate before truncate on public.audit_catalog_revisions
  for each statement execute function dialogo_private.reject_catalog_revision_mutation();
create trigger audit_catalog_documents_immutable before update or delete on dialogo_private.audit_catalog_documents
  for each row execute function dialogo_private.reject_catalog_revision_mutation();
create trigger audit_catalog_documents_no_truncate before truncate on dialogo_private.audit_catalog_documents
  for each statement execute function dialogo_private.reject_catalog_revision_mutation();
create trigger audit_catalog_operations_immutable before update or delete on dialogo_private.audit_catalog_operations
  for each row execute function dialogo_private.reject_catalog_revision_mutation();
create trigger audit_catalog_operations_no_truncate before truncate on dialogo_private.audit_catalog_operations
  for each statement execute function dialogo_private.reject_catalog_revision_mutation();

create function public.save_audit_catalog_revision(
  p_request_id uuid, p_model_id text, p_expected_version integer,
  p_revision_label text, p_change_note text, p_criteria jsonb,
  p_pdf_base64 text default null, p_pdf_name text default null,
  p_original_base64 text default null, p_original_name text default null
) returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  v_actor uuid := auth.uid(); v_id uuid; v_latest public.audit_catalog_revisions%rowtype;
  v_pdf bytea; v_original bytea; v_payload_hash text;
  v_operation dialogo_private.audit_catalog_operations%rowtype;
begin
  perform dialogo_private.lock_agenda_identity(v_actor,'ADMINISTRATIVO');
  if p_request_id is null or p_model_id is null
    or p_model_id not in ('security-it07-r02','quality-f175','quality-f176')
    or p_expected_version is null or p_expected_version < 0 or p_expected_version = 2147483647
    or p_revision_label is null or char_length(btrim(p_revision_label)) not between 1 and 80
    or p_change_note is null or char_length(btrim(p_change_note)) not between 1 and 2000 then
    raise exception using errcode = '22023', message = 'invalid_catalog_revision';
  end if;
  if not dialogo_private.valid_catalog_criteria(p_criteria) then
    raise exception using errcode = '22023', message = 'invalid_catalog_criteria';
  end if;
  if p_pdf_base64 is null then
    if p_pdf_name is not null or p_original_base64 is not null or p_original_name is not null then
      raise exception using errcode = '22023', message = 'invalid_catalog_document';
    end if;
  else
    if octet_length(p_pdf_base64) > 8388608
      or not dialogo_private.valid_catalog_filename(p_pdf_name,'pdf')
      or (p_original_base64 is null) <> (p_original_name is null)
      or (p_original_base64 is not null and (octet_length(p_original_base64) > 3145728
        or not dialogo_private.valid_catalog_filename(p_original_name,'docx'))) then
      raise exception using errcode = '22023', message = 'invalid_catalog_document';
    end if;
    begin
      v_pdf := decode(p_pdf_base64,'base64');
      v_original := decode(p_original_base64,'base64');
    exception when others then
      raise exception using errcode = '22023', message = 'invalid_catalog_document';
    end;
    if octet_length(v_pdf) not between 5 and 5242880
      or substring(v_pdf from 1 for 5) <> decode('255044462d','hex')
      or (v_original is not null and (octet_length(v_original) not between 4 and 2097152
        or substring(v_original from 1 for 4) <> decode('504b0304','hex'))) then
      raise exception using errcode = '22023', message = 'invalid_catalog_document';
    end if;
  end if;
  v_payload_hash := encode(sha256(convert_to(jsonb_build_object(
    'modelId',p_model_id,'expectedVersion',p_expected_version,'label',p_revision_label,'changeNote',p_change_note,
    'criteria',p_criteria,'pdfHash',encode(sha256(v_pdf),'hex'),'pdfName',p_pdf_name,
    'originalHash',encode(sha256(v_original),'hex'),'originalName',p_original_name)::text,'UTF8')),'hex');
  -- Actor/request first also serializes accidental reuse across different models.
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text || ':' || p_request_id::text,816001));
  select * into v_operation from dialogo_private.audit_catalog_operations
    where actor_auth_user_id = v_actor and request_id = p_request_id;
  if found then
    if v_operation.payload_hash <> v_payload_hash then
      raise exception using errcode = '22023', message = 'catalog_request_id_reused';
    end if;
    return v_operation.revision_id;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_model_id,816002));
  select * into v_latest from public.audit_catalog_revisions where model_id = p_model_id order by version desc limit 1;
  if coalesce(v_latest.version,0) <> p_expected_version then
    raise exception using errcode = '40001', message = 'catalog_revision_conflict';
  end if;
  insert into public.audit_catalog_revisions(model_id,version,revision_label,change_note,criteria,created_by,request_id)
    values(p_model_id,p_expected_version+1,btrim(p_revision_label),btrim(p_change_note),p_criteria,v_actor,p_request_id)
    returning id into v_id;
  if v_pdf is not null then
    insert into dialogo_private.audit_catalog_documents(revision_id,pdf,pdf_name,original,original_name)
      values(v_id,v_pdf,p_pdf_name,v_original,p_original_name);
  elsif v_latest.id is not null then
    insert into dialogo_private.audit_catalog_documents(revision_id,pdf,pdf_name,original,original_name)
      select v_id,pdf,pdf_name,original,original_name from dialogo_private.audit_catalog_documents where revision_id = v_latest.id;
  end if;
  insert into dialogo_private.audit_catalog_operations(actor_auth_user_id,request_id,payload_hash,revision_id)
    values(v_actor,p_request_id,v_payload_hash,v_id);
  return v_id;
end;
$function$;

create function public.read_audit_catalogs(p_profile text,p_engineering_scope text default null)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_result jsonb;
begin
  perform dialogo_private.lock_agenda_identity(auth.uid(),p_profile);
  if p_profile not in ('ADMINISTRATIVO','AUDITOR_SEGURANCA','AUDITOR_QUALIDADE','ENGENHARIA')
    or (p_profile = 'ENGENHARIA' and (p_engineering_scope is null or not exists (
      select 1 from public.access_accounts a where a.auth_user_id = auth.uid()
        and p_engineering_scope = any(a.atuacoes_engenharia))))
    or (p_profile <> 'ENGENHARIA' and p_engineering_scope is not null) then
    raise exception using errcode = '42501', message = 'active_catalog_profile_required';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'modelId',r.model_id,'version',r.version,
    'label',r.revision_label,'changeNote',r.change_note,'createdAt',r.created_at,
    'criteria',case when p_profile = 'ENGENHARIA' then (
      select jsonb_agg((c.value - array['configuredWeight','weightConfigurationId']) || '{"documentedWeight":null}'::jsonb order by c.ordinality)
        from jsonb_array_elements(r.criteria) with ordinality c(value,ordinality)
    ) else r.criteria end) order by r.model_id),'[]'::jsonb) into v_result
  from (select distinct on (model_id) * from public.audit_catalog_revisions order by model_id,version desc) r
  where p_profile = 'ADMINISTRATIVO' or exists (
    select 1 from public.access_grants g join public.access_works w on w.id = g.obra_id
    where g.auth_user_id = auth.uid() and g.perfil = p_profile and w.ativo
      and g.modulo = case r.model_id when 'security-it07-r02' then 'SEGURANCA' else 'QUALIDADE' end
      and ((p_profile = 'AUDITOR_SEGURANCA' and g.modulo = 'SEGURANCA')
        or (p_profile = 'AUDITOR_QUALIDADE' and g.modulo = 'QUALIDADE')
        or (p_profile = 'ENGENHARIA' and p_engineering_scope in ('EQUIPE_OBRA','COORDENACAO')))
  );
  return v_result;
end;
$function$;

create function public.read_audit_catalog_document(p_model_id text,p_original boolean default false,p_revision_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_revision_id uuid; v_document dialogo_private.audit_catalog_documents%rowtype;
begin
  perform dialogo_private.lock_agenda_identity(auth.uid(),'ADMINISTRATIVO');
  if p_model_id is null or p_model_id not in ('security-it07-r02','quality-f175','quality-f176') or p_original is null then
    raise exception using errcode = '22023', message = 'invalid_catalog_document';
  end if;
  select id into v_revision_id from public.audit_catalog_revisions
    where model_id = p_model_id and (p_revision_id is null or id = p_revision_id) order by version desc limit 1;
  if p_revision_id is not null and v_revision_id is null then
    raise exception using errcode = '22023', message = 'invalid_catalog_document_revision';
  end if;
  select * into v_document from dialogo_private.audit_catalog_documents where revision_id = v_revision_id;
  if not found then return null; end if;
  if p_original and v_document.original is not null then
    return jsonb_build_object('name',v_document.original_name,
      'contentType','application/vnd.openxmlformats-officedocument.wordprocessingml.document','base64',encode(v_document.original,'base64'));
  end if;
  return jsonb_build_object('name',v_document.pdf_name,'contentType','application/pdf','base64',encode(v_document.pdf,'base64'));
end;
$function$;

revoke all on function public.save_audit_catalog_revision(uuid,text,integer,text,text,jsonb,text,text,text,text),
  public.read_audit_catalogs(text,text), public.read_audit_catalog_document(text,boolean,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.save_audit_catalog_revision(uuid,text,integer,text,text,jsonb,text,text,text,text),
  public.read_audit_catalogs(text,text), public.read_audit_catalog_document(text,boolean,uuid) to authenticated;
comment on table public.audit_catalog_revisions is 'Append-only full Criterion snapshots. Version 0 is the bundled catalog; persisted revisions begin at 1. Existing audit snapshots are never rewritten.';
comment on table dialogo_private.audit_catalog_documents is 'Private binary reference documents, inserted atomically with each catalog revision. No anonymous, direct API or Storage access.';
comment on function public.read_audit_catalogs(text,text) is 'Returns the latest revision for each granted module in the selected current profile. Engineering never receives numeric weight fields; historical snapshots stay immutable.';
commit;

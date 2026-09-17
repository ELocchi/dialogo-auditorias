-- Give an auditor read-only access to the reference document for a discipline
-- with at least one currently authorized active work. The private unscoped
-- reader remains inaccessible to authenticated clients.
-- The existing private reader still requires Administrative membership, so
-- move that check to its already-scoped public wrapper before using it here.
create or replace function dialogo_private.read_audit_catalog_document_unscoped(
  p_model_id text,p_original boolean default false,p_revision_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_revision_id uuid; v_document dialogo_private.audit_catalog_documents%rowtype;
begin
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

create function public.read_auditor_catalog_document(
  p_profile text, p_model_id text, p_original boolean default false, p_revision_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_module text; v_required_profile text;
begin
  if p_model_id not in ('security-it07-r02','quality-f175','quality-f176')
    or p_model_id is null or p_original is null then
    raise exception using errcode = '22023', message = 'invalid_catalog_document';
  end if;

  v_module := case p_model_id when 'security-it07-r02' then 'SEGURANCA' else 'QUALIDADE' end;
  v_required_profile := case v_module when 'SEGURANCA' then 'AUDITOR_SEGURANCA' else 'AUDITOR_QUALIDADE' end;
  if p_profile is distinct from v_required_profile then
    raise exception using errcode = '42501', message = 'auditor_module_required';
  end if;

  perform dialogo_private.lock_agenda_identity(auth.uid(), p_profile);
  perform 1 from public.access_grants g join public.access_works w on w.id = g.obra_id
    where g.auth_user_id = auth.uid() and g.perfil = p_profile
      and g.modulo = v_module and w.ativo
    for share of g, w;
  if not found then
    raise exception using errcode = '42501', message = 'authorized_auditor_required';
  end if;

  return dialogo_private.read_audit_catalog_document_unscoped(p_model_id,p_original,p_revision_id);
end;
$function$;
revoke all on function public.read_auditor_catalog_document(text,text,boolean,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.read_auditor_catalog_document(text,text,boolean,uuid) to authenticated;

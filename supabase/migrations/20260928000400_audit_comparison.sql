-- Previous-result marks need only the stored answer, never audit evidence.
begin;

create function public.read_published_audit_comparison(
  p_audit_ids uuid[],p_profile text,p_engineering_scope text default null,p_administrative_scope text default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare v_result jsonb;
begin
  perform dialogo_private.require_published_audit_profile(p_profile,p_engineering_scope,p_administrative_scope);
  if p_audit_ids is null or cardinality(p_audit_ids) not between 1 and 3
    or array_ndims(p_audit_ids) <> 1 or array_position(p_audit_ids,null) is not null
    or (select count(distinct id) from unnest(p_audit_ids) id) <> cardinality(p_audit_ids) then
    raise exception using errcode = '22023', message = 'one_to_three_distinct_audit_ids_required';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'workId',a.work_id,'modelId',a.model_id,'date',a.audit_date,
    'answers',coalesce((select jsonb_object_agg(r.key,r.value->'answer') from jsonb_each(a.responses) r
      where jsonb_typeof(r.value->'answer')='string'),'{}'::jsonb)) order by array_position(p_audit_ids,a.id)),'[]'::jsonb)
    into v_result
  from public.published_audits a join public.access_works w on w.id=a.work_id
  where a.id=any(p_audit_ids) and w.ativo and (
    (p_profile = 'ADMINISTRATIVO' and public.has_current_administrative_module(a.modulo)
      and (p_administrative_scope = 'GERAL' or p_administrative_scope = a.modulo))
    or (p_profile = 'ENGENHARIA' and public.has_current_engineering_scope(p_engineering_scope,a.work_id,a.modulo))
    or (p_profile in ('AUDITOR_SEGURANCA','AUDITOR_QUALIDADE') and exists (
      select 1 from public.access_grants g where g.auth_user_id = auth.uid()
        and g.perfil = p_profile and g.obra_id = a.work_id and g.modulo = a.modulo))
  );
  return v_result;
end;
$function$;

revoke all on function public.read_published_audit_comparison(uuid[],text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.read_published_audit_comparison(uuid[],text,text,text) to authenticated;
notify pgrst, 'reload schema';
commit;

begin;
create function public.read_follow_up_photo_batch(p_visit_ids uuid[],p_profile text,
 p_engineering_scope text default null,p_administrative_scope text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $f$
declare v_ids uuid[]; v_rows jsonb; v_actor uuid:=auth.uid();
begin
 perform dialogo_private.require_published_audit_profile(p_profile,p_engineering_scope,p_administrative_scope);
 if p_profile not in ('AUDITOR_SEGURANCA','AUDITOR_QUALIDADE') then raise exception using errcode='42501',message='auditor_required';end if;
 if p_visit_ids is null or cardinality(p_visit_ids)>50 or array_position(p_visit_ids,null) is not null then
  raise exception using errcode='22023',message='invalid_photo_batch';end if;
 select coalesce(array_agg(distinct id order by id),'{}') into v_ids from unnest(p_visit_ids) id;
 -- Identity/account/email/profile checked once above; exact grant and active work
 -- are joined as sets. No per-visit helper or privileged cross-user listing.
 if (select count(*) from public.audit_visits v join public.access_works w on w.id=v.obra_id
   join public.access_grants g on g.obra_id=v.obra_id and g.auth_user_id=v_actor and g.perfil=p_profile and g.modulo=v.modulo
   where v.id=any(v_ids) and w.ativo and v.auditor_auth_user_id=v_actor and v.visit_kind='ACOMPANHAMENTO'
     and v.cancelled_at is null and v.modulo=case p_profile when 'AUDITOR_SEGURANCA' then 'SEGURANCA' else 'QUALIDADE' end) <> cardinality(v_ids) then
  return jsonb_build_object('available',false,'photos','[]'::jsonb);
 end if;
 with prefixes as (select id,v_actor::text||'/'||id::text||'/' as prefix from unnest(v_ids) id),
 files as materialized (
  select p.id,split_part(o.name,'/',3) as file_name
  from prefixes p join storage.objects o on split_part(o.name,'/',2)=p.id::text
  where o.bucket_id='follow-up-photos' and o.name like v_actor::text||'/%'
    and array_length(string_to_array(o.name,'/'),1)=3
  order by p.id,o.name limit 5001
 ) select coalesce(jsonb_agg(jsonb_build_object('visitId',id,'fileName',file_name,
   'findingId',lower(substring(file_name from 1 for 36))) order by id,file_name),'[]') into v_rows
 from files;
 if jsonb_array_length(v_rows)>5000 or exists(select 1 from jsonb_array_elements(v_rows) p group by p->>'visitId' having count(*)>=1000) then
  raise exception using errcode='54000',message='photo_batch_too_large';end if;
 return jsonb_build_object('available',true,'visitIds',to_jsonb(v_ids),'photos',coalesce((
   select jsonb_agg(p) from jsonb_array_elements(v_rows) p
   where p->>'fileName' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$'),'[]'::jsonb));
end;
$f$;
revoke all on function public.read_follow_up_photo_batch(uuid[],text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.read_follow_up_photo_batch(uuid[],text,text,text) to authenticated;
notify pgrst,'reload schema';
commit;

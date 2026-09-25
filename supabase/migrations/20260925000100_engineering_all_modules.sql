-- One Engineering work selection always grants both operational disciplines.
-- The UI submits the two explicit grants so existing RLS remains unchanged.
begin;

create function dialogo_private.engineering_grants_cover_both_modules(p_grants jsonb)
returns boolean language plpgsql immutable set search_path = '' as $function$
begin
  if p_grants is null or jsonb_typeof(p_grants) <> 'array' then return false; end if;
  return not exists (
    select 1 from jsonb_array_elements(p_grants) item
    where item ->> 'perfil' = 'ENGENHARIA' and (
      not exists (select 1 from jsonb_array_elements(p_grants) counterpart
        where counterpart ->> 'perfil' = 'ENGENHARIA'
          and counterpart ->> 'obra_id' = item ->> 'obra_id'
          and counterpart ->> 'modulo' = 'SEGURANCA')
      or not exists (select 1 from jsonb_array_elements(p_grants) counterpart
        where counterpart ->> 'perfil' = 'ENGENHARIA'
          and counterpart ->> 'obra_id' = item ->> 'obra_id'
          and counterpart ->> 'modulo' = 'QUALIDADE')
    )
  );
end;
$function$;
revoke all on function dialogo_private.engineering_grants_cover_both_modules(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.approve_access_request_v3(
  p_auth_user_id uuid, p_perfis text[], p_atuacao_engenharia text,
  p_atuacao_administrativa text, p_grants jsonb, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $function$
declare v_decision uuid;
begin
  if not public.is_current_access_administrator() then
    raise exception using errcode = '42501', message = 'general_administrator_required';
  end if;
  if (p_perfis is not null and 'ADMINISTRATIVO' = any(p_perfis)
      and p_atuacao_administrativa not in ('SEGURANCA','QUALIDADE','GERAL'))
    or (p_perfis is not null and not ('ADMINISTRATIVO' = any(p_perfis))
      and p_atuacao_administrativa is not null)
    or ('ADMINISTRATIVO' = any(p_perfis) and p_atuacao_administrativa is null) then
    raise exception using errcode = '22023', message = 'invalid_administrative_scope';
  end if;
  if p_perfis is not null and 'ENGENHARIA' = any(p_perfis)
    and not dialogo_private.engineering_grants_cover_both_modules(p_grants) then
    raise exception using errcode = '22023', message = 'engineering_all_modules_required';
  end if;
  v_decision := public.approve_access_request_v2(p_auth_user_id,p_perfis,p_atuacao_engenharia,p_grants,p_reason);
  update public.access_accounts set atuacao_administrativa = p_atuacao_administrativa
    where auth_user_id = p_auth_user_id;
  insert into dialogo_private.administrative_scope_decisions(decision_id,auth_user_id,atuacao_administrativa)
    values(v_decision,p_auth_user_id,p_atuacao_administrativa);
  return v_decision;
end;
$function$;
revoke all on function public.approve_access_request_v3(uuid,text[],text,text,jsonb,text)
  from public, anon, authenticated, service_role;
grant execute on function public.approve_access_request_v3(uuid,text[],text,text,jsonb,text)
  to authenticated;

comment on function dialogo_private.engineering_grants_cover_both_modules(jsonb) is
  'Every work selected for Engineering must carry explicit Safety and Quality grants.';

commit;

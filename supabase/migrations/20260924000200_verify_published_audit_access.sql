-- Verify the designated account can read the real audit in every authorized profile.
begin;

do $verification$
declare
  v_user constant uuid := '13044e3f-e8d2-4b4b-9981-22a8de22c610';
  v_audit constant uuid := 'b1760000-2026-4923-8000-000000000001';
  v_result jsonb;
begin
  perform set_config('request.jwt.claim.sub',v_user::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated')::text,true);

  v_result := public.read_published_audit_index('ADMINISTRATIVO',null,'GERAL');
  if not exists (select 1 from jsonb_array_elements(v_result) item where item->>'id'=v_audit::text) then
    raise exception using errcode='23514',message='published_audit_missing_for_general_administration';
  end if;

  v_result := public.read_published_audit_index('AUDITOR_QUALIDADE',null,null);
  if not exists (select 1 from jsonb_array_elements(v_result) item where item->>'id'=v_audit::text) then
    raise exception using errcode='23514',message='published_audit_missing_for_quality_auditor';
  end if;

  v_result := public.read_published_audit_index('ENGENHARIA','EQUIPE_OBRA',null);
  if not exists (select 1 from jsonb_array_elements(v_result) item where item->>'id'=v_audit::text) then
    raise exception using errcode='23514',message='published_audit_missing_for_site_engineering';
  end if;

  v_result := public.read_published_audit_index('ENGENHARIA','COORDENACAO',null);
  if not exists (select 1 from jsonb_array_elements(v_result) item where item->>'id'=v_audit::text) then
    raise exception using errcode='23514',message='published_audit_missing_for_coordination';
  end if;
end;
$verification$;

commit;

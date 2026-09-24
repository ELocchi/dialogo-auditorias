-- Regression for the PostgREST STABLE RPC transaction mode (SQLSTATE 25006).
-- Uses only the existing, approved BoulevarDiálogo audit and designated account.
-- No fixtures, writes, temporary functions, or persistent identity changes.
-- Run with a connection allowed to SET ROLE authenticated and anon.
begin read only;
set local role authenticated;
set local "request.jwt.claim.sub" = '13044e3f-e8d2-4b4b-9981-22a8de22c610';
set local "request.jwt.claims" = '{"sub":"13044e3f-e8d2-4b4b-9981-22a8de22c610","role":"authenticated"}';

do $test$
declare
  v_audit constant text := 'b1760000-2026-4923-8000-000000000001';
  v_work constant text := '6c735db0-abd6-4ed7-b66e-6c253ed8a880';
  v_context record;
  v_index jsonb;
  v_detail jsonb;
  v_index_audit jsonb;
  v_detail_audit jsonb;
begin
  if current_setting('transaction_read_only') <> 'on'
    or current_user <> 'authenticated'
    or auth.uid()::text <> '13044e3f-e8d2-4b4b-9981-22a8de22c610' then
    raise exception 'Regression must run as authenticated in a READ ONLY transaction';
  end if;

  for v_context in select * from (values
    ('ADMINISTRATIVO', null::text, 'GERAL'),
    ('ADMINISTRATIVO', null::text, 'QUALIDADE'),
    ('AUDITOR_QUALIDADE', null::text, null::text),
    ('ENGENHARIA', 'EQUIPE_OBRA', null::text),
    ('ENGENHARIA', 'COORDENACAO', null::text)
  ) as contexts(profile, engineering_scope, administrative_scope) loop
    v_index := public.read_published_audit_index(
      v_context.profile, v_context.engineering_scope, v_context.administrative_scope);
    v_detail := public.read_published_audits(
      v_context.profile, v_context.engineering_scope, v_context.administrative_scope);

    if (select count(*) from jsonb_array_elements(v_index) a where a->>'id' = v_audit) <> 1
      or (select count(*) from jsonb_array_elements(v_detail) a where a->>'id' = v_audit) <> 1 then
      raise exception 'Audit missing or duplicated for context %', v_context;
    end if;
    select a into v_index_audit from jsonb_array_elements(v_index) a where a->>'id' = v_audit;
    select a into v_detail_audit from jsonb_array_elements(v_detail) a where a->>'id' = v_audit;

    if (v_index_audit->>'finalScore')::numeric is distinct from 6.74
      or v_index_audit->>'workId' is distinct from v_work
      or v_index_audit->>'date' is distinct from '2026-09-23'
      or v_index_audit->>'modelId' is distinct from 'quality-f176'
      or (v_detail_audit->>'finalScore')::numeric is distinct from 6.74
      or v_detail_audit->>'workId' is distinct from v_work
      or jsonb_array_length(v_detail_audit->'criteria') is distinct from 23
      or (select count(*) from jsonb_each(v_detail_audit->'responses')) <> 23
      or jsonb_array_length(v_detail_audit->'evidenceFiles') is distinct from 37
      or v_detail_audit->>'reportFileName' is distinct from 'relatorio-final.pdf' then
      raise exception 'Published audit contents differ for context %', v_context;
    end if;

    if v_context.profile = 'ENGENHARIA' and (
      exists (select 1 from jsonb_array_elements(v_detail_audit->'criteria') c
        where c ? 'configuredWeight' or c ? 'weightConfigurationId'
          or c->'documentedWeight' is distinct from 'null'::jsonb)
      or exists (select 1 from jsonb_each(v_detail_audit->'responses') r
        cross join lateral jsonb_array_elements(case
          when jsonb_typeof(r.value->'checks') = 'array' then r.value->'checks'
          else '[]'::jsonb end) c where c ? 'weight')
    ) then
      raise exception 'Technical weights exposed to Engineering context %', v_context;
    end if;

    -- Query storage as authenticated so SELECT is subject to its RLS policy.
    if (select count(*) from storage.objects o
      where o.bucket_id = 'published-audits'
        and o.name = v_work || '/' || v_audit || '/' || (v_detail_audit->>'reportFileName')) <> 1
      or (select count(*) from storage.objects o
        where o.bucket_id = 'published-audits'
          and o.name like v_work || '/' || v_audit || '/%') <> 38
      or exists (select 1 from jsonb_array_elements_text(v_detail_audit->'evidenceFiles') f(name)
        where not exists (select 1 from storage.objects o
          where o.bucket_id = 'published-audits'
            and o.name = v_work || '/' || v_audit || '/' || f.name)) then
      raise exception 'Published PDF or evidence inaccessible through storage RLS for %', v_context;
    end if;
  end loop;
  raise notice 'PASS: READ ONLY index, score, full audit, Engineering projection and storage RLS in five contexts';
end;
$test$;

do $test$
declare
  v_context record;
  v_rpc text;
  v_result jsonb;
  v_rejected boolean;
begin
  for v_context in select * from (values
    (null::text, null::text, null::text),
    ('INVALID', null::text, null::text),
    ('ADMINISTRATIVO', null::text, null::text),
    ('ADMINISTRATIVO', null::text, 'INVALID'),
    ('ADMINISTRATIVO', 'EQUIPE_OBRA', 'GERAL'),
    ('ENGENHARIA', null::text, null::text),
    ('ENGENHARIA', 'INVALID', null::text),
    ('ENGENHARIA', 'EQUIPE_OBRA', 'GERAL'),
    ('AUDITOR_QUALIDADE', 'EQUIPE_OBRA', null::text),
    ('AUDITOR_QUALIDADE', null::text, 'QUALIDADE')
  ) as contexts(profile, engineering_scope, administrative_scope) loop
    foreach v_rpc in array array['read_published_audit_index', 'read_published_audits'] loop
      v_rejected := false;
      begin
        execute format('select public.%I($1,$2,$3)', v_rpc) into v_result
          using v_context.profile, v_context.engineering_scope, v_context.administrative_scope;
      exception when insufficient_privilege then v_rejected := true;
      end;
      if not v_rejected then
        raise exception '% accepted invalid context %', v_rpc, v_context;
      end if;
    end loop;
  end loop;

  for v_context in select * from (values
    ('ADMINISTRATIVO', null::text, 'SEGURANCA'),
    ('AUDITOR_SEGURANCA', null::text, null::text)
  ) as contexts(profile, engineering_scope, administrative_scope) loop
    foreach v_rpc in array array['read_published_audit_index', 'read_published_audits'] loop
      execute format('select public.%I($1,$2,$3)', v_rpc) into v_result
        using v_context.profile, v_context.engineering_scope, v_context.administrative_scope;
      if exists (select 1 from jsonb_array_elements(v_result) a
        where a->>'id' = 'b1760000-2026-4923-8000-000000000001'
          or a->>'modelId' in ('quality-f175','quality-f176')) then
        raise exception '% exposed Quality audits in Safety context %', v_rpc, v_context;
      end if;
    end loop;
  end loop;
  raise notice 'PASS: invalid scopes rejected and Safety contexts exclude Quality audits';
end;
$test$;

-- The authenticated database role alone must not confer an account identity.
set local "request.jwt.claim.sub" = '';
set local "request.jwt.claims" = '{}';
do $test$
declare v_rpc text; v_rejected boolean;
begin
  foreach v_rpc in array array['read_published_audit_index', 'read_published_audits'] loop
    v_rejected := false;
    begin
      execute format('select public.%I(''ADMINISTRATIVO'',null,''GERAL'')', v_rpc);
    exception when insufficient_privilege then v_rejected := true;
    end;
    if not v_rejected then raise exception '% accepted a missing identity', v_rpc; end if;
  end loop;
  if exists (select 1 from storage.objects o where o.bucket_id = 'published-audits'
    and o.name like '6c735db0-abd6-4ed7-b66e-6c253ed8a880/b1760000-2026-4923-8000-000000000001/%') then
    raise exception 'Published files exposed without an authenticated identity';
  end if;
  raise notice 'PASS: missing identity cannot read audit, ranking or stored files';
end;
$test$;

set local role anon;
do $test$
declare v_rpc text; v_rejected boolean;
begin
  foreach v_rpc in array array['read_published_audit_index', 'read_published_audits'] loop
    v_rejected := false;
    begin
      execute format('select public.%I(''ADMINISTRATIVO'',null,''GERAL'')', v_rpc);
    exception when insufficient_privilege then v_rejected := true;
    end;
    if not v_rejected then raise exception '% accepted an anonymous caller', v_rpc; end if;
  end loop;
  raise notice 'PASS: anonymous callers cannot execute published audit RPCs';
end;
$test$;
rollback;

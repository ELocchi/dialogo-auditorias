-- Bounded read projections. Documents and write authorization remain unchanged.
begin;
create index if not exists follow_up_findings_active_page_idx on public.follow_up_work_findings
  (auditor_auth_user_id, modulo, created_at desc, id desc) where completed_at is null;
create index if not exists follow_up_findings_work_page_idx on public.follow_up_work_findings
  (work_id, modulo, created_at desc, id desc) where completed_at is null;
create index if not exists follow_up_reports_page_idx on public.follow_up_reports(updated_at desc,id desc);
create index if not exists standalone_reports_page_idx on public.standalone_follow_up_reports(created_at desc,id desc);

create function public.read_follow_up_list_page(p_profile text,p_engineering_scope text default null,
  p_administrative_scope text default null,p_kind text default 'findings',p_size integer default 20,
  p_work_id uuid default null,p_module text default null,p_search text default '',p_cursor jsonb default null,p_visit_id uuid default null,p_ids uuid[] default null)
returns jsonb language plpgsql stable security definer set search_path='' as $f$
declare v_rows jsonb; v_at timestamptz; v_key text; v_module text;
begin
  perform dialogo_private.require_published_audit_profile(p_profile,p_engineering_scope,p_administrative_scope);
  if p_profile not in ('AUDITOR_SEGURANCA','AUDITOR_QUALIDADE','ENGENHARIA') then
    raise exception using errcode='42501',message='list_profile_required';
  end if;
  if p_kind is null or p_kind not in ('reports','standalone-reports','findings','work-findings')
    or p_size is null or p_size not in (10,20,50) or p_search is null or char_length(p_search)>120
    or (p_ids is not null and cardinality(p_ids)>30)
    or (p_module is not null and p_module not in ('safety','quality')) then
    raise exception using errcode='22023',message='invalid_list_query';
  end if;
  if p_cursor is not null then
    if jsonb_typeof(p_cursor)<>'object' or coalesce(p_cursor->>'at','') !~ '^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$'
      or coalesce(p_cursor->>'key','') !~ '^(work|visit|scheduled|standalone):[0-9a-f:-]{36,73}$' then
      raise exception using errcode='22023',message='invalid_list_cursor';
    end if;
    v_at := (p_cursor->>'at')::timestamptz; v_key := p_cursor->>'key';
    if not isfinite(v_at) then raise exception using errcode='22023',message='invalid_list_cursor'; end if;
  end if;
  v_module := case p_profile when 'AUDITOR_SEGURANCA' then 'SEGURANCA' when 'AUDITOR_QUALIDADE' then 'QUALIDADE' end;
  if p_kind in ('reports','standalone-reports') then
    with allowed as materialized (
      select w.id,w.nome,m.modulo from public.access_works w cross join (values('SEGURANCA'),('QUALIDADE')) m(modulo)
      where w.ativo and (p_work_id is null or w.id=p_work_id)
        and (p_module is null or m.modulo=case p_module when 'safety' then 'SEGURANCA' else 'QUALIDADE' end)
        and ((p_profile='ENGENHARIA' and public.has_current_engineering_scope(p_engineering_scope,w.id,m.modulo))
          or (m.modulo=v_module and public.has_current_access_grant(p_profile,w.id,m.modulo)))
    ), records as (
      select r.id,'scheduled:'||r.id::text as key,r.updated_at as at,v.obra_id as work_id,v.modulo,
        a.nome as work_name,r.title,v.data_prevista as date,v.id as visit_id,v.auditor_auth_user_id as auditor_id,null::text as auditor_name
      from public.follow_up_reports r join public.audit_visits v on v.id=r.visit_id
      join allowed a on a.id=v.obra_id and a.modulo=v.modulo
      where p_kind='reports' and (p_visit_id is null or v.id=p_visit_id) and v.cancelled_at is null and v.visit_kind='ACOMPANHAMENTO'
        and (p_profile='ENGENHARIA' or (v.auditor_auth_user_id=auth.uid() and r.auditor_auth_user_id=auth.uid()))
      union all
      select r.id,'standalone:'||r.id::text,r.created_at,r.work_id,r.modulo,r.work_name,r.title,r.report_date,null::uuid,r.auditor_auth_user_id,r.auditor_name
      from public.standalone_follow_up_reports r join allowed a on a.id=r.work_id and a.modulo=r.modulo
      where p_visit_id is null and (p_profile='ENGENHARIA' or r.auditor_auth_user_id=auth.uid())
    ), page as materialized (
      select * from records r where (v_at is null or (r.at,r.key collate "C")<(v_at,v_key collate "C"))
        and (p_search='' or strpos(lower(r.title||' '||r.work_name),lower(p_search))>0)
      order by at desc,key collate "C" desc limit p_size+1
    ) select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',r.id,'key',r.key,'at',r.at,
      'workId',r.work_id,'workName',r.work_name,'module',case r.modulo when 'SEGURANCA' then 'safety' else 'quality' end,
      'title',r.title,'date',r.date,'visitId',r.visit_id,'auditorName',coalesce(r.auditor_name,
        (select q.nome from public.access_requests q where q.auth_user_id=r.auditor_id),'Profissional responsável')))
      order by r.at desc,r.key collate "C" desc),'[]'::jsonb) into v_rows from page r;
  else
    with allowed as materialized (
      select w.id,w.nome,m.modulo from public.access_works w cross join (values('SEGURANCA'),('QUALIDADE')) m(modulo)
      where w.ativo and (p_work_id is null or w.id=p_work_id)
        and (p_module is null or m.modulo=case p_module when 'safety' then 'SEGURANCA' else 'QUALIDADE' end)
        and ((p_profile='ENGENHARIA' and public.has_current_engineering_scope(p_engineering_scope,w.id,m.modulo))
          or (m.modulo=v_module and public.has_current_access_grant(p_profile,w.id,m.modulo)))
    ), visits as materialized (
      select v.id,v.obra_id,v.modulo,v.data_prevista,a.nome from public.audit_visits v join allowed a on a.id=v.obra_id and a.modulo=v.modulo
      where p_kind='findings' and (p_visit_id is null or v.id=p_visit_id) and p_profile<>'ENGENHARIA' and v.auditor_auth_user_id=auth.uid()
        and v.cancelled_at is null and v.visit_kind='ACOMPANHAMENTO'
    ), candidates as (
      select v.id as visit_id,v.obra_id,v.modulo,v.data_prevista,v.nome,r.updated_at as at,r.id as report_id,1 as priority,'report'::text as source,f
      from visits v join public.follow_up_reports r on r.visit_id=v.id and r.auditor_auth_user_id=auth.uid()
      cross join lateral jsonb_array_elements(r.findings) f
      where p_ids is null or (f->>'id')::uuid=any(p_ids)
      union all
      select v.id,v.obra_id,v.modulo,v.data_prevista,v.nome,d.updated_at,null::uuid,2,'saved',f
      from visits v join public.follow_up_finding_drafts d on d.visit_id=v.id and d.auditor_auth_user_id=auth.uid()
      cross join lateral jsonb_array_elements(d.findings) f
      where p_ids is null or (f->>'id')::uuid=any(p_ids)
    ), merged as (
      select distinct on (c.visit_id,(c.f->>'id')) c.* from candidates c
      where not exists(select 1 from public.follow_up_finding_completions x where x.visit_id=c.visit_id
        and x.finding_id=(c.f->>'id')::uuid and x.auditor_auth_user_id=auth.uid())
      order by c.visit_id,c.f->>'id',c.priority desc,c.at desc,c.report_id desc
    ), records as (
      select f.id,'work:'||f.id::text as key,f.created_at as at,f.work_id,a.nome as work_name,f.modulo,
        null::uuid as visit_id,null::date as date,'work'::text as source,f.location,f.description,f.correction,f.serious,f.photo_file_name
      from public.follow_up_work_findings f join allowed a on a.id=f.work_id and a.modulo=f.modulo
      where (p_ids is null or f.id=any(p_ids)) and f.completed_at is null and (p_profile='ENGENHARIA' or f.auditor_auth_user_id=auth.uid())
      union all
      select (c.f->>'id')::uuid,'visit:'||c.visit_id::text||':'||(c.f->>'id'),c.at,c.obra_id,c.nome,c.modulo,
        c.visit_id,c.data_prevista,case when exists(select 1 from candidates original where original.visit_id=c.visit_id and original.f->>'id'=c.f->>'id' and original.source='report') then 'report' else c.source end,coalesce(c.f->>'location',''),c.f->>'description',c.f->>'correction',coalesce((c.f->>'serious')::boolean,false),null::text
      from merged c
    ), page as materialized (
      select * from records r where (v_at is null or (r.at,r.key collate "C")<(v_at,v_key collate "C"))
        and (p_search='' or strpos(lower(r.description||' '||r.location||' '||r.correction||' '||r.work_name),lower(p_search))>0)
      order by r.at desc,r.key collate "C" desc limit p_size+1
    ) select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',r.id,'key',r.key,'at',r.at,
      'workId',r.work_id,'workName',r.work_name,'module',case r.modulo when 'SEGURANCA' then 'safety' else 'quality' end,
      'visitId',r.visit_id,'date',r.date,'source',r.source,'location',r.location,'description',r.description,
      'correction',r.correction,'serious',r.serious,'photoFileName',r.photo_file_name,'createdAt',r.at))
      order by r.at desc,r.key collate "C" desc),'[]'::jsonb) into v_rows from page r;
  end if;
  return jsonb_build_object('available',true,'items',coalesce((select jsonb_agg(x.value order by x.n)
    from jsonb_array_elements(v_rows) with ordinality x(value,n) where x.n<=p_size),'[]'::jsonb),
    'hasMore',jsonb_array_length(v_rows)>p_size,'nextCursor',case when jsonb_array_length(v_rows)>p_size
      then jsonb_build_object('at',v_rows->(p_size-1)->'at','key',v_rows->(p_size-1)->'key') else null end);
end;
$f$;
revoke all on function public.read_follow_up_list_page(text,text,text,text,integer,uuid,text,text,jsonb,uuid,uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.read_follow_up_list_page(text,text,text,text,integer,uuid,text,text,jsonb,uuid,uuid[]) to authenticated;
notify pgrst,'reload schema';
commit;

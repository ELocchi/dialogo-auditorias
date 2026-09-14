-- B.7: persistent visit scheduling and in-app confirmation only. No email,
-- Auth/account/grant changes, sample visits or backfill are performed.
begin;

create table public.audit_visits (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.access_works(id) on delete restrict,
  modulo text not null check (modulo in ('SEGURANCA', 'QUALIDADE')),
  modelo_id text not null,
  auditor_auth_user_id uuid not null references public.access_accounts(auth_user_id) on delete restrict,
  data_prevista date not null check (isfinite(data_prevista) and data_prevista between date '0001-01-01' and date '9999-12-31'),
  observacao text not null default '' check (char_length(observacao) <= 2000),
  revision integer not null default 1 check (revision > 0),
  confirmation_status text not null default 'pending_confirmation' check (confirmation_status in ('pending_confirmation', 'confirmed')),
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  check ((modulo = 'SEGURANCA' and modelo_id = 'security-it07-r02')
    or (modulo = 'QUALIDADE' and modelo_id in ('quality-f175', 'quality-f176'))),
  check ((confirmation_status = 'pending_confirmation' and confirmed_at is null and confirmed_by is null)
    or (confirmation_status = 'confirmed' and confirmed_at is not null and confirmed_by is not null
      and confirmed_by = auditor_auth_user_id))
);
create index audit_visits_agenda on public.audit_visits (data_prevista, id);
create index audit_visits_assigned on public.audit_visits (auditor_auth_user_id, confirmation_status, data_prevista);
create table public.audit_visit_events (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.audit_visits(id) on delete restrict,
  revision integer not null check (revision > 0),
  event_type text not null check (event_type in ('created', 'rescheduled', 'confirmed')),
  before_snapshot jsonb,
  after_snapshot jsonb not null check (jsonb_typeof(after_snapshot) = 'object'),
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  occurred_at timestamptz not null,
  unique (visit_id, revision, event_type),
  check ((event_type = 'created' and before_snapshot is null and revision = 1)
    or (event_type <> 'created' and before_snapshot is not null and jsonb_typeof(before_snapshot) = 'object'))
);
create index audit_visit_events_history on public.audit_visit_events (visit_id, revision, occurred_at);
create table dialogo_private.audit_visit_operations (
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  visit_id uuid not null references public.audit_visits(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  primary key (actor_auth_user_id, request_id)
);
alter table public.audit_visits enable row level security;
alter table public.audit_visit_events enable row level security;
alter table dialogo_private.audit_visit_operations enable row level security;
revoke all on public.audit_visits, public.audit_visit_events, dialogo_private.audit_visit_operations
  from public, anon, authenticated, service_role;
grant select on public.audit_visits, public.audit_visit_events to authenticated;

create function dialogo_private.reject_audit_visit_event_mutation()
returns trigger language plpgsql set search_path = '' as $function$
begin
  raise exception using errcode = '55000', message = 'visit_history_is_immutable';
end;
$function$;
revoke all on function dialogo_private.reject_audit_visit_event_mutation() from public, anon, authenticated, service_role;
create trigger audit_visit_events_immutable before update or delete on public.audit_visit_events
  for each row execute function dialogo_private.reject_audit_visit_event_mutation();
create trigger audit_visit_events_no_truncate before truncate on public.audit_visit_events
  for each statement execute function dialogo_private.reject_audit_visit_event_mutation();

-- Unlike has_current_access_grant, this private predicate checks the nominated
-- auditor. Metadata, engineering grants and the legacy primary profile cannot
-- supply technical authority. A public picker never exposes arbitrary accounts.
create function dialogo_private.is_authorized_visit_auditor(p_user_id uuid, p_obra_id uuid, p_modulo text)
returns boolean language sql stable security definer set search_path = '' as $function$
  select exists (
    select 1 from public.access_grants g
    join public.access_accounts a on a.auth_user_id = g.auth_user_id
    join public.access_works w on w.id = g.obra_id
    join public.access_requests r on r.auth_user_id = a.auth_user_id
    join auth.users u on u.id = a.auth_user_id
    where a.auth_user_id = p_user_id and a.ativo and w.ativo and g.obra_id = p_obra_id and g.modulo = p_modulo
      and g.perfil = case p_modulo when 'SEGURANCA' then 'AUDITOR_SEGURANCA' when 'QUALIDADE' then 'AUDITOR_QUALIDADE' end
      and g.perfil = any(a.perfis) and u.email_confirmed_at is not null
      and r.status_acesso = 'APROVADO' and r.email = u.email and public.is_dialogo_corporate_email(u.email)
      and u.deleted_at is null and (u.banned_until is null or u.banned_until <= statement_timestamp())
  );
$function$;
revoke all on function dialogo_private.is_authorized_visit_auditor(uuid, uuid, text) from public, anon, authenticated, service_role;

create policy audit_visits_select_authorized on public.audit_visits for select to authenticated using (
  (select public.is_current_access_administrator())
  or (auditor_auth_user_id = (select auth.uid()) and public.has_current_access_grant(
    case modulo when 'SEGURANCA' then 'AUDITOR_SEGURANCA' else 'AUDITOR_QUALIDADE' end, obra_id, modulo))
  or public.has_current_engineering_scope('EQUIPE_OBRA', obra_id, modulo)
);
create policy audit_visit_events_select_authorized on public.audit_visit_events for select to authenticated using (
  exists (select 1 from public.audit_visits v where v.id = visit_id)
);

create function dialogo_private.lock_agenda_identity(p_user_id uuid, p_profile text)
returns void language plpgsql security definer set search_path = '' as $function$
begin
  perform 1 from public.access_accounts a
    join auth.users u on u.id = a.auth_user_id
    join public.access_requests r on r.auth_user_id = a.auth_user_id
    where a.auth_user_id = p_user_id and a.ativo and p_profile = any(a.perfis)
      and u.email_confirmed_at is not null and r.status_acesso = 'APROVADO' and r.email = u.email
      and public.is_dialogo_corporate_email(u.email) and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= statement_timestamp())
    for share of a, u, r;
  if not found then
    raise exception using errcode = '42501', message = 'active_agenda_profile_required';
  end if;
end;
$function$;
create function dialogo_private.lock_visit_auditor(p_user_id uuid, p_obra_id uuid, p_modulo text)
returns void language plpgsql security definer set search_path = '' as $function$
begin
  perform dialogo_private.lock_agenda_identity(p_user_id,
    case p_modulo when 'SEGURANCA' then 'AUDITOR_SEGURANCA' when 'QUALIDADE' then 'AUDITOR_QUALIDADE' end);
  perform 1 from public.access_grants g join public.access_works w on w.id = g.obra_id
    where g.auth_user_id = p_user_id and g.obra_id = p_obra_id and g.modulo = p_modulo and w.ativo
      and g.perfil = case p_modulo when 'SEGURANCA' then 'AUDITOR_SEGURANCA' when 'QUALIDADE' then 'AUDITOR_QUALIDADE' end
    for share of g, w;
  if not found then
    raise exception using errcode = '42501', message = 'authorized_visit_auditor_required';
  end if;
end;
$function$;
create function dialogo_private.validate_visit_schedule(p_date date, p_note text)
returns void language plpgsql immutable set search_path = '' as $function$
begin
  if p_date is null or not isfinite(p_date) or p_date not between date '0001-01-01' and date '9999-12-31'
    or p_note is null or char_length(p_note) > 2000 then
    raise exception using errcode = '22023', message = 'invalid_visit_schedule';
  end if;
end;
$function$;
-- Callers hold their current authority and visit/grant locks before replay.
-- The per-actor/key transaction lock also serializes simultaneous create retries.
create function dialogo_private.replay_visit_operation(p_actor uuid, p_request_id uuid, p_payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare v_operation dialogo_private.audit_visit_operations%rowtype;
begin
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'visit_request_id_required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text || ':' || p_request_id::text, 704209140002));
  select * into v_operation from dialogo_private.audit_visit_operations
    where actor_auth_user_id = p_actor and request_id = p_request_id;
  if found then
    if v_operation.payload is distinct from p_payload then
      raise exception using errcode = '22023', message = 'visit_request_id_reused';
    end if;
    return v_operation.visit_id;
  end if;
  return null;
end;
$function$;
revoke all on function dialogo_private.lock_agenda_identity(uuid,text),
  dialogo_private.lock_visit_auditor(uuid,uuid,text), dialogo_private.validate_visit_schedule(date,text),
  dialogo_private.replay_visit_operation(uuid,uuid,jsonb) from public, anon, authenticated, service_role;

create function public.list_authorized_visit_auditors(p_obra_id uuid, p_modulo text)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
begin
  if not public.is_current_access_administrator() then
    raise exception using errcode = '42501', message = 'active_administrator_required';
  end if;
  if p_obra_id is null or p_modulo is null or p_modulo not in ('SEGURANCA','QUALIDADE') then
    raise exception using errcode = '22023', message = 'invalid_visit_scope';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',r.auth_user_id,'name',r.nome)
    order by r.nome,r.auth_user_id), '[]'::jsonb) from public.access_requests r
    where dialogo_private.is_authorized_visit_auditor(r.auth_user_id,p_obra_id,p_modulo));
end;
$function$;

create function public.read_audit_agenda(p_profile text, p_engineering_scope text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare v_visits jsonb; v_auditors jsonb := '[]'::jsonb;
begin
  if p_profile is null or p_profile not in ('ADMINISTRATIVO','AUDITOR_SEGURANCA','AUDITOR_QUALIDADE','ENGENHARIA')
    or not public.is_current_access_active()
    or not exists (select 1 from public.access_accounts a where a.auth_user_id = auth.uid() and p_profile = any(a.perfis)) then
    raise exception using errcode = '42501', message = 'active_agenda_profile_required';
  end if;
  if (p_profile <> 'ENGENHARIA' and p_engineering_scope is not null)
    or (p_profile = 'ENGENHARIA' and (p_engineering_scope is null
      or p_engineering_scope not in ('EQUIPE_OBRA','COORDENACAO')
      or not exists (select 1 from public.access_accounts a where a.auth_user_id = auth.uid()
        and p_engineering_scope = any(a.atuacoes_engenharia)))) then
    raise exception using errcode = '42501', message = 'active_agenda_profile_required';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',v.id,'workId',v.obra_id,'module',case v.modulo when 'SEGURANCA' then 'safety' else 'quality' end,
    'modelId',v.modelo_id,'auditorId',v.auditor_auth_user_id,'date',to_char(v.data_prevista,'YYYY-MM-DD'),
    'note',v.observacao,'createdBy',v.created_by,'createdAt',v.created_at,'revision',v.revision,
    'confirmationStatus',v.confirmation_status,'confirmedAt',v.confirmed_at,
    'auditorName',ar.nome,'createdByName',cr.nome,
    'history',(select coalesce(jsonb_agg(jsonb_build_object(
      'previousDate',e.before_snapshot->>'data_prevista','date',e.after_snapshot->>'data_prevista',
      'note',e.after_snapshot->>'observacao','changedBy',e.actor_auth_user_id,'changedAt',e.occurred_at)
      order by e.revision,e.occurred_at,e.id),'[]'::jsonb)
      from public.audit_visit_events e where e.visit_id = v.id and e.event_type = 'rescheduled')
  ) order by v.data_prevista,v.created_at,v.id),'[]'::jsonb) into v_visits
    from public.audit_visits v join public.access_works w on w.id = v.obra_id
    join public.access_requests ar on ar.auth_user_id = v.auditor_auth_user_id
    join public.access_requests cr on cr.auth_user_id = v.created_by
    where w.ativo and (
      p_profile = 'ADMINISTRATIVO'
      or (p_profile in ('AUDITOR_SEGURANCA','AUDITOR_QUALIDADE') and v.auditor_auth_user_id = auth.uid()
        and public.has_current_access_grant(p_profile,v.obra_id,v.modulo))
      or (p_profile = 'ENGENHARIA' and p_engineering_scope = 'EQUIPE_OBRA'
        and public.has_current_engineering_scope('EQUIPE_OBRA',v.obra_id,v.modulo))
    );
  if p_profile = 'ADMINISTRATIVO' then
    select coalesce(jsonb_agg(s.auditor order by s.nome,s.auth_user_id,s.perfil),'[]'::jsonb) into v_auditors
      from (select r.nome,g.auth_user_id,g.perfil,jsonb_build_object(
        'id',g.auth_user_id,'name',r.nome,'role',case g.perfil when 'AUDITOR_SEGURANCA' then 'safety-auditor' else 'quality-auditor' end,
        'modules',jsonb_build_array(case g.perfil when 'AUDITOR_SEGURANCA' then 'safety' else 'quality' end),
        'workIds',jsonb_agg(g.obra_id order by g.obra_id),'agendaWorkIds',jsonb_agg(g.obra_id order by g.obra_id),
        'documentWorkIds','[]'::jsonb,'workModuleScopes',jsonb_agg(jsonb_build_object('workId',g.obra_id,
          'module',case g.modulo when 'SEGURANCA' then 'safety' else 'quality' end) order by g.obra_id)
      ) auditor from public.access_grants g join public.access_requests r on r.auth_user_id = g.auth_user_id
      where g.perfil in ('AUDITOR_SEGURANCA','AUDITOR_QUALIDADE')
        and dialogo_private.is_authorized_visit_auditor(g.auth_user_id,g.obra_id,g.modulo)
      group by r.nome,g.auth_user_id,g.perfil) s;
  end if;
  return jsonb_build_object('visits',v_visits,'auditors',v_auditors);
end;
$function$;

create function public.create_audit_visit(p_request_id uuid, p_obra_id uuid, p_modulo text,
  p_modelo_id text, p_auditor_auth_user_id uuid, p_data_prevista date, p_observacao text)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare v_actor uuid := auth.uid(); v_payload jsonb; v_id uuid; v_visit public.audit_visits%rowtype;
begin
  perform dialogo_private.lock_agenda_identity(v_actor,'ADMINISTRATIVO');
  perform dialogo_private.validate_visit_schedule(p_data_prevista,p_observacao);
  if p_obra_id is null or p_auditor_auth_user_id is null or p_modulo is null or p_modelo_id is null
    or not ((p_modulo = 'SEGURANCA' and p_modelo_id = 'security-it07-r02')
      or (p_modulo = 'QUALIDADE' and p_modelo_id in ('quality-f175','quality-f176'))) then
    raise exception using errcode = '22023', message = 'invalid_visit_scope';
  end if;
  perform dialogo_private.lock_visit_auditor(p_auditor_auth_user_id,p_obra_id,p_modulo);
  v_payload := jsonb_build_object('operation','create','obra_id',p_obra_id,'modulo',p_modulo,'modelo_id',p_modelo_id,
    'auditor_id',p_auditor_auth_user_id,'date',p_data_prevista,'note',p_observacao);
  v_id := dialogo_private.replay_visit_operation(v_actor,p_request_id,v_payload);
  if v_id is not null then return v_id; end if;
  insert into public.audit_visits(obra_id,modulo,modelo_id,auditor_auth_user_id,data_prevista,observacao,created_by,updated_by)
    values(p_obra_id,p_modulo,p_modelo_id,p_auditor_auth_user_id,p_data_prevista,p_observacao,v_actor,v_actor)
    returning * into v_visit;
  insert into public.audit_visit_events(visit_id,revision,event_type,after_snapshot,actor_auth_user_id,occurred_at)
    values(v_visit.id,v_visit.revision,'created',to_jsonb(v_visit),v_actor,v_visit.created_at);
  insert into dialogo_private.audit_visit_operations(actor_auth_user_id,request_id,payload,visit_id)
    values(v_actor,p_request_id,v_payload,v_visit.id);
  return v_visit.id;
end;
$function$;

create function public.reschedule_audit_visit(p_request_id uuid, p_visit_id uuid, p_expected_revision integer,
  p_data_prevista date, p_observacao text)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare v_actor uuid := auth.uid(); v_visit public.audit_visits%rowtype; v_before jsonb; v_payload jsonb; v_replay uuid;
begin
  perform dialogo_private.lock_agenda_identity(v_actor,'ADMINISTRATIVO');
  perform dialogo_private.validate_visit_schedule(p_data_prevista,p_observacao);
  if p_visit_id is null or p_expected_revision is null or p_expected_revision < 1 then
    raise exception using errcode = '22023', message = 'invalid_visit_revision';
  end if;
  select * into v_visit from public.audit_visits where id = p_visit_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'visit_not_found'; end if;
  perform dialogo_private.lock_visit_auditor(v_visit.auditor_auth_user_id,v_visit.obra_id,v_visit.modulo);
  v_payload := jsonb_build_object('operation','reschedule','visit_id',p_visit_id,'expected_revision',p_expected_revision,
    'date',p_data_prevista,'note',p_observacao);
  v_replay := dialogo_private.replay_visit_operation(v_actor,p_request_id,v_payload);
  if v_replay is not null then
    if v_visit.data_prevista is distinct from p_data_prevista or v_visit.observacao is distinct from p_observacao
      or v_visit.revision not in (p_expected_revision,p_expected_revision + 1) then
      raise exception using errcode = '40001', message = 'visit_revision_conflict';
    end if;
    return v_replay;
  end if;
  if v_visit.revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'visit_revision_conflict';
  end if;
  if v_visit.data_prevista is distinct from p_data_prevista or v_visit.observacao is distinct from p_observacao then
    v_before := to_jsonb(v_visit);
    update public.audit_visits set data_prevista = p_data_prevista,observacao = p_observacao,
      revision = revision + 1,confirmation_status = 'pending_confirmation',confirmed_at = null,confirmed_by = null,
      updated_by = v_actor,updated_at = clock_timestamp() where id = p_visit_id returning * into v_visit;
    insert into public.audit_visit_events(visit_id,revision,event_type,before_snapshot,after_snapshot,actor_auth_user_id,occurred_at)
      values(v_visit.id,v_visit.revision,'rescheduled',v_before,to_jsonb(v_visit),v_actor,v_visit.updated_at);
  end if;
  insert into dialogo_private.audit_visit_operations(actor_auth_user_id,request_id,payload,visit_id)
    values(v_actor,p_request_id,v_payload,v_visit.id);
  return v_visit.id;
end;
$function$;

create function public.confirm_audit_visit(p_request_id uuid, p_visit_id uuid, p_expected_revision integer)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare v_actor uuid := auth.uid(); v_visit public.audit_visits%rowtype; v_before jsonb; v_payload jsonb; v_replay uuid;
begin
  if not public.is_current_access_active() then
    raise exception using errcode = '42501', message = 'active_agenda_profile_required';
  end if;
  if p_visit_id is null or p_expected_revision is null or p_expected_revision < 1 then
    raise exception using errcode = '22023', message = 'invalid_visit_revision';
  end if;
  -- Return the same denial for unknown visits and visits assigned to others.
  select * into v_visit from public.audit_visits where id = p_visit_id and auditor_auth_user_id = v_actor for update;
  if not found then raise exception using errcode = '42501', message = 'assigned_visit_auditor_required'; end if;
  perform dialogo_private.lock_visit_auditor(v_actor,v_visit.obra_id,v_visit.modulo);
  v_payload := jsonb_build_object('operation','confirm','visit_id',p_visit_id,'expected_revision',p_expected_revision);
  if v_visit.revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'visit_revision_conflict';
  end if;
  v_replay := dialogo_private.replay_visit_operation(v_actor,p_request_id,v_payload);
  if v_replay is not null then return v_replay; end if;
  if v_visit.confirmation_status <> 'confirmed' then
    v_before := to_jsonb(v_visit);
    update public.audit_visits set confirmation_status = 'confirmed',confirmed_by = v_actor,
      confirmed_at = clock_timestamp(),updated_by = v_actor,updated_at = clock_timestamp()
      where id = p_visit_id returning * into v_visit;
    insert into public.audit_visit_events(visit_id,revision,event_type,before_snapshot,after_snapshot,actor_auth_user_id,occurred_at)
      values(v_visit.id,v_visit.revision,'confirmed',v_before,to_jsonb(v_visit),v_actor,v_visit.confirmed_at);
  end if;
  insert into dialogo_private.audit_visit_operations(actor_auth_user_id,request_id,payload,visit_id)
    values(v_actor,p_request_id,v_payload,v_visit.id);
  return v_visit.id;
end;
$function$;

revoke all on function public.list_authorized_visit_auditors(uuid,text), public.read_audit_agenda(text,text),
  public.create_audit_visit(uuid,uuid,text,text,uuid,date,text), public.reschedule_audit_visit(uuid,uuid,integer,date,text),
  public.confirm_audit_visit(uuid,uuid,integer) from public, anon, authenticated, service_role;
grant execute on function public.list_authorized_visit_auditors(uuid,text), public.read_audit_agenda(text,text),
  public.create_audit_visit(uuid,uuid,text,text,uuid,date,text), public.reschedule_audit_visit(uuid,uuid,integer,date,text),
  public.confirm_audit_visit(uuid,uuid,integer) to authenticated;
comment on table public.audit_visits is 'Administrative visit scheduling only; no audit answers, technical scores or access grants. Pending rows feed the assigned auditor in-app notification.';
comment on column public.audit_visits.revision is 'Schedule revision starts at 1. Confirmation preserves it; changed administrative date/note increments it and requires fresh confirmation.';
comment on function public.read_audit_agenda(text,text) is 'Validated selected profile limits the result even for multi-profile accounts. Coordination has no separately granted agenda scope and receives an empty agenda.';
commit;

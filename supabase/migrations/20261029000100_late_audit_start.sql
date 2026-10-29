-- Per-visit administrative exception: the assigned auditor may start a confirmed audit
-- after its scheduled date. The audit keeps the scheduled date; only the start gate changes.
-- There is no RPC to grant it: an administrator sets it directly for each authorized visit.
begin;
alter table public.audit_visits add column if not exists late_start_allowed boolean not null default false;

do $$
declare f record; v_src text; v_def text;
  v_check constant text := 'if v.data_prevista<>(v_now at time zone ''America/Sao_Paulo'')::date then';
  v_projection constant text := '''confirmationStatus'',v.confirmation_status,''confirmedAt'',v.confirmed_at,';
begin
 -- start-audit: allow a past date only when the visit carries the exception.
 select p.oid into strict f from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='publication_command';
 v_def := pg_get_functiondef(f.oid);
 -- Idempotent: the SQL editor and `supabase db push` may both apply this file.
 if position('v.late_start_allowed' in v_def)=0 then
 if position(v_check in v_def)=0 then raise exception 'publication_command start date check not found'; end if;
 execute replace(v_def,v_check,
  'if v.data_prevista<>(v_now at time zone ''America/Sao_Paulo'')::date and not (v.late_start_allowed'
  ' and v.data_prevista<(v_now at time zone ''America/Sao_Paulo'')::date) then');
 end if;

 -- Agenda projections expose the exception so the card can enable the start button.
 for v_src in select unnest(array['project_selected_agenda_visits','project_agenda_month_visits']) loop
  select p.oid into strict f from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='dialogo_private' and p.proname=v_src;
  v_def := pg_get_functiondef(f.oid);
  if position('lateStartAllowed' in v_def)=0 then
  if position(v_projection in v_def)=0 then raise exception '% projection not found',v_src; end if;
  execute replace(v_def,v_projection,v_projection||'''lateStartAllowed'',v.late_start_allowed,');
  end if;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;

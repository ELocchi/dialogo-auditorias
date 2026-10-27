-- PostgREST runs each request in a transaction that is retried while it fails with SQLSTATE
-- 40001 (serialization_failure). Business conflicts raised with 40001 never succeed on retry,
-- so one request looped inside the database for hours (one job_payload_changed per second).
-- PT409 is answered by PostgREST as HTTP 409 and is never retried.
begin;
do $$
declare f record;
begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','dialogo_private') and p.prokind='f' and p.prosrc ~ 'errcode\s*=\s*''40001'''
 loop
  -- CREATE OR REPLACE keeps owner, grants and security definer settings.
  execute regexp_replace(pg_get_functiondef(f.oid),'errcode\s*=\s*''40001''','errcode=''PT409''','g');
 end loop;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','dialogo_private') and p.prosrc ~ 'errcode\s*=\s*''40001''') then
  raise exception 'conflict sqlstate rewrite incomplete';
 end if;
end $$;
notify pgrst,'reload schema';
commit;

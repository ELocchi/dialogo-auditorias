// Disposable PostgreSQL for query-count benchmarks. Never connects to a hosted DB.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
const authAdapter = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  grant usage on schema auth, public to anon, authenticated, service_role;
  -- Exercise explicit revocations under Supabase's legacy permissive defaults.
  -- These grants are still present on some existing projects; new projects can
  -- use explicit-only grants. RLS alone does not protect TRUNCATE or functions.
  -- https://supabase.com/docs/guides/api/securing-your-api
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  create function auth.uid() returns uuid
  language sql stable set search_path = '' as $uid$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    )::uuid;
  $uid$;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  create table auth.users (
    id uuid primary key,
    email text,
    email_change text default '',
    email_confirmed_at timestamptz,
    raw_user_meta_data jsonb default '{}'::jsonb,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    last_sign_in_at timestamptz,
    banned_until timestamptz,
    deleted_at timestamptz,
    is_anonymous boolean default false
  );
  set dialogo.test_database = 'isolated-local';
`;

export async function createNplusDatabase(root) {
 const {PGlite}=await import(process.env.PGLITE_MODULE_PATH ? pathToFileURL(process.env.PGLITE_MODULE_PATH).href : "@electric-sql/pglite");
 const db=await PGlite.create();
 try {
  await db.exec(authAdapter);
  await db.exec(`
      create schema storage;
      create table storage.buckets (id text primary key, name text, public boolean,
        file_size_limit integer, allowed_mime_types text[]);
      create table storage.objects (id uuid primary key, name text, bucket_id text);
      create function storage.foldername(name text) returns text[] language sql immutable
        as $$select array[split_part(name,'/',1),split_part(name,'/',2)]$$;
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated;
      grant select, insert, delete on storage.objects to authenticated;
      grant execute on function storage.foldername(text) to authenticated;
    `);
  const dir=path.join(root,"supabase/migrations");
  const names=(await readdir(dir)).filter(n=>n.endsWith(".sql") && n<="20261006000800_publication_evidence_batch.sql" && !["20260924000200_verify_published_audit_access.sql","20260930000400_test_orientative_report.sql"].includes(n)).sort();
  for(const name of names){
   let sql=await readFile(path.join(dir,name),"utf8");
   const delimiter=name==="20260924000100_published_audit_index.sql"?"integrity":name==="20260924000400_complete_audit_visit_on_publication.sql"?"backfill":null;
   if(delimiter){const start=sql.indexOf(`do $${delimiter}$`),end=sql.indexOf(`$${delimiter}$;`,start+5)+delimiter.length+3;if(start<0 || end<start)throw Error("Historical block missing");sql=sql.slice(0,start)+sql.slice(end);}
   await db.exec(sql);
  }
  return db;
 } catch(e){await db.close();throw e;}
}

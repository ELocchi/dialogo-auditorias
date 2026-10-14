// Isolated PostgreSQL: executes the production migration, never connects to Supabase.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH
  ? pathToFileURL(process.env.PGLITE_MODULE_PATH).href : '@electric-sql/pglite');
const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table public.test_accounts(id uuid primary key, active boolean);
    create function public.is_current_access_active() returns boolean language sql stable as
      $$select exists(select 1 from public.test_accounts where id=auth.uid() and active)$$;
    create table public.access_works(id uuid primary key,nome text,ativo boolean);
    create table public.published_audits(id uuid primary key,work_id uuid,modulo text,audit_date date,final_score numeric);
    insert into public.test_accounts values
      ('00000000-0000-4000-8000-000000000001',true),
      ('00000000-0000-4000-8000-000000000002',true),
      ('00000000-0000-4000-8000-000000000003',false);
    insert into public.access_works values ('00000000-0000-4000-8000-000000000101','Obra global',false);
    insert into public.published_audits values
      ('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000101','SEGURANCA','2026-10-13',8);
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/20261014000100_global_audit_ranking.sql', import.meta.url), 'utf8'));
  const selectAs = async (id, role = 'authenticated') => {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub','${id}',false); set role ${role};`);
    return (await db.query('select public.read_global_audit_ranking() as scores')).rows[0].scores;
  };
  const first = await selectAs('00000000-0000-4000-8000-000000000001');
  assert.deepEqual(await selectAs('00000000-0000-4000-8000-000000000002'), first);
  assert.equal(first.length,1);
  assert.deepEqual(Object.keys(first[0]).sort(), ['discipline','month','score','workId','workName']);
  await assert.rejects(db.query('select * from public.published_audits'), /permission denied/);
  await assert.rejects(selectAs('00000000-0000-4000-8000-000000000003'), /active_profile_required/);
  await assert.rejects(selectAs(''), /active_profile_required/);
  await assert.rejects(selectAs('', 'anon'), /permission denied/);
  await db.exec(`reset role; insert into public.published_audits values
    ('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000101','QUALIDADE','2026-10-14',9);`);
  assert.equal((await selectAs('00000000-0000-4000-8000-000000000001')).length,2);
  assert.equal((await selectAs('00000000-0000-4000-8000-000000000002')).length,2);
  console.log('PASS: global scores, fresh publications, active-user checks and protected audit tables.');
} finally { await db.close(); }

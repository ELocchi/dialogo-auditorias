/**
 * Run the actual SQL migrations and permission suites in isolated, in-memory
 * PostgreSQL (PGlite). No environment files, network connection, Auth HTTP call,
 * existing account, or hosted database are used by this runner.
 *
 * Install @electric-sql/pglite separately, then set PGLITE_MODULE_PATH to its
 * absolute dist/index.js path if it is not installed in this project's deps.
 * A workspace sibling database-test-tooling installation is also supported.
 *
 * This checks PostgreSQL SQL, constraints, triggers, privileges, and RLS. The
 * minimal auth schema below is an adapter, not a complete Supabase installation.
 * GoTrue, PostgREST, JWT signature verification, HTTP sessions, email delivery,
 * and simultaneous multi-connection locking still require integration checks.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselineOnly = process.argv.includes("--baseline-only");
if (process.argv.slice(2).some((arg) => arg !== "--baseline-only")) {
  throw new Error("Supported argument: --baseline-only");
}

async function loadPGlite() {
  const specified = process.env.PGLITE_MODULE_PATH;
  if (specified) {
    if (!path.isAbsolute(specified) || !existsSync(specified)) {
      throw new Error("PGLITE_MODULE_PATH must name an existing absolute local file.");
    }
    return import(pathToFileURL(specified).href);
  }
  try {
    return await import("@electric-sql/pglite");
  } catch (error) {
    if (error.code !== "ERR_MODULE_NOT_FOUND") throw error;
  }
  const sibling = path.resolve(projectRoot, "..", "database-test-tooling", "node_modules", "@electric-sql", "pglite", "dist", "index.js");
  if (existsSync(sibling)) return import(pathToFileURL(sibling).href);
  throw new Error("Install @electric-sql/pglite in isolated tooling and set PGLITE_MODULE_PATH to its dist/index.js file.");
}

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

const suites = [{
  name: "B.1 original signup/request/RLS suite",
  migrations: ["20260913000100_access_requests.sql"],
  test: "access_requests.sql",
}];
if (!baselineOnly) suites.push({
  name: "B.2 bootstrap/administration/RLS suite",
  migrations: ["20260913000100_access_requests.sql", "20260913000200_access_administration.sql"],
  test: "access_administration.sql",
}, {
  name: "B.3 migration preservation/multiple profiles/RLS suite",
  migrations: ["20260913000100_access_requests.sql", "20260913000200_access_administration.sql"],
  upgradeMigration: "20260913000300_multiple_access_profiles.sql",
  test: "multiple_access_profiles.sql",
  baselineAuthRows: 3,
}, {
  name: "B.4 engineering activities/history/RLS suite",
  migrations: ["20260913000100_access_requests.sql", "20260913000200_access_administration.sql", "20260913000300_multiple_access_profiles.sql"],
  upgradeMigration: "20260913000400_multiple_engineering_scopes.sql",
  test: "multiple_engineering_scopes.sql",
  baselineAuthRows: 3,
}, {
  name: "B.5 work details/revisions/history/RLS suite",
  migrations: ["20260913000100_access_requests.sql", "20260913000200_access_administration.sql", "20260913000300_multiple_access_profiles.sql", "20260913000400_multiple_engineering_scopes.sql"],
  upgradeMigration: "20260913000500_work_details.sql",
  test: "work_details.sql",
  baselineAuthRows: 3,
}, {
  name: "B.6 designated general access/preservation/atomicity/RLS suite",
  migrations: ["20260913000100_access_requests.sql", "20260913000200_access_administration.sql", "20260913000300_multiple_access_profiles.sql", "20260913000400_multiple_engineering_scopes.sql", "20260913000500_work_details.sql"],
  upgradeMigration: "20260914000100_designated_general_access.sql",
  test: "designated_general_access.sql",
  baselineAuthRows: 3,
}, {
  name: "B.7 audit agenda/confirmation/idempotency/history/RLS suite",
  migrations: ["20260913000100_access_requests.sql", "20260913000200_access_administration.sql", "20260913000300_multiple_access_profiles.sql", "20260913000400_multiple_engineering_scopes.sql", "20260913000500_work_details.sql", "20260914000100_designated_general_access.sql"],
  upgradeMigration: "20260914000200_audit_agenda.sql",
  test: "audit_agenda.sql",
  baselineAuthRows: 6,
});

const { PGlite } = await loadPGlite();
for (const suite of suites) {
  const db = await PGlite.create();
  try {
    await db.exec(authAdapter);
    const version = await db.query("select version() as version");
    console.log(`${suite.name}: ${version.rows[0].version}`);
    for (const migration of suite.migrations) {
      const sql = readFileSync(path.join(projectRoot, "supabase", "migrations", migration), "utf8");
      await db.exec(sql);
    }
    const testSql = readFileSync(path.join(projectRoot, "supabase", "tests", suite.test), "utf8");
    if (suite.upgradeMigration) {
      // Seed real legacy records BEFORE upgrading. Execute the unmodified,
      // versioned migration including its own transaction. Legacy snapshots
      // survive in temporary tables solely in this disposable in-memory DB.
      const phases = testSql.split("-- MIGRATION_UPGRADE_BOUNDARY");
      assert.equal(phases.length, 2, "The upgrade suite must contain exactly two phases.");
      await db.exec(phases[0]);
      await db.exec(readFileSync(path.join(projectRoot, "supabase", "migrations", suite.upgradeMigration), "utf8"));
      await db.exec(phases[1]);
    } else {
      await db.exec(testSql);
    }
    // Post-upgrade fixtures roll back. Pre-upgrade fixtures necessarily commit
    // with the real migration and are discarded with this in-memory database.
    const remaining = await db.query("select count(*)::integer as count from auth.users");
    assert.equal(remaining.rows[0].count, suite.baselineAuthRows ?? 0,
      "The SQL suite must roll back all new fixtures; only disposable pre-upgrade fixtures may remain.");
    console.log(`PASS: ${suite.name}; new fixtures rolled back; isolated database discarded.`);
  } catch (error) {
    console.error(`FAIL: ${suite.name}: ${error.message}`);
    if (error.detail) console.error(`Detail: ${error.detail}`);
    if (error.where) console.error(`Where: ${error.where}`);
    if (error.position) console.error(`SQL position: ${error.position}`);
    process.exitCode = 1;
    break;
  } finally {
    await db.close();
  }
}
if (!process.exitCode) {
  console.log("Local SQL verification complete. Supabase HTTP/Auth and multi-connection concurrency were not exercised.");
}


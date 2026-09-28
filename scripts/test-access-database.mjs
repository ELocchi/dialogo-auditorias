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
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselineOnly = process.argv.includes("--baseline-only");
const assignmentOnly = process.argv.includes("--assignment-only");
const overviewOnly = process.argv.includes("--overview-only");
if (process.argv.slice(2).some((arg) => !["--baseline-only", "--assignment-only", "--overview-only"].includes(arg))
  || ([baselineOnly, assignmentOnly, overviewOnly].filter(Boolean).length > 1)) {
  throw new Error("Supported arguments: --baseline-only, --assignment-only or --overview-only");
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
}, {
  name: "B.8 catalog revisions/private documents/idempotency/permissions suite",
  migrations: ["20260913000100_access_requests.sql", "20260913000200_access_administration.sql", "20260913000300_multiple_access_profiles.sql", "20260913000400_multiple_engineering_scopes.sql", "20260913000500_work_details.sql", "20260914000100_designated_general_access.sql", "20260914000200_audit_agenda.sql"],
  upgradeMigration: "20260916000100_catalog_revisions.sql",
  test: "catalog_revisions.sql",
  baselineAuthRows: 6,
}, {
  name: "B.9 full work registration/optional fields/atomicity/permissions suite",
  migrations: ["20260913000100_access_requests.sql", "20260913000200_access_administration.sql", "20260913000300_multiple_access_profiles.sql", "20260913000400_multiple_engineering_scopes.sql", "20260913000500_work_details.sql", "20260914000100_designated_general_access.sql", "20260914000200_audit_agenda.sql", "20260916000100_catalog_revisions.sql"],
  upgradeMigration: "20260916000200_full_work_registration.sql",
  test: "full_work_registration.sql",
  baselineAuthRows: 1,
}, {
  name: "B.10 active work-team profiles/grants/revocation/atomicity/RLS suite",
  migrations: ["20260913000100_access_requests.sql", "20260913000200_access_administration.sql", "20260913000300_multiple_access_profiles.sql", "20260913000400_multiple_engineering_scopes.sql", "20260913000500_work_details.sql", "20260914000100_designated_general_access.sql", "20260914000200_audit_agenda.sql", "20260916000100_catalog_revisions.sql", "20260916000200_full_work_registration.sql"],
  upgradeMigration: "20260916000300_work_team_access.sql",
  test: "work_team_access.sql",
  baselineAuthRows: 2,
}, {
  name: "B.12 work follow-up visits/no audit model/confirmation suite",
  migrations: ["20260913000100_access_requests.sql", "20260913000200_access_administration.sql", "20260913000300_multiple_access_profiles.sql", "20260913000400_multiple_engineering_scopes.sql", "20260913000500_work_details.sql", "20260914000100_designated_general_access.sql", "20260914000200_audit_agenda.sql", "20260916000100_catalog_revisions.sql", "20260916000200_full_work_registration.sql", "20260916000300_work_team_access.sql", "20260916000400_ibrahim_general_access.sql"],
  upgradeMigration: "20260916000500_work_follow_up_visits.sql",
  test: "work_follow_up_visits.sql",
  baselineAuthRows: 2,
}, {
  name: "B.13 schedule deletion/history/revoked rescheduling suite",
  migrations: ["20260913000100_access_requests.sql", "20260913000200_access_administration.sql", "20260913000300_multiple_access_profiles.sql", "20260913000400_multiple_engineering_scopes.sql", "20260913000500_work_details.sql", "20260914000100_designated_general_access.sql", "20260914000200_audit_agenda.sql", "20260916000100_catalog_revisions.sql", "20260916000200_full_work_registration.sql", "20260916000300_work_team_access.sql", "20260916000400_ibrahim_general_access.sql", "20260916000500_work_follow_up_visits.sql"],
  upgradeMigration: "20260917000100_delete_audit_agenda.sql",
  test: "delete_audit_agenda.sql",
  baselineAuthRows: 2,
}, {
  name: "B.14 administrative Safety/Quality/General permissions suite",
  migrations: ["20260913000100_access_requests.sql", "20260913000200_access_administration.sql", "20260913000300_multiple_access_profiles.sql", "20260913000400_multiple_engineering_scopes.sql", "20260913000500_work_details.sql", "20260914000100_designated_general_access.sql", "20260914000200_audit_agenda.sql", "20260916000100_catalog_revisions.sql", "20260916000200_full_work_registration.sql", "20260916000300_work_team_access.sql", "20260916000400_ibrahim_general_access.sql", "20260916000500_work_follow_up_visits.sql", "20260917000100_delete_audit_agenda.sql"],
  upgradeMigration: "20260917000200_administrative_scopes.sql",
  test: "administrative_scopes.sql",
  baselineAuthRows: 5,
}, {
  name: "B.16 follow-up orientative reports and findings permissions suite",
  migrations: ["20260913000100_access_requests.sql", "20260913000200_access_administration.sql", "20260913000300_multiple_access_profiles.sql", "20260913000400_multiple_engineering_scopes.sql", "20260913000500_work_details.sql", "20260914000100_designated_general_access.sql", "20260914000200_audit_agenda.sql", "20260916000100_catalog_revisions.sql", "20260916000200_full_work_registration.sql", "20260916000300_work_team_access.sql", "20260916000400_ibrahim_general_access.sql", "20260916000500_work_follow_up_visits.sql", "20260917000100_delete_audit_agenda.sql", "20260917000200_administrative_scopes.sql", "20260917000300_auditor_reference_documents.sql", "20260917000400_follow_up_reports.sql"],
  test: "follow_up_reports.sql",
});
suites.push({
  name: "B.17 persistent follow-up findings before report suite",
  migrations: [...suites[suites.length - 1].migrations, "20260918000100_follow_up_finding_drafts.sql"],
  test: "follow_up_finding_drafts.sql",
});
suites.push({
  name: "B.18 follow-up report sections suite",
  migrations: [...suites[suites.length - 1].migrations, "20260918000200_follow_up_report_sections.sql"],
  test: "follow_up_report_sections.sql",
});
suites.push({
  name: "B.19 private follow-up photos storage permissions suite",
  migrations: ["20260918000300_follow_up_photos.sql"],
  test: "follow_up_photos.sql",
  storageAdapter: true,
});
suites.push({
  name: "B.20 closed follow-up report and finding completion suite",
  migrations: [...suites[suites.length - 2].migrations, "20260918000400_follow_up_completion_and_lock.sql"],
  test: "follow_up_completion_and_lock.sql",
});
suites.push({
  name: "B.21 work findings without a visit suite",
  migrations: [...suites[suites.length - 1].migrations, "20260918000500_work_findings.sql", "20260921000100_follow_up_findings_by_module.sql"],
  test: "follow_up_work_findings.sql",
});
suites.push({
  name: "B.22 multiple immutable reports for one visit suite",
  migrations: [...suites[suites.length - 1].migrations, "20260918000600_multiple_follow_up_reports.sql"],
  test: "multiple_follow_up_reports.sql",
});
suites.push({
  name: "B.23 named immutable reports suite",
  migrations: [...suites[suites.length - 1].migrations, "20260918000700_named_follow_up_reports.sql"],
  test: "named_follow_up_reports.sql",
});
suites.push({
  name: "B.24 existing report title upgrade suite",
  migrations: suites[suites.length - 2].migrations,
  upgradeMigration: "20260918000700_named_follow_up_reports.sql",
  test: "named_follow_up_reports_upgrade.sql",
  baselineAuthRows: 2,
});
if (!baselineOnly) suites.push({
  name: "B.25 assigned audits without work access and LAN work fields suite",
  migrations: readdirSync(path.join(projectRoot, "supabase", "migrations"))
    .filter((name) => name.endsWith(".sql") && name <= "20260925000100_engineering_all_modules.sql"
      // This migration is only a deployment assertion about one historic real
      // audit. The isolated suite below supplies its own synthetic identities.
      && name !== "20260924000200_verify_published_audit_access.sql")
    .sort(),
  test: "audit_assignment_access.sql",
  storageAdapter: true,
  omitHistoricPublicationBackfills: true,
  // Current TS catalogs include fields introduced after the historical B.8
  // upgrade. Validate them against the current schema rather than its old one.
  validateBuiltInCatalogs: true,
});
if (!baselineOnly) suites.push({
  name: "B.26 administrator account editing and immutable history suite",
  migrations: readdirSync(path.join(projectRoot, "supabase", "migrations"))
    .filter((name) => name.endsWith(".sql") && name <= "20260925000200_edit_access_accounts.sql"
      && name !== "20260924000200_verify_published_audit_access.sql")
    .sort(),
  test: "edit_access_accounts.sql",
  storageAdapter: true,
  omitHistoricPublicationBackfills: true,
  validateBuiltInCatalogs: true,
});
if (!baselineOnly) suites.push({
  name: "B.27 Engineering coordination read-only agenda suite",
  migrations: readdirSync(path.join(projectRoot, "supabase", "migrations"))
    .filter((name) => name.endsWith(".sql") && name <= "20260925000300_engineering_coordination_agenda.sql"
      && name !== "20260924000200_verify_published_audit_access.sql")
    .sort(),
  test: "engineering_coordination_agenda.sql",
  storageAdapter: true,
  omitHistoricPublicationBackfills: true,
  validateBuiltInCatalogs: true,
});

if (!baselineOnly) suites.push({
  name: "B.28 Compact audit overview, lazy details and report authorization suite",
  migrations: readdirSync(path.join(projectRoot, "supabase", "migrations"))
    .filter((name) => name.endsWith(".sql") && name <= "20260928000100_published_audit_overview.sql"
      && name !== "20260924000200_verify_published_audit_access.sql")
    .sort(),
  test: "published_audit_overview.sql",
  storageAdapter: true,
  omitHistoricPublicationBackfills: true,
});

const { PGlite } = await loadPGlite();
for (const suite of suites.filter((item) => (!assignmentOnly || item.test === "audit_assignment_access.sql")
  && (!overviewOnly || item.test === "published_audit_overview.sql"))) {
  const db = await PGlite.create();
  let currentSqlFile = "";
  try {
    await db.exec(authAdapter);
    if (suite.storageAdapter) await db.exec(`
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
    const version = await db.query("select version() as version");
    console.log(`${suite.name}: ${version.rows[0].version}`);
    for (const migration of suite.migrations) {
      currentSqlFile = migration;
      let sql = readFileSync(path.join(projectRoot, "supabase", "migrations", migration), "utf8");
      assert.ok(sql.trim().length > 0, `Migration ${migration} must be fully available on disk.`);
      if (suite.omitHistoricPublicationBackfills) {
        // Execute all schema, functions, constraints, triggers and policies.
        // Only omit the two one-off blocks tied to the live Boulevar publication;
        // the regression supplies synthetic publications to exercise the same
        // completion trigger and read policies without copying production data.
        const delimiter = migration === "20260924000100_published_audit_index.sql" ? "integrity"
          : migration === "20260924000400_complete_audit_visit_on_publication.sql" ? "backfill" : null;
        if (delimiter) {
          const expression = new RegExp(`do \\$${delimiter}\\$[\\s\\S]*?\\$${delimiter}\\$;`);
          assert.equal(sql.match(expression)?.length, 1, "Historical publication block must be identified exactly.");
          sql = sql.replace(expression, "-- Historic live-data block omitted in isolated verification only.");
        }
      }
      await db.exec(sql);
    }
    const testSql = readFileSync(path.join(projectRoot, "supabase", "tests", suite.test), "utf8");
    currentSqlFile = suite.test;
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
    if (suite.validateBuiltInCatalogs) {
      const { criteriaForModel } = await import(pathToFileURL(path.join(projectRoot, "src", "domain", "prototype-audits.ts")).href);
      for (const [modelId, expectedCount] of [["security-it07-r02", 205], ["quality-f175", 10], ["quality-f176", 23]]) {
        const criteria = criteriaForModel(modelId);
        assert.equal(criteria.length, expectedCount, `${modelId}: built-in criterion count`);
        const validation = await db.query("select dialogo_private.valid_catalog_criteria($1::jsonb) as valid", [JSON.stringify(criteria)]);
        assert.equal(validation.rows[0].valid, true, `${modelId}: real built-in Criterion snapshots satisfy the SQL contract`);
      }
      console.log("PASS: actual built-in catalogs accepted by SQL (security 205, F175 10, F176 23 criteria).");
    }
    // Post-upgrade fixtures roll back. Pre-upgrade fixtures necessarily commit
    // with the real migration and are discarded with this in-memory database.
    const remaining = await db.query("select count(*)::integer as count from auth.users");
    assert.equal(remaining.rows[0].count, suite.baselineAuthRows ?? 0,
      "The SQL suite must roll back all new fixtures; only disposable pre-upgrade fixtures may remain.");
    console.log(`PASS: ${suite.name}; new fixtures rolled back; isolated database discarded.`);
  } catch (error) {
    console.error(`FAIL: ${suite.name} (${currentSqlFile}): ${error.message}`);
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

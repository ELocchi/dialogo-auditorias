import assert from "node:assert/strict";
import { test } from "node:test";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { agendaDetailQuery } from "../src/lib/agenda/detail-client.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const visitId = "ab120000-0000-4000-8000-000000000003";
let state;
const stubs = {
  "@/lib/auth/session": "export async function verifiedUser(){return globalThis.__agendaDetailRoute.user} export async function effectiveAccount(){return globalThis.__agendaDetailRoute.account}",
  "@/lib/auth/active-profile-session": "export async function readActiveProfileContext(){return globalThis.__agendaDetailRoute.selected}",
  "@/lib/access/workspace": "export async function readWorkspaceContext(){return globalThis.__agendaDetailRoute.context}",
  "@/lib/supabase/server": "export async function createClient(){return {}}",
  "@/lib/agenda/detail-service": "export async function readAgendaVisitDetail(client,context,id){const s=globalThis.__agendaDetailRoute;s.calls.push({context,id});return s.result}",
};
registerHooks({ resolve(specifier, context, nextResolve) {
  if (stubs[specifier]) return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
  if (specifier.startsWith("@/")) return nextResolve(pathToFileURL(path.join(root, "src", `${specifier.slice(2)}.ts`)).href, context);
  return nextResolve(specifier, context);
} });
const { GET } = await import("../src/app/api/agenda/visits/[visitId]/route.ts");
function reset() {
  state = { user: { id: "user" }, account: {}, selected: { profile: "ENGENHARIA", engineeringScope: "COORDENACAO", administrativeScope: null },
    context: { user: { id: "user", role: "engineering", activity: "coordination", modules: ["quality", "safety"] } },
    result: { available: true, visit: { id: visitId, note: "Observação autorizada", history: [] } }, calls: [] };
  globalThis.__agendaDetailRoute = state;
}
const get = (query = agendaDetailQuery(state.context?.user ?? { id: "user", role: "engineering", modules: [] }), id = visitId) =>
  GET(new Request(`https://fixture.invalid/api/agenda/visits/${id}?${query}`), { params: Promise.resolve({ visitId: id }) });

test("detail route authenticates selected context before reading the target", async () => {
  for (const [field, status] of [["user", 401], ["account", 403], ["selected", 403], ["context", 403]]) {
    reset(); state[field] = null;
    const response = await get();
    assert.equal(response.status, status); assert.deepEqual(await response.json(), { available: false }); assert.deepEqual(state.calls, []);
  }
  reset(); const response = await get(undefined, "bad-id"); assert.equal(response.status, 400); assert.deepEqual(state.calls, []);
});

test("detail route refuses stale displayed identity or scope and sends no private content", async () => {
  for (const changed of [{ id: "other" }, { role: "administrative" }, { activity: "site-team" }, { modules: ["quality"] }]) {
    reset(); const response = await get(agendaDetailQuery({ ...state.context.user, ...changed }));
    assert.equal(response.status, 403); assert.deepEqual(state.calls, []); assert.deepEqual(await response.json(), { available: false });
  }
});

test("detail route reads one exact visit and never permits browser or intermediary caching", async () => {
  reset(); const response = await get();
  assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("Vary"), "Cookie"); assert.deepEqual(await response.json(), state.result);
  assert.deepEqual(state.calls, [{ context: state.context, id: visitId }]);
});

test("start audit sends the detail route context for safety and quality auditors", async () => {
  const app = readFileSync(path.join(root, "src/app/components/prototype-app.tsx"), "utf8");
  const publication = readFileSync(path.join(root, "src/app/components/use-audit-publication.ts"), "utf8");
  const querySource = publication.match(/export function publicationQuery\([^]*?\n\}/)?.[0];
  assert.ok(querySource);
  const publicationQuery = new Function(stripTypeScriptTypes(querySource.replace(/^export /, "")) + "; return publicationQuery;")();
  // Exercise the URL actually used by the start button against the real route.
  const start = app.slice(app.indexOf("const startScheduledAudit ="), app.indexOf("const auditNav ="));
  const urlExpression = start.match(/fetch\((`[^`]+`)/)?.[1];
  assert.ok(urlExpression);
  const requestUrl = new Function("visit", "user", "agendaActor", "agendaDetailQuery", "publicationQuery", `return ${urlExpression};`);
  for (const discipline of ["safety", "quality"]) {
    reset();
    const user = { id: "user", role: `${discipline}-auditor`, modules: [discipline] };
    state.context.user = user;
    const actor = { userId: user.id, profile: discipline === "safety" ? "AUDITOR_SEGURANCA" : "AUDITOR_QUALIDADE", engineeringScope: null, administrativeScope: null };
    const url = requestUrl({ id: visitId }, user, actor, agendaDetailQuery, publicationQuery);
    const response = await GET(new Request(new URL(url, "https://fixture.invalid")), { params: Promise.resolve({ visitId }) });
    assert.equal(response.status, 200, `${discipline}: start audit must pass agenda context verification`);
    assert.deepEqual(await response.json(), state.result);
    assert.equal(state.calls.length, 1);
  }
});

test("removed, revoked and unavailable details never appear as an empty successful note", async () => {
  for (const [result, status] of [[{ available: true, visit: null }, 404], [{ available: false, forbidden: true }, 403], [{ available: false }, 503]]) {
    reset(); state.result = result; const response = await get(); assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { available: false }); assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  }
});

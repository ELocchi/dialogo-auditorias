import type { SupabaseClient } from "@supabase/supabase-js";
import { accessProfiles, type AccessDecision, type AccessGrant, type AccessWork, type EditableAccessAccount, type PendingRequest } from "./contracts.ts";

export const ADMINISTRATION_PAGE_SIZE = 20;
export type AdministrationView = "summary" | "pending" | "history";
export type AdministrationSummary = { view: "summary"; pendingCount: number; activeCount: number };
export type AdministrationPendingPage = {
  view: "pending"; page: number; pageSize: 20; total: number;
  requests: PendingRequest[]; works: AccessWork[];
};
export type AdministrationHistoryPage = {
  view: "history"; page: number; pageSize: 20; total: number;
  users: { account: EditableAccessAccount; decisions: AccessDecision[]; grants: (AccessGrant & { auth_user_id: string })[] }[];
  works: AccessWork[];
};
type AdministrationResult = AdministrationSummary | AdministrationPendingPage | AdministrationHistoryPage;

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const timestamp = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const stringOrNull = (value: unknown) => value === null || typeof value === "string";
const optionalString = (value: unknown) => value === undefined || stringOrNull(value);
const profile = (value: unknown) => typeof value === "string" && (accessProfiles as readonly string[]).includes(value);
const engineeringScope = (value: unknown) => value === "EQUIPE_OBRA" || value === "COORDENACAO";
const administrativeScope = (value: unknown) => value === "SEGURANCA" || value === "QUALIDADE" || value === "GERAL";
const unique = (values: string[]) => new Set(values.map((value) => value.toLowerCase())).size === values.length;
const arrayOf = (value: unknown, valid: (entry: unknown) => boolean): value is unknown[] => Array.isArray(value) && value.every(valid);
const profileArray = (value: unknown) => arrayOf(value, profile) && value.length > 0 && unique(value as string[]);
const scopeArray = (value: unknown) => arrayOf(value, engineeringScope) && unique(value as string[]);

function validWorks(value: unknown): value is AccessWork[] {
  return arrayOf(value, (work) => record(work) && uuid(work.id) && nonempty(work.nome) && work.ativo === true)
    && unique((value as AccessWork[]).map((work) => work.id));
}

function validPendingRequest(value: unknown): value is PendingRequest {
  return record(value) && uuid(value.auth_user_id) && nonempty(value.nome) && nonempty(value.email)
    && stringOrNull(value.cargo_area_informado) && stringOrNull(value.obra_referencia_informada)
    && timestamp(value.email_confirmado_em) && timestamp(value.created_at);
}

function validAccount(value: unknown): value is EditableAccessAccount {
  return record(value) && uuid(value.auth_user_id) && profileArray(value.perfis)
    && (value.atuacao_engenharia === null || engineeringScope(value.atuacao_engenharia))
    && scopeArray(value.atuacoes_engenharia)
    && (value.atuacao_administrativa === null || administrativeScope(value.atuacao_administrativa))
    && typeof value.ativo === "boolean";
}

function validGrant(value: unknown, historical = false): boolean {
  return record(value) && uuid(value.obra_id) && (value.modulo === "SEGURANCA" || value.modulo === "QUALIDADE")
    && ((historical && value.perfil === undefined) || (profile(value.perfil) && value.perfil !== "ADMINISTRATIVO"))
    && (!historical || optionalString(value.obra_nome));
}

const decisionTypes: AccessDecision["decision_type"][] = ["BOOTSTRAP", "APROVACAO", "AJUSTE_PERFIS_INICIAL", "AJUSTE_ATUACAO_INICIAL", "AJUSTE_ACESSOS_GERAIS", "VINCULO_OBRA", "DESVINCULO_OBRA", "EDICAO_USUARIO"];
function validDecision(value: unknown, userId: string): value is AccessDecision {
  if (!record(value) || !uuid(value.id) || value.auth_user_id !== userId
    || !decisionTypes.includes(value.decision_type as AccessDecision["decision_type"]) || !profile(value.perfil)
    || !(value.perfis === null || arrayOf(value.perfis, profile))
    || !(value.atuacao_engenharia === null || engineeringScope(value.atuacao_engenharia))
    || !(value.atuacoes_engenharia === null || arrayOf(value.atuacoes_engenharia, engineeringScope))
    || !(value.atuacao_administrativa == null || administrativeScope(value.atuacao_administrativa))
    || typeof value.reason !== "string" || !timestamp(value.decided_at)
    || !(value.actor_auth_user_id === null || uuid(value.actor_auth_user_id)) || !stringOrNull(value.actor_database_role)
    || !record(value.actor_snapshot) || !record(value.request_snapshot)
    || !arrayOf(value.grants_snapshot, (grant) => validGrant(grant, true))) return false;

  // Immutable snapshots predate multiple profiles and scopes. Check fields the
  // presentation uses without imposing today's account schema on old decisions.
  const request = value.request_snapshot;
  const actor = value.actor_snapshot;
  if (request.auth_user_id !== undefined && request.auth_user_id !== userId) return false;
  if (!["nome", "email", "cargo_area_informado", "obra_referencia_informada"].every((key) => optionalString(request[key]))) return false;
  if (!["auth_user_id", "nome", "email", "database_session_user", "database_role", "application_name"].every((key) => optionalString(actor[key]))) return false;
  const before = value.before_access_snapshot;
  if (before !== null && (!record(before) || !record(before.account)
    || !arrayOf(before.grants, (grant) => validGrant(grant, true))
    || (before.account.auth_user_id !== undefined && before.account.auth_user_id !== userId))) return false;
  if (value.decision_type === "EDICAO_USUARIO" && request.access_edit != null) {
    const edit = request.access_edit;
    if (!record(edit) || typeof edit.ativo !== "boolean" || !profileArray(edit.perfis) || !scopeArray(edit.atuacoes_engenharia)
      || !(edit.atuacao_administrativa === null || administrativeScope(edit.atuacao_administrativa))) return false;
    if (before !== null && (!record(before) || !record(before.account) || !profileArray(before.account.perfis)
      || !(before.account.atuacoes_engenharia == null || scopeArray(before.account.atuacoes_engenharia)))) return false;
  }
  return true;
}

function validUser(value: unknown): value is AdministrationHistoryPage["users"][number] {
  if (!record(value) || !validAccount(value.account)) return false;
  const userId = value.account.auth_user_id;
  if (!arrayOf(value.decisions, (decision) => validDecision(decision, userId))
    || !unique((value.decisions as AccessDecision[]).map((decision) => decision.id))
    || !arrayOf(value.grants, (grant) => record(grant) && grant.auth_user_id === userId && validGrant(grant))) return false;
  // A revoked profile or inactive work may remain in another user's historical
  // grant rows. The database controls visibility; do not discard those rows here.
  return unique((value.grants as AccessGrant[]).map((grant) => `${grant.perfil}/${grant.obra_id}/${grant.modulo}`));
}

export function readAdministration(client: Pick<SupabaseClient, "rpc">, view: "summary", page?: number): Promise<AdministrationSummary | null>;
export function readAdministration(client: Pick<SupabaseClient, "rpc">, view: "pending", page?: number): Promise<AdministrationPendingPage | null>;
export function readAdministration(client: Pick<SupabaseClient, "rpc">, view: "history", page?: number): Promise<AdministrationHistoryPage | null>;
export function readAdministration(client: Pick<SupabaseClient, "rpc">, view: AdministrationView, page?: number): Promise<AdministrationResult | null>;
/** One current, authorized database snapshot for the requested screen only. */
export async function readAdministration(client: Pick<SupabaseClient, "rpc">, view: AdministrationView, page = 1): Promise<AdministrationResult | null> {
  if (!["summary", "pending", "history"].includes(view) || !Number.isSafeInteger(page) || page < 1 || page > 999999) return null;
  try {
    const { data, error } = await client.rpc("read_access_administration_page", { p_view: view, p_page: page });
    if (error || !record(data) || data.view !== view) return null;
    if (view === "summary") return count(data.pendingCount) && count(data.activeCount)
      ? { view, pendingCount: data.pendingCount, activeCount: data.activeCount } : null;
    if (data.page !== page || data.pageSize !== ADMINISTRATION_PAGE_SIZE || !count(data.total) || !validWorks(data.works)) return null;
    const expectedRows = Math.max(0, Math.min(ADMINISTRATION_PAGE_SIZE, data.total - (page - 1) * ADMINISTRATION_PAGE_SIZE));
    if (view === "pending") {
      if (!arrayOf(data.requests, validPendingRequest) || data.requests.length !== expectedRows
        || !unique((data.requests as PendingRequest[]).map((request) => request.auth_user_id))) return null;
      return { view, page, pageSize: ADMINISTRATION_PAGE_SIZE, total: data.total, requests: data.requests as PendingRequest[], works: data.works };
    }
    if (!arrayOf(data.users, validUser) || data.users.length !== expectedRows
      || !unique((data.users as AdministrationHistoryPage["users"]).map((user) => user.account.auth_user_id))) return null;
    const users = data.users as AdministrationHistoryPage["users"];
    if (!unique(users.flatMap((user) => user.decisions.map((decision) => decision.id)))) return null;
    return { view, page, pageSize: ADMINISTRATION_PAGE_SIZE, total: data.total, users, works: data.works };
  } catch { return null; }
}

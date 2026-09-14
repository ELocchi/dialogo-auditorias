import { accessProfiles, type AccessGrant, type AccessProfile, type AccessWork, type EngineeringScope } from "./contracts.ts";
import { uuidPattern } from "./validation.ts";
import { corporateEmail } from "../auth/validation.ts";
import type { EffectiveAccount } from "../auth/effective-access.ts";
import type { AppModule, DemoUser, Role } from "../../domain/prototype-access.ts";
import type { WorkRecord } from "../../domain/operational-records.ts";

export type ProfileWorkspaceContext = {
  user: DemoUser;
  works: WorkRecord[];
  profile: AccessProfile;
  email: string;
  engineeringScope: EngineeringScope | null;
};
export type WorkspaceWork = AccessWork & Partial<Record<"cidade" | "uf" | "logradouro" | "numero" | "responsavel_tecnico" | "coordenacao", string>>;
type Input = {
  account: EffectiveAccount;
  profile: AccessProfile;
  engineeringScope?: EngineeringScope | null;
  identity: { id: string; name: string; email: string };
  works: WorkspaceWork[];
  grants: AccessGrant[];
};
const roles: Record<AccessProfile, Role> = {
  ADMINISTRATIVO: "administrative", AUDITOR_SEGURANCA: "safety-auditor",
  AUDITOR_QUALIDADE: "quality-auditor", ENGENHARIA: "engineering",
};

/** Map only current database permissions into the selected screen context.
 * This pure presentation adapter neither reads credentials nor creates grants.
 */
export function buildWorkspaceContext(input: Input): ProfileWorkspaceContext | null {
  try {
    const { account, profile, identity, works, grants } = input;
    if (!uuidPattern.test(identity.id) || account.auth_user_id !== identity.id || !corporateEmail(identity.email)
      || typeof identity.name !== "string" || !identity.name.trim() || account.ativo !== true
      || !Array.isArray(account.perfis) || !accessProfiles.includes(profile) || !account.perfis.includes(profile)
      || !Array.isArray(works) || !Array.isArray(grants)) return null;
    const engineeringScope = profile === "ENGENHARIA" ? (input.engineeringScope ?? account.atuacao_engenharia) : null;
    if (profile === "ENGENHARIA" && (!engineeringScope || !["EQUIPE_OBRA", "COORDENACAO"].includes(engineeringScope)
      || !Array.isArray(account.atuacoes_engenharia) || !account.atuacoes_engenharia.includes(engineeringScope))) return null;
    if (profile !== "ENGENHARIA" && input.engineeringScope != null) return null;
    if (works.some((work) => !work || !uuidPattern.test(work.id) || typeof work.nome !== "string" || !work.nome.trim()
      || typeof work.ativo !== "boolean" || [work.cidade, work.uf, work.logradouro, work.numero, work.responsavel_tecnico, work.coordenacao].some((value) => value !== undefined && typeof value !== "string")) || new Set(works.map((work) => work.id)).size !== works.length) return null;
    if (grants.some((grant) => !grant || !uuidPattern.test(grant.obra_id)
      || !["AUDITOR_SEGURANCA", "AUDITOR_QUALIDADE", "ENGENHARIA"].includes(grant.perfil)
      || !["SEGURANCA", "QUALIDADE"].includes(grant.modulo)
      || (grant.perfil === "AUDITOR_SEGURANCA" && grant.modulo !== "SEGURANCA")
      || (grant.perfil === "AUDITOR_QUALIDADE" && grant.modulo !== "QUALIDADE"))) return null;

    const activeWorks = works.filter((work) => work.ativo);
    const activeIds = new Set(activeWorks.map((work) => work.id));
    // Administrative contexts show the authorized maintenance catalog. This is
    // not a technical grant: auditor actions/documents remain role-restricted.
    const scopes = profile === "ADMINISTRATIVO"
      ? activeWorks.flatMap((work) => (["safety", "quality"] as const).map((module) => ({ workId: work.id, module })))
      : grants.filter((grant) => grant.perfil === profile && activeIds.has(grant.obra_id))
        .map((grant) => ({ workId: grant.obra_id, module: (grant.modulo === "SEGURANCA" ? "safety" : "quality") as AppModule }));
    const uniqueScopes = [...new Map(scopes.map((scope) => [`${scope.workId}/${scope.module}`, scope])).values()];
    const selectedIds = new Set(uniqueScopes.map((scope) => scope.workId));
    const selectedWorks = activeWorks.filter((work) => selectedIds.has(work.id)).map((work): WorkRecord => ({
      id: work.id, name: work.nome, city: [work.cidade, work.uf].filter(Boolean).join(", ") || "Não informado",
      engineer: work.responsavel_tecnico?.trim() || "Não informado", coordinator: work.coordenacao?.trim() || "Não informado",
      address: [work.logradouro, work.numero].filter(Boolean).join(", "),
      status: "Ativa", isDemo: false,
    })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    const modules = (["safety", "quality"] as const).filter((module) => profile === "ADMINISTRATIVO" || uniqueScopes.some((scope) => scope.module === module));
    const user: DemoUser = {
      id: identity.id, name: identity.name.trim(), role: roles[profile], modules,
      workIds: selectedWorks.map((work) => work.id), workModuleScopes: uniqueScopes,
      // Coordination's conditional agenda permission has not been separately granted.
      agendaWorkIds: profile === "ENGENHARIA" && engineeringScope === "COORDENACAO" ? [] : selectedWorks.map((work) => work.id),
      documentWorkIds: [],
      ...(profile === "ENGENHARIA" ? { activity: engineeringScope === "COORDENACAO" ? "coordination" as const : "site-team" as const } : {}),
    };
    return { user, works: selectedWorks, profile, email: identity.email, engineeringScope };
  } catch { return null; }
}



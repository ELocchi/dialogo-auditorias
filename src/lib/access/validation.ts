import { accessProfiles, type AccessGrant, type AccessProfile, type AdministrativeScope, type ApprovalInput, type EngineeringScope } from "./contracts.ts";

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const invalid = (message: string) => ({ ok: false as const, message });

function field(form: FormData, key: string): string | null {
  const values = form.getAll(key);
  return values.length === 1 && typeof values[0] === "string" ? values[0].trim() : null;
}

/** UX validation only; the database independently authorizes and checks every grant. */
export function validateApproval(form: FormData): { ok: true; data: ApprovalInput } | { ok: false; message: string } {
  const authUserId = field(form, "authUserId");
  const submittedProfiles = form.getAll("perfis");
  const scopeValues = form.getAll("atuacaoEngenharia");
  const scope = field(form, "atuacaoEngenharia") || null;
  const administrativeValues = form.getAll("atuacaoAdministrativa");
  const administrativeScope = field(form, "atuacaoAdministrativa") || null;
  const reason = field(form, "reason");
  if (!authUserId || !uuidPattern.test(authUserId)) return invalid("A solicitação não é válida. Atualize a página e tente novamente.");
  if (submittedProfiles.length === 0 || submittedProfiles.length > accessProfiles.length
    || submittedProfiles.some((value) => typeof value !== "string" || !accessProfiles.includes(value as AccessProfile))
    || new Set(submittedProfiles).size !== submittedProfiles.length || form.has("perfil")) return invalid("Escolha um ou mais perfis válidos, sem repetir.");
  const perfis = accessProfiles.filter((profile) => submittedProfiles.includes(profile));
  if (scopeValues.length > 1 || scopeValues.some((value) => typeof value !== "string")) return invalid("Revise a atuação de Engenharia.");
  if (perfis.includes("ENGENHARIA") && scope !== "EQUIPE_OBRA" && scope !== "COORDENACAO") return invalid("Escolha Equipe da obra ou Coordenação para Engenharia.");
  if (!perfis.includes("ENGENHARIA") && scope !== null) return invalid("A atuação de Engenharia deve ser informada apenas quando esse perfil é concedido.");
  if (administrativeValues.length > 1 || administrativeValues.some((value) => typeof value !== "string")) return invalid("Revise a atuação administrativa.");
  if (perfis.includes("ADMINISTRATIVO") && !["SEGURANCA", "QUALIDADE", "GERAL"].includes(administrativeScope ?? "")) return invalid("Escolha Administrativo de Segurança, Qualidade ou Geral.");
  if (!perfis.includes("ADMINISTRATIVO") && administrativeScope !== null) return invalid("A atuação administrativa deve ser informada apenas para o perfil Administrativo.");
  if (!reason || reason.length < 10 || reason.length > 1000) return invalid("Registre o motivo da aprovação com 10 a 1.000 caracteres.");
  if (field(form, "confirmation") !== "SIM") return invalid("Revise os perfis e cada acesso e confirme a aprovação.");

  const rawGrants = field(form, "grants");
  if (!rawGrants || rawGrants.length > 60000) return invalid("Revise a lista de obras e módulos autorizados.");
  let grants: unknown;
  try { grants = JSON.parse(rawGrants); } catch { return invalid("Revise a lista de obras e módulos autorizados."); }
  if (!Array.isArray(grants) || grants.length > 400) return invalid("Informe até 400 acessos por perfil, obra e módulo.");
  const validated: AccessGrant[] = [];
  const seen = new Set<string>();
  for (const grant of grants) {
    if (!grant || typeof grant !== "object" || Array.isArray(grant)
      || Object.keys(grant).length !== 3 || typeof grant.obra_id !== "string"
      || !uuidPattern.test(grant.obra_id) || !["SEGURANCA", "QUALIDADE"].includes(grant.modulo)) {
      return invalid("Escolha um perfil, uma obra e um módulo válidos em cada linha.");
    }
    if (grant.perfil === "ADMINISTRATIVO" || !perfis.includes(grant.perfil)) return invalid("Cada acesso a obras deve pertencer a um dos perfis técnicos selecionados.");
    if ((grant.perfil === "AUDITOR_SEGURANCA" && grant.modulo !== "SEGURANCA")
      || (grant.perfil === "AUDITOR_QUALIDADE" && grant.modulo !== "QUALIDADE")) return invalid("O módulo escolhido não corresponde ao perfil do auditor.");
    const obra_id = grant.obra_id.toLowerCase();
    const key = `${grant.perfil}/${obra_id}/${grant.modulo}`;
    if (seen.has(key)) return invalid("O mesmo perfil, obra e módulo foram informados mais de uma vez. Remova a repetição.");
    seen.add(key);
    validated.push({ perfil: grant.perfil, obra_id, modulo: grant.modulo });
  }
  if (perfis.some((profile) => profile !== "ADMINISTRATIVO" && !validated.some((grant) => grant.perfil === profile))) return invalid("Informe ao menos uma obra e um módulo para cada perfil técnico selecionado.");
  return { ok: true, data: { authUserId: authUserId.toLowerCase(), perfis, atuacaoEngenharia: scope as EngineeringScope | null, atuacaoAdministrativa: administrativeScope as AdministrativeScope | null, grants: validated, reason } };
}

export function validateWork(form: FormData) {
  const nome = field(form, "nome");
  if (!nome || nome.length < 2 || nome.length > 160) return invalid("Informe o nome real da obra com 2 a 160 caracteres.");
  return { ok: true as const, data: { nome } };
}

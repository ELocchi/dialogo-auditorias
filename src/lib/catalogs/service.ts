import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileWorkspaceContext } from "../access/workspace-context.ts";
import { modelModule } from "../../domain/prototype-access.ts";
import { catalogModelIds, bundledCatalog, bundledFvsWeights, unavailableCatalogs, type CatalogSaveResult, type CatalogSnapshot, type CatalogVersion, type FvsWeightVersion } from "./contracts.ts";
import { isRecord, isModel, isUuid, validText, parseCriteria, parseFvsRevisionForm, parseFvsServices, parseRevisionForm, parseUpload } from "./validation.ts";

type Client = Pick<SupabaseClient, "rpc">;
export const missingCatalogMigration = (error: { code?: string } | null) => error?.code === "PGRST202" || error?.code === "42883";

export async function readCatalogSnapshot(client: Client, context: ProfileWorkspaceContext): Promise<CatalogSnapshot> {
  try {
    const { data, error } = await client.rpc("read_audit_catalogs", { p_profile: context.profile, p_engineering_scope: context.engineeringScope });
    if (error) return { ...unavailableCatalogs(), setupPending: missingCatalogMigration(error) };
    if (!Array.isArray(data) || data.length > 3) return unavailableCatalogs();
    const allowed = catalogModelIds.filter((id) => context.user.modules.includes(modelModule(id)));
    const versions: CatalogVersion[] = [];
    for (const raw of data) {
      if (context.profile === "ADMINISTRATIVO" && isRecord(raw) && isModel(raw.modelId) && !allowed.includes(raw.modelId)) continue;
      if (!isRecord(raw) || !isUuid(raw.id) || !isModel(raw.modelId) || !allowed.includes(raw.modelId)
        || !Number.isInteger(raw.version) || Number(raw.version) < 1 || Number(raw.version) > 2147483647
        || !validText(raw.label, 80) || !raw.label.trim() || !validText(raw.changeNote, 2000)
        || typeof raw.createdAt !== "string" || !Number.isFinite(Date.parse(raw.createdAt))) return unavailableCatalogs();
      const criteria = parseCriteria(raw.criteria);
      if (!criteria || (context.profile === "ENGENHARIA" && criteria.some((entry) => entry.documentedWeight !== null || entry.configuredWeight !== undefined || entry.weightConfigurationId !== undefined))) return unavailableCatalogs();
      versions.push({ id: raw.id, modelId: raw.modelId, version: Number(raw.version), label: raw.label, changeNote: raw.changeNote, criteria, createdAt: raw.createdAt });
    }
    if (new Set(versions.map((item) => item.modelId)).size !== versions.length) return unavailableCatalogs();
    for (const id of allowed) {
      if (versions.some((entry) => entry.modelId === id)) continue;
      const initial = bundledCatalog(id);
      if (context.profile === "ENGENHARIA") initial.criteria = initial.criteria.map((criterion) => {
        const clean = { ...criterion, documentedWeight: null };
        delete clean.configuredWeight; delete clean.weightConfigurationId;
        return clean;
      });
      versions.push(initial);
    }
    let fvsWeights: FvsWeightVersion | undefined;
    if (context.user.modules.includes("quality") && (context.profile === "ADMINISTRATIVO" || context.profile === "AUDITOR_QUALIDADE")) {
      const current = await client.rpc("read_fvs_services", { p_profile: context.profile });
      if (current.error && !missingCatalogMigration(current.error)) return unavailableCatalogs();
      if (!current.error && current.data !== null) {
        const raw = current.data;
        if (!isRecord(raw) || !isUuid(raw.id) || !Number.isInteger(raw.version) || Number(raw.version) < 1
          || !validText(raw.label, 80) || !raw.label.trim() || typeof raw.createdAt !== "string" || !Number.isFinite(Date.parse(raw.createdAt))) return unavailableCatalogs();
        const services = parseFvsServices(raw.services);
        if (!services) return unavailableCatalogs();
        fvsWeights = { id: raw.id, version: Number(raw.version), label: raw.label, services, createdAt: raw.createdAt };
      } else fvsWeights = bundledFvsWeights();
    }
    return { available: true, versions, fvsWeights };
  } catch { return unavailableCatalogs(); }
}

export async function saveFvsWeightsRevision(form: FormData, context: ProfileWorkspaceContext, client: Client): Promise<CatalogSaveResult> {
  const failure = (message: string): CatalogSaveResult => ({ status: "error", message });
  if (context.profile !== "ADMINISTRATIVO" || context.user.role !== "administrative" || !context.user.modules.includes("quality")) {
    return failure("Somente o Administrativo de Qualidade pode editar os pesos FVS.");
  }
  const value = parseFvsRevisionForm(form);
  if (!value || value.actorId !== context.user.id) return failure("Confira os pesos e o usuário antes de salvar a revisão.");
  try {
    const { data, error } = await client.rpc("save_fvs_services_revision", {
      p_request_id: value.requestId, p_expected_version: value.expectedVersion,
      p_revision_label: value.label, p_change_note: value.note, p_services: value.services,
    });
    if (error) {
      if (missingCatalogMigration(error)) return failure("A edição dos pesos FVS estará disponível após a atualização da plataforma.");
      if (error.code === "40001") return failure("Outra revisão dos pesos FVS foi salva. Atualize a página antes de editar novamente.");
      if (error.code === "42501") return failure("Seu acesso mudou. Entre novamente no perfil Administrativo de Qualidade.");
      if (error.code === "22023") return failure("Informe pesos entre 1 e 5 para todas as FVS.");
      return failure("Não foi possível confirmar os pesos FVS. Mantenha esta janela aberta e tente novamente.");
    }
    if (!isUuid(data)) return failure("Não foi possível confirmar a revisão dos pesos FVS.");
    const snapshot = await readCatalogSnapshot(client, context);
    return { status: "success", message: snapshot.available ? "Pesos FVS salvos para as próximas auditorias." : "Pesos FVS salvos. Atualize a página para consultar a revisão.", snapshot };
  } catch { return failure("Não foi possível confirmar os pesos FVS. Mantenha esta janela aberta e tente novamente."); }
}

export async function saveCatalogRevision(form: FormData, context: ProfileWorkspaceContext, client: Client): Promise<CatalogSaveResult> {
  const failure = (message: string): CatalogSaveResult => ({ status: "error", message });
  if (context.profile !== "ADMINISTRATIVO" || context.user.role !== "administrative") return failure("Somente o Administrativo pode editar os roteiros.");
  const value = parseRevisionForm(form);
  if (!value || value.actorId !== context.user.id) return failure("Confira os campos e o usuário antes de salvar a revisão.");
  if (!context.user.modules.includes(modelModule(value.modelId))) return failure("Este roteiro não pertence à disciplina selecionada.");
  let pdf;
  try {
    pdf = await parseUpload(form.get("pdf"), "pdf");
  } catch (reason) { return failure(reason instanceof Error ? reason.message : "Não foi possível ler o arquivo."); }
  try {
    const { data, error } = await client.rpc("save_audit_catalog_revision", {
      p_request_id: value.requestId, p_model_id: value.modelId, p_expected_version: value.expectedVersion,
      p_revision_label: value.label, p_change_note: value.note, p_criteria: value.criteria,
      p_pdf_base64: pdf?.base64 ?? null, p_pdf_name: pdf?.name ?? null,
      p_original_base64: null, p_original_name: null,
    });
    if (error) {
      if (missingCatalogMigration(error)) return failure("O salvamento de revisões estará disponível após a atualização da plataforma.");
      if (error.code === "40001") return failure("Outra revisão foi salva. Atualize a página e confira os itens antes de editar novamente.");
      if (error.code === "42501") return failure("Seu acesso mudou. Entre novamente e selecione o perfil Administrativo.");
      if (error.code === "22023" && error.message === "invalid_catalog_criteria") return failure("Confira os campos obrigatórios dos itens. Alterações de títulos e descrições não exigem novo arquivo nem nova identificação da revisão de referência.");
      if (error.code === "22023" && error.message === "invalid_catalog_document") return failure("Confira o arquivo e a identificação da nova revisão de referência.");
      if (error.code === "22023") return failure("Confira os dados informados antes de salvar.");
      return failure("Não foi possível confirmar o salvamento. Mantenha esta janela aberta e tente novamente.");
    }
    if (!isUuid(data)) return failure("Não foi possível confirmar o salvamento. Atualize a página para conferir as revisões.");
    const snapshot = await readCatalogSnapshot(client, context);
    return { status: "success", message: snapshot.available ? "Alterações salvas para as próximas auditorias." : "Alterações salvas. Atualize a página para consultar o roteiro.", snapshot };
  } catch { return failure("Não foi possível confirmar o salvamento. Mantenha esta janela aberta e tente novamente."); }
}

import type { Criterion } from "../../domain/catalogs.ts";
import { criteriaForModel } from "../../domain/prototype-audits.ts";
import type { AuditModelId } from "../../domain/operational-records.ts";

export type CatalogVersion = {
  id: string | null;
  modelId: AuditModelId;
  version: number;
  label: string;
  changeNote: string;
  criteria: Criterion[];
  createdAt: string | null;
};
export type CatalogSnapshot = {
  available: boolean;
  versions: CatalogVersion[];
  /** Only a missing migration permits the bundled catalog for a new preview. */
  setupPending?: boolean;
};
export type CatalogSaveResult = { status: "success" | "error"; message: string; snapshot?: CatalogSnapshot };
export const catalogModelIds: AuditModelId[] = ["security-it07-r02", "quality-f175", "quality-f176"];
export function bundledCatalog(modelId: AuditModelId): CatalogVersion {
  return { id: null, modelId, version: 0, label: modelId === "security-it07-r02" ? "02" : "00",
    changeNote: "Documento de referência inicial", criteria: structuredClone(criteriaForModel(modelId)), createdAt: null };
}
export function catalogVersion(snapshot: CatalogSnapshot, modelId: AuditModelId): CatalogVersion {
  return snapshot.versions.find((entry) => entry.modelId === modelId) ?? bundledCatalog(modelId);
}
export const unavailableCatalogs = (): CatalogSnapshot => ({ available: false, versions: [] });

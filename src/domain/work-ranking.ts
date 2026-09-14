import type { WorkRecord, AuditRecord, AuditModelId } from "./operational-records";

export interface WorkRankingRow {
  work: WorkRecord;
  audit: AuditRecord | null;
  finalScore: number | null;
  position: number | null;
}

const workNames = new Intl.Collator("pt-BR", { sensitivity: "base" });
const workKey = (id: string, isDemo: boolean) => `${isDemo ? "demo" : "real"}:${id}`;
const compareIds = (first: string, second: string) => first < second ? -1 : first > second ? 1 : 0;

function availableScore(audit: AuditRecord | null): number | null {
  if (!audit || audit.status !== "Publicada" || audit.collectionStatus !== "Coleta concluída" || audit.calculationStatus !== "Disponível") return null;
  const score = audit.finalScore;
  return typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 10 ? score : null;
}

/** Usa a última auditoria do roteiro, mesmo quando ela ainda não tem resultado.
 * Datas no formato YYYY-MM-DD são ordenadas diretamente; na mesma data vence o maior ID lexical.
 * As notas já disponíveis são apenas ordenadas: esta função não calcula notas ou penalidades.
 */
export function getWorkRanking(
  works: readonly WorkRecord[],
  audits: readonly AuditRecord[],
  modelId: AuditModelId,
): WorkRankingRow[] {
  const latestByWork = new Map<string, AuditRecord>();
  for (const audit of audits) {
    if (audit.modelId !== modelId) continue;
    const key = workKey(audit.workId, audit.isDemo);
    const latest = latestByWork.get(key);
    if (!latest || audit.date > latest.date || (audit.date === latest.date && compareIds(audit.id, latest.id) > 0)) {
      latestByWork.set(key, audit);
    }
  }

  const rows: WorkRankingRow[] = works.map((work) => {
    const audit = latestByWork.get(workKey(work.id, work.isDemo)) ?? null;
    return { work, audit, finalScore: availableScore(audit), position: null };
  });

  rows.sort((first, second) => {
    if (first.finalScore !== second.finalScore) {
      if (first.finalScore === null) return 1;
      if (second.finalScore === null) return -1;
      return second.finalScore - first.finalScore;
    }
    return workNames.compare(first.work.name, second.work.name)
      || compareIds(first.work.id, second.work.id)
      || Number(first.work.isDemo) - Number(second.work.isDemo);
  });

  let previousScore: number | null = null;
  let position = 0;
  return rows.map((row, index) => {
    if (row.finalScore === null) return row;
    if (row.finalScore !== previousScore) position = index + 1;
    previousScore = row.finalScore;
    return { ...row, position };
  });
}

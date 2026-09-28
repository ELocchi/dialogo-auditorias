import { getCriterionWeight, type Criterion } from "../../domain/catalogs.ts";
import { calculateChecksCompliance, type DraftAnswer, type ItemResponse } from "../../domain/audit-draft.ts";

export function getGroupHeading(group: string) {
  const match = group.match(/^([^\s.—–-]+)\s*(?:\.|—|–|-)\s*(.+)$/);
  return {
    number: match?.[1] ?? group,
    title: match?.[2] ?? group,
  };
}

export function getSubgroupHeading(item: Criterion) {
  const match = item.subgroup.match(/^([\d.]+)\s*(?:—|–|-)\s*(.+)$/);
  return { code: match?.[1] ?? item.code.split(".").slice(0, -1).join("."), title: match?.[2] ?? item.subgroup };
}

export function displayAuditDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

export function awardedItemScore(criterion: Criterion, response: ItemResponse, security: boolean): number | null {
  if (security) return response.answer === "0" || response.answer === "5" || response.answer === "10" ? Number(response.answer) : null;
  const weight = getCriterionWeight(criterion);
  if (weight === null) return null;
  if (criterion.verificationRule === "Dividido pela quantidade verificada") {
    const verified = (response.checks ?? []).filter((check) => check.compliant !== null);
    const compliance = calculateChecksCompliance(verified);
    return compliance === null ? null : weight * compliance;
  }
  return response.answer === "Conforme" ? weight : response.answer === "Não conforme" ? 0 : null;
}

export function scoreLabel(score: number | null, answer?: DraftAnswer): string {
  if (answer === "N/A") return "N/A";
  return score === null ? "--" : score.toFixed(2).replace(".", ",");
}


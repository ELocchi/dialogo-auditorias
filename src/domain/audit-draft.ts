import { getCriterionWeight, type Criterion } from "./catalogs.ts";

export type DraftAnswer = "0" | "5" | "10" | "N/A" | "Conforme" | "Não conforme" | "Não verificado" | "Constatação qualitativa";

export interface DraftCheck {
  id: string;
  label: string;
  compliant: boolean | null;
  photos?: string[];
}

export interface ItemResponse {
  answer?: DraftAnswer;
  note: string;
  checks?: DraftCheck[];
  photos?: string[];
}

export type AuditDrafts = Record<string, Record<string, ItemResponse>>;

export const createDraftKey = (model: string): string => model;

export const getItemResponse = (drafts: AuditDrafts, model: string, criterion: Criterion): ItemResponse => drafts[createDraftKey(model)]?.[criterion.id] ?? { note: "" };

export const updateItemResponse = (drafts: AuditDrafts, model: string, criterion: Criterion, response: ItemResponse): AuditDrafts => ({
  ...drafts,
  [createDraftKey(model)]: {
    ...drafts[createDraftKey(model)],
    [criterion.id]: response,
  },
});

export const getResponseLabel = (response: ItemResponse): string => response.answer ?? "Não respondido";

export const getAdjacentIndex = (currentIndex: number, total: number, direction: -1 | 1): number => Math.max(0, Math.min(Math.max(total - 1, 0), currentIndex + direction));

export function calculateSecurityGroupScore(criteria: Criterion[], drafts: AuditDrafts, model: string): number | null {
  let obtainedPoints = 0;
  let possiblePoints = 0;
  for (const criterion of criteria) {
    const answer = getItemResponse(drafts, model, criterion).answer;
    if (answer !== "0" && answer !== "5" && answer !== "10") continue;
    const itemWeight = getCriterionWeight(criterion) ?? 0;
    obtainedPoints += Number(answer) * itemWeight;
    possiblePoints += 10 * itemWeight;
  }
  return possiblePoints > 0 ? obtainedPoints / possiblePoints * 10 : null;
}

export function calculateSecurityFinalScore(criteria: Criterion[], drafts: AuditDrafts, model: string): number | null {
  const groups = criteria.reduce<Record<string, Criterion[]>>((result, criterion) => {
    (result[criterion.group] ??= []).push(criterion);
    return result;
  }, {});
  let weightedGroupScores = 0;
  let applicableGroupWeights = 0;
  for (const groupCriteria of Object.values(groups)) {
    const groupScore = calculateSecurityGroupScore(groupCriteria, drafts, model);
    if (groupScore === null) continue;
    const groupWeight = groupCriteria[0]?.groupWeight ?? 0;
    weightedGroupScores += groupScore * groupWeight;
    applicableGroupWeights += groupWeight;
  }
  return applicableGroupWeights > 0 ? weightedGroupScores / applicableGroupWeights : null;
}

export function calculateQualityFinalScore(criteria: Criterion[], drafts: AuditDrafts, model: string): number | null {
  const totalWeight = criteria.reduce((total, criterion) => total + (getCriterionWeight(criterion) ?? 0), 0);
  let applicableWeight = 0;
  let obtainedScore = 0;
  for (const criterion of criteria) {
    const response = getItemResponse(drafts, model, criterion);
    const weight = getCriterionWeight(criterion) ?? 0;
    if (response.answer === "N/A") continue;
    if (criterion.verificationRule === "Dividido pela quantidade verificada") {
      const checks = (response.checks ?? []).filter((check) => check.compliant !== null);
      if (!checks.length) continue;
      applicableWeight += weight;
      obtainedScore += weight * checks.filter((check) => check.compliant).length / checks.length;
    } else if (response.answer === "Conforme" || response.answer === "Não conforme") {
      applicableWeight += weight;
      if (response.answer === "Conforme") obtainedScore += weight;
    }
  }
  return applicableWeight > 0 ? obtainedScore * totalWeight / applicableWeight : null;
}

export const calculateAuditFinalScore = (criteria: Criterion[], drafts: AuditDrafts, model: string): number | null =>
  model === "security-it07-r02"
    ? calculateSecurityFinalScore(criteria, drafts, model)
    : calculateQualityFinalScore(criteria, drafts, model);

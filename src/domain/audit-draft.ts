import type { Criterion } from "./catalogs";

export type DraftAnswer = "0" | "5" | "10" | "N/A" | "Não verificado" | "Constatação qualitativa";

export interface ItemResponse {
  answer?: DraftAnswer;
  note: string;
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

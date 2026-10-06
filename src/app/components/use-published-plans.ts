"use client";
import { usePageResource } from "./use-page-resource";
import { useHistoryActor } from "./audit-history-context";
import { publicationQuery } from "./use-audit-publication";
import type { PublicationIndex } from "@/lib/publications/contracts";
import { uuidPattern } from "@/lib/access/validation";
const valid = (v: unknown): v is PublicationIndex => {
 const p = v as PublicationIndex;
 return !!p && Array.isArray(p.plans) && p.plans.length <= 50 && p.plans.every(x => x && uuidPattern.test(x.auditId) && uuidPattern.test(x.workId) && ["quality","safety"].includes(x.module));
};
export function usePublishedPlans(ids: string[]) {
 const actor = useHistoryActor();
 const selected = [...new Set(ids.filter(id => uuidPattern.test(id)))].sort().slice(0,50);
 return usePageResource(`/api/publications?${actor ? publicationQuery(actor) : ""}&ids=${selected.join(",")}`, valid, !!actor && !!selected.length);
}

import type { WorkRecord } from "./operational-records.ts";
import { canAccessWorkModule, canAuditModule, canReadVisit, type AuditAssignment, type DemoUser, type Visit } from "./prototype-access.ts";

function isOwnAuditVisit(user: DemoUser, visit: Visit): boolean {
  return visit.kind === "audit" && visit.modelId !== null && visit.auditorId === user.id
    && canAuditModule(user, visit.module) && canReadVisit(user, visit);
}

/** Rebuild from the current trusted agenda; unavailable or removed visits confer no permission. */
export function currentAuditAssignments(user: DemoUser, visits: readonly Visit[], available: boolean): AuditAssignment[] {
  if (!available) return [];
  const assignments = new Map<string, AuditAssignment>();
  for (const visit of visits) {
    if (!isOwnAuditVisit(user, visit) || visit.confirmationStatus !== "confirmed" || !visit.modelId) continue;
    assignments.set(visit.id, { visitId: visit.id, workId: visit.workId, modelId: visit.modelId });
  }
  return [...assignments.values()];
}

/** For agenda/audit screens only. Do not use this display list as work access grants. */
export function assignedAgendaWorks(user: DemoUser, works: readonly WorkRecord[], visits: readonly Visit[]): WorkRecord[] {
  const visible = new Map(works.filter((work) => user.modules.some((module) => canAccessWorkModule(user, work.id, module)))
    .map((work) => [work.id, work]));
  for (const visit of visits) {
    if (!isOwnAuditVisit(user, visit) || visible.has(visit.workId)) continue;
    visible.set(visit.workId, {
      id: visit.workId, name: visit.workName?.trim() || "Obra da auditoria",
      city: "", engineer: "", coordinator: "", status: "Ativa", isDemo: false,
    });
  }
  return [...visible.values()];
}

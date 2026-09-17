import type { DemoUser, Visit, VisitInput } from "../../domain/prototype-access.ts";

export type AgendaNotification = {
  id: string;
  type: "visit_scheduled" | "visit_confirmation_requested" | "visit_confirmed";
  workName: string;
  createdAt: string;
  detail: string;
  href: string;
};

export type AgendaSnapshot = {
  available: boolean;
  visits: Visit[];
  auditors: DemoUser[];
  notifications: AgendaNotification[];
};

export type CreateAgendaVisitInput = VisitInput & { requestId: string };
export type DeleteAgendaVisitInput = {
  visitId: string;
  requestId: string;
  expectedRevision: number;
};
export type ConfirmAgendaVisitInput = DeleteAgendaVisitInput;
export type AgendaActionResult = {
  status: "success" | "error";
  message: string;
  visitId?: string;
  snapshot?: AgendaSnapshot;
};

/** Expected UI context is compared with the verified session; it grants no authority. */
export type AgendaActorContext = { userId: string; profile: string; engineeringScope: string | null; administrativeScope: string | null };

export function unavailableAgenda(): AgendaSnapshot {
  return { available: false, visits: [], auditors: [], notifications: [] };
}

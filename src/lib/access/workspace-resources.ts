/** Data needed by the visible workspace. The complete agenda is retained for calendars. */
export function workspaceResources(screen: string) {
  return {
    agenda: !["follow_up", "works", "settings", "criteria", "report", "discussion", "publication", "engineering_coordination"].includes(screen),
    dashboard: ["overview", "engineering_quality", "engineering_safety"].includes(screen),
  };
}

export type WorkspaceEntryScreen = "overview" | "works" | "agenda" | "audits" | "follow_up" | "report" | "settings" | "action_plan";

export function workspaceEntryScreen(section: string | undefined, profile: string,
  engineeringScope: string | null, administrativeScope: string | null, hasActionPlan = false): WorkspaceEntryScreen {
  if (hasActionPlan) return "action_plan";
  if (section === "obras") return "works";
  const auditor = profile === "AUDITOR_SEGURANCA" || profile === "AUDITOR_QUALIDADE";
  if (section === "agenda") return profile === "ENGENHARIA" && engineeringScope === "COORDENACAO" ? "overview" : "agenda";
  if (section === "acompanhamento" && auditor) return "follow_up";
  if (section === "auditorias" || section === "relatorios" && auditor) return auditor ? "audits" : "overview";
  if (section === "relatorios") return profile === "ENGENHARIA" ? "overview" : "report";
  if (section === "administracao" && administrativeScope === "GERAL") return "settings";
  return "overview";
}

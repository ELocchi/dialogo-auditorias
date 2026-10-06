import type { ListItem } from "./contracts.ts";
import type { WorkFinding } from "../../app/follow-up/actions.ts";
import type { SavedFollowUpFinding } from "../follow-up/display.ts";

export function listWorkFinding(item: ListItem): WorkFinding {
  return { id: item.id, workId: item.workId, module: item.module, location: item.location!, description: item.description!,
    correction: item.correction!, serious: item.serious!, photoFileName: item.photoFileName!, createdAt: item.createdAt! };
}
export function listSavedFinding(item: ListItem): SavedFollowUpFinding {
  return { id: item.id, workId: item.workId, visitId: item.visitId!, workName: item.workName, date: item.date!,
    source: item.source === "report" ? "report" : "saved", location: item.location!, description: item.description!, correction: item.correction!, serious: item.serious! };
}
export function listReportHref(item: ListItem): string {
  return item.visitId ? `/app/acompanhamento/relatorio/${item.visitId}/pdf?relatorio=${item.id}`
    : `/app/acompanhamento/relatorio/avulso/${item.id}/pdf`;
}

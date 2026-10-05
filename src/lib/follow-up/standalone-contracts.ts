import { uuidPattern } from "../access/validation.ts";
import { parseFindings, type FollowUpFinding } from "./service.ts";
import { parsePhotoFileName } from "./photos.ts";

export type StandaloneReportInput = {
  requestId: string; workId: string; date: string; title: string;
  participants: string; subjects: string; decisions: string; findingIds: string[];
};
export type StandaloneReportHeader = {
  id: string; workId: string; module: "safety" | "quality"; workName: string;
  auditorId: string; auditorName: string; date: string; title: string; updatedAt: string;
};
export type StandaloneReport = StandaloneReportHeader & {
  participants: string; subjects: string; decisions: string; findings: FollowUpFinding[];
  photos: { findingId: string; fileName: string }[];
};
export type StandaloneReportIndex = { available: boolean; reports: StandaloneReportHeader[] };
export type StandaloneSaveResult = { status: "success"; reportId: string; archivePending?: boolean } | { status: "error"; message: string };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max: number, min = 0): v is string => typeof v === "string" && v.length <= max && v.trim().length >= min && !v.includes("\0");
const uuid = (v: unknown): v is string => typeof v === "string" && uuidPattern.test(v);
const date = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && v >= "0001-01-01" && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;

export function parseStandaloneInput(value: unknown, today: string): StandaloneReportInput | null {
  if (!object(value) || !uuid(value.requestId) || !uuid(value.workId) || !date(value.date) || value.date > today
    || !text(value.title, 120, 1) || !text(value.participants, 5000) || !text(value.subjects, 10000, 1) || !text(value.decisions, 10000)
    || !Array.isArray(value.findingIds) || value.findingIds.length > 30 || !value.findingIds.every(uuid)) return null;
  const findingIds = value.findingIds.map(id => id.toLowerCase());
  if (new Set(findingIds).size !== findingIds.length) return null;
  return { requestId: value.requestId.toLowerCase(), workId: value.workId.toLowerCase(), date: value.date,
    title: value.title.trim(), participants: value.participants.trim(), subjects: value.subjects.trim(), decisions: value.decisions.trim(), findingIds };
}

export function parseStandaloneHeader(value: unknown): StandaloneReportHeader | null {
  if (!object(value) || !uuid(value.id) || !uuid(value.workId) || !uuid(value.auditorId)
    || !["safety", "quality"].includes(String(value.module)) || !date(value.date)
    || !text(value.title, 120, 1) || !text(value.workName, 160, 1) || !text(value.auditorName, 500, 1)
    || typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))) return null;
  return { id: value.id.toLowerCase(), workId: value.workId.toLowerCase(), auditorId: value.auditorId.toLowerCase(),
    module: value.module as StandaloneReportHeader["module"], date: value.date, title: value.title,
    workName: value.workName, auditorName: value.auditorName, updatedAt: value.updatedAt };
}

export function isStandaloneReportIndex(value: unknown): value is StandaloneReportIndex {
  return object(value) && value.available === true && Array.isArray(value.reports)
    && value.reports.every(entry => parseStandaloneHeader(entry) !== null)
    && new Set(value.reports.map(entry => entry.id)).size === value.reports.length;
}

export function parseStandaloneReport(value: unknown): StandaloneReport | null {
  const header = parseStandaloneHeader(value);
  if (!header || !object(value) || !text(value.participants, 5000) || !text(value.subjects, 10000, 1)
    || !text(value.decisions, 10000) || !Array.isArray(value.photos)) return null;
  const findings = parseFindings(value.findings);
  if (!findings || value.photos.length !== findings.length) return null;
  const photos: StandaloneReport["photos"] = [];
  for (const photo of value.photos) {
    if (!object(photo) || !uuid(photo.findingId) || typeof photo.fileName !== "string"
      || parsePhotoFileName(photo.fileName)?.findingId !== photo.findingId
      || !findings.some(finding => finding.id === photo.findingId) || photos.some(p => p.findingId === photo.findingId)) return null;
    photos.push({ findingId: photo.findingId, fileName: photo.fileName });
  }
  return { ...header, participants: value.participants, subjects: value.subjects, decisions: value.decisions, findings, photos };
}

export const standalonePdfHref = (id: string) => `/app/acompanhamento/relatorio/avulso/${id}/pdf`;

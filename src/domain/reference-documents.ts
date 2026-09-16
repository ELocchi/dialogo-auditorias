import type { AuditModelId } from "./operational-records";

type ReferenceDocument = {
  id: AuditModelId;
  catalogName: string;
  title: string;
  pdfFile: string;
  originalFile: string;
  originalName: string;
  originalContentType: string;
};

export const referenceDocuments: Record<AuditModelId, ReferenceDocument> = {
  "security-it07-r02": {
    id: "security-it07-r02",
    catalogName: "Segurança — IT.07 rev. 02",
    title: "IT.07 revisão 02 — Diretrizes de inspeção de segurança",
    pdfFile: "security-it07-r02.pdf",
    originalFile: "security-it07-r02.pdf",
    originalName: "it-07_rev02_diretrizes_de_inspecao_de_seguranca.pdf",
    originalContentType: "application/pdf",
  },
  "quality-f175": {
    id: "quality-f175",
    catalogName: "Farol da Qualidade Simplificado",
    title: "F.175 — Roteiro Farol da Qualidade Simplificado",
    pdfFile: "quality-f175.pdf",
    originalFile: "quality-f175.docx",
    originalName: "F.175 - Roteiro Farol da Qualidade Simplificado.docx",
    originalContentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  "quality-f176": {
    id: "quality-f176",
    catalogName: "Farol da Qualidade Completo",
    title: "F.176 — Roteiro Farol da Qualidade Completo",
    pdfFile: "quality-f176.pdf",
    originalFile: "quality-f176.docx",
    originalName: "F.176 - Roteiro Farol da Qualidade Completo.docx",
    originalContentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
};

export function getReferenceDocument(modelId: string): ReferenceDocument | undefined {
  return Object.hasOwn(referenceDocuments, modelId) ? referenceDocuments[modelId as AuditModelId] : undefined;
}

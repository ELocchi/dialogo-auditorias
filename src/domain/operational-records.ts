export type AuditModelId = "security-it07-r02" | "quality-f175" | "quality-f176";

export interface WorkRecord {
  id: string;
  name: string;
  city: string;
  engineer: string;
  coordinator: string;
  address?: string;
  status: "Ativa" | "Planejada";
  isDemo: boolean;
}

export interface AuditRecord {
  id: string;
  workId: string;
  modelId: AuditModelId;
  /** Data de calendário da auditoria, no formato YYYY-MM-DD. */
  date: string;
  auditor: string;
  auditorId: string;
  status: "Agendada" | "Em preenchimento" | "Em discussão com a obra" | "Publicada";
  visitId?: string;
  collectionStatus: "Em preenchimento" | "Coleta concluída" | "Rascunho";
  calculationStatus: "Aguardando configuração" | "Nota pendente" | "Disponível";
  /** Resultado final disponibilizado pela auditoria; nunca a média dos rascunhos. */
  finalScore: number | null;
  isDemo: boolean;
}

export const auditModelLabels: Record<AuditModelId, { name: string; version: string }> = {
  "security-it07-r02": { name: "Segurança", version: "IT.07 rev. 02" },
  "quality-f175": { name: "Qualidade Simplificada", version: "F.175/00" },
  "quality-f176": { name: "Qualidade Completa", version: "F.176/00" },
};

// Fonte compartilhada dos exemplos já existentes em Obras e Histórico.
// Fixtures locais: o cadastro real persistente é carregado separadamente; auditorias com nota final ainda estão em preparação.
export const workRecords: readonly WorkRecord[] = [
  { id: "horizonte", name: "Residencial Horizonte", city: "Guarulhos, SP", status: "Ativa", engineer: "Eng. Camila Nunes", coordinator: "Diego Martins", isDemo: true },
  { id: "jardim-norte", name: "Jardim Norte", city: "São Paulo, SP", status: "Planejada", engineer: "Não informado", coordinator: "Não informado", isDemo: true },
];

export const auditRecords: readonly AuditRecord[] = [
  { id: "AUD-TESTE-001", workId: "horizonte", modelId: "security-it07-r02", date: "2026-09-10", auditor: "Marina Costa · perfil de teste", auditorId: "auditor-safety", status: "Em preenchimento", collectionStatus: "Em preenchimento", calculationStatus: "Aguardando configuração", finalScore: null, isDemo: true },
  { id: "AUD-TESTE-002", workId: "horizonte", modelId: "quality-f175", date: "2026-09-08", auditor: "Marina Costa · perfil de teste", auditorId: "auditor-quality", status: "Em preenchimento", collectionStatus: "Coleta concluída", calculationStatus: "Nota pendente", finalScore: null, isDemo: true },
];

export function formatAuditDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}


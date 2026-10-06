export type JobKind = "publish-audit" | "publish-plan" | "scheduled-pdf" | "standalone-pdf" | "save-audit";
export type JobStatus = {
  id: string; kind: JobKind; target: string; revision: number;
  status: "queued" | "running" | "succeeded" | "failed";
  stage: string; attempts: number; retryable: boolean; errorCode: string | null;
  createdAt: string; updatedAt: string; result: { url?: string; revision?: number } | null;
};
export type JobReceipt = { job: JobStatus; statusUrl: string };
export const jobLabels: Record<JobKind, string> = {
  "publish-audit": "Publicar auditoria", "publish-plan": "Publicar plano",
  "scheduled-pdf": "Preparar relatório", "standalone-pdf": "Preparar relatório", "save-audit": "Salvar auditoria",
};
export function jobMessage(job: JobStatus) {
  if (job.status === "succeeded") return "Concluído";
  if (job.status === "failed") return job.retryable ? "Falha no processamento. Tente novamente." : "O documento ou acesso mudou. Reabra a tela de origem.";
  if (job.status === "queued") return job.attempts ? "Aguardando nova tentativa…" : "Na fila…";
  return ({ starting: "Iniciando…", evidence: "Processando fotos…", pdf: "Gerando PDF…", storage: "Gravando arquivo…", finalizing: "Concluindo…" })[job.stage] ?? "Processando…";
}

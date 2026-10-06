import "server-only";
import type { ProfileWorkspaceContext } from "@/lib/access/workspace-context";
import { createPublicationClient } from "@/lib/publications/admin";
import { PublicationError } from "@/lib/publications/validation";
import type { JobKind, JobReceipt, JobStatus } from "./contracts";

export function jobService(context: ProfileWorkspaceContext, client = createPublicationClient()) {
  async function request<T>(operation: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await client.rpc("background_job_request", {
      p_actor: context.user.id, p_profile: context.profile, p_scope: context.engineeringScope,
      p_admin: context.administrativeScope, p_operation: operation, ...args,
    });
    if (error) {
      console.error(JSON.stringify({ event: "job_request_failed", operation, code: error.code }));
      const status = error.code === "42501" ? 403 : error.code === "40001" ? 409 : error.code === "54000" ? 429 : 503;
      throw new PublicationError(status === 403 ? "Processamento indisponível para este perfil." : status === 409
        ? "O documento mudou. Reabra a tela antes de continuar." : status === 429 ? "Há muitos arquivos em processamento. Aguarde."
        : "Não foi possível consultar o processamento. Tente novamente.", status);
    }
    return data as T;
  }
  return {
    async enqueue(kind: JobKind, target: string, revision = 0, payload = {}): Promise<JobReceipt> {
      const job = await request<JobStatus>("enqueue", { p_kind: kind, p_target: target, p_revision: revision, p_payload: payload });
      console.info(JSON.stringify({ event: "job_dispatched", jobId: job.id, kind, status: job.status }));
      return { job, statusUrl: `/api/jobs/${job.id}` };
    },
    get: (id: string) => request<JobStatus>("get", { p_id: id }),
    retry: (id: string) => request<JobStatus>("retry", { p_id: id }),
    list: () => request<JobStatus[]>("list"),
  };
}

import { requestSignal } from "../request-signal.ts";
import { jobMessage, type JobReceipt, type JobStatus } from "./contracts.ts";
export function isJobReceipt(value: unknown): value is JobReceipt {
  const data = value as JobReceipt | null;
  return !!data?.job && typeof data.job.id === "string" && /^\/api\/jobs\/[0-9a-f-]{36}$/.test(data.statusUrl)
    && data.statusUrl === `/api/jobs/${data.job.id}`;
}
export async function waitForJob(receipt: JobReceipt, options: {
  signal?: AbortSignal; fetcher?: typeof fetch; onProgress?: (job: JobStatus) => void;
  pause?: (ms: number, signal?: AbortSignal) => Promise<void>; maximumMs?: number;
} = {}): Promise<JobStatus> {
  if (!isJobReceipt(receipt)) throw new Error("Processamento inválido.");
  const fetcher = options.fetcher ?? fetch;
  const pause = options.pause ?? ((ms, signal) => new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal?.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
    if (signal?.aborted) abort(); else signal?.addEventListener("abort", abort, { once: true });
  }));
  const start = Date.now();
  let job = receipt.job, failures = 0;
  while (true) {
    options.signal?.throwIfAborted();
    options.onProgress?.(job);
    if (job.status === "succeeded") return job;
    if (job.status === "failed") throw new Error(`${jobMessage(job)} Consulte Processamentos.`);
    if (Date.now() - start > (options.maximumMs ?? 10 * 60_000)) throw new Error("O trabalho continua em segundo plano. Consulte Processamentos.");
    await pause(failures ? 5000 : 2000, options.signal);
    try {
      const response = await fetcher(receipt.statusUrl, { cache: "no-store", credentials: "same-origin", signal: requestSignal(options.signal, 20_000) });
      if (response.status === 401 || response.status === 403) throw Object.assign(new Error("Seu acesso mudou. Entre novamente."), { terminal: true });
      if (!response.ok) throw new Error("Consulta indisponível");
      const next = await response.json() as JobStatus;
      if (next.id !== job.id || !["queued", "running", "succeeded", "failed"].includes(next.status)) throw new Error("Resposta inválida");
      job = next; failures = 0;
    } catch (error) {
      if (options.signal?.aborted || (error as { terminal?: boolean }).terminal) throw error;
      if (++failures >= 3) throw new Error("Não foi possível consultar o andamento. O trabalho continua salvo em Processamentos.");
    }
  }
}

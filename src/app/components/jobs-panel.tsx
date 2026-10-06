"use client";
import { AsyncSkeleton } from "./async-feedback";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { jobLabels, jobMessage, type JobStatus } from "@/lib/jobs/contracts";
import { requestSignal } from "@/lib/request-signal";
export function JobsPanel() {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobStatus[] | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    const abort = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const response = await fetch("/api/jobs", { cache: "no-store", signal: requestSignal(abort.signal, 20_000) });
        if (!response.ok) throw new Error();
        const data = await response.json() as JobStatus[];
        if (!abort.signal.aborted) { setJobs(data); setError(""); }
      } catch { if (!abort.signal.aborted) setError("Não foi possível consultar. Tente novamente."); }
      if (!abort.signal.aborted) timer = setTimeout(load, 5000);
    }
    void load(); return () => { abort.abort(); clearTimeout(timer); };
  }, [refresh]);
  return <section className="panel" aria-label="Processamentos recentes">
    <h2>Processamentos</h2><p className="muted">Últimos 40 trabalhos deste perfil. Você pode sair e voltar depois.</p>
    {error && <p role="alert">{error} <button className="secondary" onClick={() => setRefresh(n => n + 1)}>Recarregar</button></p>}
    {!jobs && !error && <AsyncSkeleton label="Carregando processamentos…" />}
    {jobs?.length === 0 && <p>Nenhum processamento.</p>}
    <ul style={{ padding: 0, listStyle: "none" }}>{jobs?.map(job => <li key={job.id} id={`job-${job.id}`} tabIndex={-1} style={{ borderBottom: "1px solid #dce2eb", padding: "16px 0" }}>
      <strong>{jobLabels[job.kind]}</strong><p className="muted">{new Date(job.createdAt).toLocaleString("pt-BR")} · {job.id.slice(0, 8)}</p>
      <p role="status">{jobMessage(job)}{job.status === "running" ? ` · Tentativa ${job.attempts}` : ""}</p>
      {job.status === "succeeded" && <button className="secondary" disabled={pending === job.id} onClick={async () => {
        setPending(job.id); setError("");
        try {
          const response = await fetch(`/api/jobs/${job.id}`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
          if (!response.ok) throw new Error();
          const current = await response.json() as JobStatus;
          if (current.result?.url?.startsWith("/") && !current.result.url.startsWith("//")) window.location.assign(current.result.url);
          else if (current.kind === "save-audit" && current.result?.revision != null) router.push("/app?secao=auditorias");
          else setError("Resultado indisponível. Recarregue a lista.");
        } catch { setError("Não foi possível abrir. Confira seu acesso e tente novamente."); }
        finally { setPending(null); }
      }}>{pending === job.id ? "Abrindo…" : job.kind === "save-audit" ? "Abrir auditorias" : "Ver resultado"}</button>}
      {job.status === "failed" && job.retryable && <button className="secondary" disabled={pending === job.id} onClick={async event => {
        const item = event.currentTarget.closest("li");
        setPending(job.id); setError("");
        try {
          const response = await fetch(`/api/jobs/${job.id}`, { method: "POST", signal: AbortSignal.timeout(20_000) });
          if (!response.ok) throw new Error();
          item?.focus(); setRefresh(n => n + 1);
        } catch { setError("Não foi possível tentar novamente."); } finally { setPending(null); }
      }}>{pending === job.id ? "Solicitando…" : "Tentar novamente"}</button>}
    </li>)}</ul>
  </section>;
}

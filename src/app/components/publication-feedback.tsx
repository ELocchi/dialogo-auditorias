import Link from "next/link";
import type { useAuditPublication } from "./use-audit-publication";

export function PublicationFeedback({ publication }: { publication: Pick<ReturnType<typeof useAuditPublication>, "loading" | "loadError" | "error" | "status" | "retryLoad" | "retrySave"> }) {
  return <>
    {publication.loading && <p role="status" className="muted">Carregando auditorias…</p>}
    {publication.loadError && <div role="alert"><p className="error">{publication.loadError}</p><button type="button" className="secondary" onClick={publication.retryLoad}>Tentar novamente</button></div>}
    {publication.error && <div role="alert"><p className="error">{publication.error}</p><button type="button" className="secondary" onClick={publication.retrySave}>Tentar salvar</button></div>}
    {publication.status && publication.status !== "Rascunho recuperado" && <p role="status" className="muted">{publication.status} <Link href="/app/processamentos">Processamentos</Link></p>}
  </>;
}

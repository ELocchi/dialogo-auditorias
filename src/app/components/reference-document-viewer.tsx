"use client";

import { useEffect, useId, useState } from "react";
import type { AuditModelId } from "@/domain/operational-records";
import { referenceDocuments } from "@/domain/reference-documents";
import styles from "./reference-document-viewer.module.css";

export function ReferenceDocumentViewer({ modelId, revisionId, revisionLabel }: { modelId: AuditModelId; revisionId?: string | null; revisionLabel?: string }) {
  const headingId = useId();
  const [preview, setPreview] = useState<{ url?: string; error?: string }>({});
  const document = referenceDocuments[modelId];
  const title = revisionId ? `${document.catalogName.replace(" rev. 02", "")} · ${revisionLabel}` : document.title;
  const endpoint = `/api/reference-documents/${modelId}${revisionId === undefined ? "" : `?revision=${revisionId ?? "bundled"}`}`;

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    let disposed = false;

    async function load() {
      try {
        const response = await fetch(endpoint, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
        if (!response.ok) {
          throw new Error(response.status === 401 || response.status === 403
            ? "Sua sessão ou seu acesso a este documento mudou. Entre novamente ou confira seus acessos."
            : "Não foi possível abrir o documento. Tente novamente.");
        }
        if (!response.headers.get("Content-Type")?.startsWith("application/pdf")) throw new Error("Não foi possível abrir o documento. Tente novamente.");
        const blob = await response.blob();
        if (disposed) return;
        objectUrl = URL.createObjectURL(blob);
        setPreview({ url: objectUrl });
      } catch (error) {
        if (!disposed) setPreview({ error: error instanceof Error ? error.message : "Não foi possível abrir o documento." });
      }
    }
    void load();
    return () => {
      disposed = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [endpoint]);

  return <section id="catalog-reference" className={styles.viewer} aria-labelledby={headingId}>
    <div className={styles.layout}>
      <header className={styles.header}>
        <div><span className={styles.eyebrow}>DOCUMENTO DE REFERÊNCIA</span><h2 id={headingId}>{title}</h2></div>
      </header>
      <div className={styles.preview} aria-busy={!preview.url && !preview.error}>
        {preview.url ? <iframe className={styles.frame} src={`${preview.url}#view=FitH`} title={title} />
          : <p className={styles.message} role={preview.error ? "alert" : "status"}>{preview.error ?? "Carregando documento…"}</p>}
      </div>
      <footer className={styles.footer}>
        <a className="secondary" href={endpoint} target="_blank" rel="noopener noreferrer">Abrir em nova aba</a>
        <a className="primary" href={`${endpoint}${endpoint.includes("?") ? "&" : "?"}download=original`} download>Baixar original</a>
      </footer>
    </div>
  </section>;
}

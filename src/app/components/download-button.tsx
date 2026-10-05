"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useHydrated } from "./use-hydrated";
import { requestSignal } from "@/lib/request-signal";

export function DownloadButton({ href, label, className, children }: { href: string; label: string; className?: string; children: ReactNode }) {
  const hydrated = useHydrated();
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const download = async () => {
    if (controller.current) return;
    const request = new AbortController(); controller.current = request; setStatus("loading");
    try {
      const response = await fetch(href, { credentials: "same-origin", cache: "no-store", signal: requestSignal(request.signal, 90_000) });
      if (!response.ok) throw new Error("Download unavailable");
      const blob = await response.blob();
      if (await blob.slice(0, 5).text() !== "%PDF-") throw new Error("Invalid PDF");
      if (request.signal.aborted) return;
      const fileName = response.headers.get("content-disposition")?.match(/filename="([^"/\\]+)"/i)?.[1] ?? "Roteiro.pdf";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = fileName;
      document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setStatus("success");
    } catch { if (!request.signal.aborted) setStatus("error"); }
    finally { if (controller.current === request) controller.current = null; }
  };
  return <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 4, maxWidth: "100%" }}>
    <button type="button" className={className} aria-label={label} data-tooltip={status === "error" ? "Tentar baixar" : "Baixar PDF"} disabled={!hydrated || status === "loading"} onClick={() => { void download(); }}>{children}</button>
    {status !== "idle" && <small role={status === "error" ? "alert" : "status"} style={{ maxWidth: 180, textAlign: "center" }}>{status === "loading" ? "Baixando…" : status === "error" ? "Falha no download. Clique para tentar novamente." : "Download iniciado"}</small>}
  </span>;
}

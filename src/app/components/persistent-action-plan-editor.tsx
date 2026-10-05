"use client";

import { BackButton, BackHeading } from "@/app/components/back-control";

import { useCallback, useEffect, useRef, useState } from "react";
import { ActionPlanEditor } from "./action-plan-editor";
import { publicationFetch, publicationJson, publicationQuery } from "./use-audit-publication";
import type { AgendaActorContext } from "@/lib/agenda/contracts";
import type { ActionPlanRow } from "@/lib/pdf/types";
import type { AppModule } from "@/domain/prototype-access";

type Plan = { published: boolean; rows?: ActionPlanRow[]; revision?: number; url?: string; metadata?: { workName: string; auditDate: string; auditScore: number; authorName: string; module: AppModule } };
export function PersistentActionPlanEditor({ auditId, actor, onPublished, ...props }: {
  auditId: string; actor: AgendaActorContext; workName: string; auditDate: string; auditScore: number | null;
  module: AppModule; authorName: string; onBack: () => void; onPublished: () => void;
}) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const current = useRef({ revision: 0, saved: "" });
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const query = publicationQuery(actor);
  useEffect(() => {
    const controller = new AbortController();
    void publicationFetch<Plan>(`/api/publications/${auditId}/plan?${query}`, { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return;
      current.current = { revision: data.revision ?? 0, saved: JSON.stringify(data.rows) };
      setPlan(data); setError("");
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Não foi possível carregar o plano."); });
    return () => controller.abort();
  }, [auditId, query, retry]);
  const save = useCallback((rows: readonly ActionPlanRow[]) => {
    const task = queue.current.catch(() => undefined).then(async () => {
      const key = JSON.stringify(rows);
      if (key === current.current.saved) return;
      const data = await publicationFetch<{ revision: number }>(`/api/publications/${auditId}/save-plan?${query}`,
        publicationJson({ revision: current.current.revision, rows }));
      current.current = { revision: data.revision, saved: key };
    });
    queue.current = task; return task;
  }, [auditId, query]);
  if (!plan) return <section className="panel">{error ? <><p role="alert">{error}</p><button className="secondary" onClick={() => setRetry(v => v + 1)}>Recarregar plano de ação</button></> : <p>Carregando plano de ação…</p>}</section>;
  if (plan.published) return <section className="panel"><BackHeading><BackButton label={props.module === "quality" ? "Voltar à Qualidade" : "Voltar à Segurança"} onClick={props.onBack} /><h2>Plano de ação publicado</h2></BackHeading><a className="primary" href={`/api/publications/${auditId}/plan-report?${query}`} target="_blank" rel="noreferrer">Abrir PDF publicado</a></section>;
  return <ActionPlanEditor {...props} {...plan.metadata} findings={plan.rows ?? []} draft={plan.rows} example={false} autosave onSave={save}
    onPublish={async () => {
      await queue.current;
      await publicationFetch(`/api/publications/${auditId}/publish-plan?${query}`, publicationJson({ revision: current.current.revision }));
      onPublished(); setPlan({ published: true });
    }} />;
}

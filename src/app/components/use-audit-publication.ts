"use client";
import { requestSignal } from "@/lib/request-signal";
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { SafetyClosure } from "@/domain/safety-audit";
import type { PrototypeAuditState } from "@/domain/prototype-audits";
import type { AuditDrafts } from "@/domain/audit-draft";
import type { Visit } from "@/domain/prototype-access";
import type { AgendaActorContext } from "@/lib/agenda/contracts";
import type { PersistedAudit, PublicationIndex } from "@/lib/publications/contracts";
import { auditPhotoReferences, createAuditPhotoStore } from "@/lib/audits/photo-store";

export function publicationQuery(actor: AgendaActorContext) {
  return new URLSearchParams({ usuario: actor.userId, perfil: actor.profile,
    atuacao: actor.engineeringScope ?? "", administrativo: actor.administrativeScope ?? "" }).toString();
}
export async function publicationFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const reading = !init?.method || init.method === "GET";
  try {
    const response = await fetch(url, { ...init, credentials: "same-origin", cache: "no-store", signal: requestSignal(init?.signal, reading ? 20_000 : 90_000) });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) throw new Error(data?.message || (reading ? "Não foi possível carregar os dados. Tente novamente." : "Não foi possível confirmar o salvamento. Seus dados continuam nesta tela."));
    return data as T;
  } catch (reason) {
    if (init?.signal?.aborted) throw reason;
    if (reason instanceof Error && (reason.name === "TimeoutError" || reason.name === "TypeError")) {
      throw new Error(reading ? "A consulta demorou ou a conexão falhou. Tente novamente." : "Sem confirmação do servidor. Seus dados continuam nesta tela. Tente salvar novamente; se houver conflito, confira a versão salva.");
    }
    throw reason;
  }
}
export const publicationJson = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export function useAuditPublication(actor: AgendaActorContext, session: PrototypeAuditState,
  setSession: Dispatch<SetStateAction<PrototypeAuditState>>, month?: string, enabled = true) {
  const [photoStore] = useState(() => createAuditPhotoStore());
  const [plans, setPlans] = useState<PublicationIndex["plans"]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; error: string } | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const failed = useRef(new Map<string, string>());
  const [draftVersions, setDraftVersions] = useState<Record<string, PersistedAudit>>({});
  const meta = useRef(new Map<string, { revision: number; saved: string; files: Map<string, File> }>());
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const query = publicationQuery(actor);
  const listQuery = `${query}${month ? `&mes=${month}` : ""}`;
  const loadKey = `${listQuery}:${loadAttempt}`;
  const accept = useCallback((data: PersistedAudit) => {
    meta.current.set(data.audit.id, { revision: data.revision, saved: JSON.stringify([data.responses, data.safetyClosure ?? null]), files: new Map() });
    setDraftVersions(current => ({ ...current, [data.audit.id]: data }));
    setSession(current => ({ ...current, audits: [...current.audits.filter(a => a.id !== data.audit.id), data.audit],
      responses: { ...current.responses, [data.audit.id]: data.responses },
      safetyClosures: data.safetyClosure ? { ...current.safetyClosures, [data.audit.id]: data.safetyClosure } : current.safetyClosures,
      criteriaSnapshots: { ...current.criteriaSnapshots, [data.audit.id]: data.criteria } }));
  }, [setSession]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void publicationFetch<PublicationIndex>(`/api/publications?${listQuery}`, { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return;
      data.drafts.forEach(draft => { if (!meta.current.has(draft.audit.id)) accept(draft); });
      setPlans(data.plans);
      setLoaded({ key: loadKey, error: "" });
    }).catch(reason => { if (!controller.signal.aborted) setLoaded({ key: loadKey, error: reason instanceof Error ? reason.message : "Não foi possível recuperar os rascunhos." }); });
    return () => controller.abort();
  }, [listQuery, accept, loadKey, enabled]);
  const save = useCallback((id: string, responses: AuditDrafts, safetyClosure?: SafetyClosure, automatic = false) => {
    const task = queue.current.catch(() => undefined).then(async () => {
      const current = meta.current.get(id);
      if (!current) throw new Error("Reabra a auditoria para recuperar o rascunho.");
      const key = JSON.stringify([responses, safetyClosure ?? null]);
      if (current.saved === key || (automatic && failed.current.get(id) === key)) return current.revision;
      setStatus("Salvando rascunho…"); setError("");
      const form = new FormData();
      form.set("revision", String(current.revision)); form.set("responses", JSON.stringify(responses)); form.set("safetyClosure", JSON.stringify(safetyClosure ?? null));
      const files = [...auditPhotoReferences([responses])].flatMap(ref => {
        const file = photoStore.get(ref);
        return file && !ref.startsWith("/api/publications/") && current.files.get(ref) !== file ? [{ ref, file }] : [];
      });
      form.set("photoRefs", JSON.stringify(files.map(f => f.ref)));
      files.forEach(({ file }, i) => form.set(`photo${i}`, file));
      if (files.length) setStatus("Enviando fotos e salvando…");
      try {
        const result = await publicationFetch<{ revision: number }>(`/api/publications/${id}/save-audit?${query}`, { method: "POST", body: form });
        current.revision = result.revision; current.saved = key; failed.current.delete(id);
        files.forEach(({ ref, file }) => current.files.set(ref, file));
        setStatus("Rascunho salvo"); return result.revision;
      } catch (reason) { failed.current.set(id, key); setStatus(""); setError(reason instanceof Error ? reason.message : "Falha ao salvar."); throw reason; }
    });
    queue.current = task; return task;
  }, [photoStore, query]);
  useEffect(() => {
    const dirty = session.audits.filter(a => !a.isDemo && a.status !== "Publicada" && meta.current.has(a.id)
      && meta.current.get(a.id)!.saved !== JSON.stringify([session.responses[a.id] ?? {}, session.safetyClosures?.[a.id] ?? null]));
    if (!dirty.length) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    const timer = window.setTimeout(() => {
      dirty.filter(a => failed.current.get(a.id) !== JSON.stringify([session.responses[a.id] ?? {}, session.safetyClosures?.[a.id] ?? null])).forEach(a => { void save(a.id, session.responses[a.id] ?? {}, session.safetyClosures?.[a.id], true).catch(() => undefined); });
    }, 1000);
    return () => { window.clearTimeout(timer); window.removeEventListener("beforeunload", warn); };
  }, [session, save, status, retryAttempt]);
  return { photoStore, plans, status, error, draftVersions, save,
    loading: enabled && loaded?.key !== loadKey,
    loadError: enabled && loaded?.key === loadKey ? loaded.error : "",
    retryLoad: () => setLoadAttempt(value => value + 1),
    retrySave: () => { failed.current.clear(); setError(""); setStatus("Salvando rascunho…"); setRetryAttempt(value => value + 1); },
    async start(visit: Visit) {
      const data = await publicationFetch<PersistedAudit>(`/api/publications?${query}`, publicationJson({ visitId: visit.id, modelId: visit.modelId }));
      accept(data); setError(""); setStatus("Rascunho recuperado"); return data.audit.id;
    },
    async publish(id: string, responses: AuditDrafts, safetyClosure?: SafetyClosure) {
      const revision = await save(id, responses, safetyClosure);
      const data = await publicationFetch<PersistedAudit>(`/api/publications/${id}/publish-audit?${query}`, publicationJson({ revision }));
      accept(data); setStatus("Auditoria publicada"); setError(""); return data.audit;
    },
    planPublished(auditId: string, workId: string, module: "quality" | "safety") {
      setPlans(current => [...current.filter(p => p.auditId !== auditId), { auditId, workId, module }]);
    },
  };
}

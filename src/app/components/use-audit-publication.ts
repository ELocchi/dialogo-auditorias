"use client";
import { isJobReceipt, waitForJob } from "@/lib/jobs/client";
import { jobMessage } from "@/lib/jobs/contracts";
import { requestSignal } from "@/lib/request-signal";
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { SafetyClosure } from "@/domain/safety-audit";
import type { PrototypeAuditState } from "@/domain/prototype-audits";
import type { AuditDrafts } from "@/domain/audit-draft";
import type { Visit } from "@/domain/prototype-access";
import type { AgendaActorContext } from "@/lib/agenda/contracts";
import type { PersistedAudit, PublicationIndex } from "@/lib/publications/contracts";
import { auditPhotoReferences, createAuditPhotoStore } from "@/lib/audits/photo-store";
import {
  clearDeviceAuditDraft,
  clearDeviceAuditPhotos,
  clearDeviceAuditPosition,
  draftContentKey,
  persistDeviceAuditPhotos,
  readDeviceAuditDraft,
  readDeviceAuditPosition,
  reconcileDeviceAuditDraft,
  restoreDeviceAuditPhotos,
  writeDeviceAuditDraft,
  writeDeviceAuditPosition,
  type DeviceAuditDraft,
} from "@/lib/audits/device-draft";

export type DraftPersistenceFeedback = "saving" | "device" | "server" | "error";

export function publicationQuery(actor: AgendaActorContext) {
  return new URLSearchParams({ usuario: actor.userId, perfil: actor.profile,
    atuacao: actor.engineeringScope ?? "", administrativo: actor.administrativeScope ?? "" }).toString();
}
export async function publicationFetch<T>(url: string, init?: RequestInit, onProgress?: (message: string) => void): Promise<T> {
  const reading = !init?.method || init.method === "GET";
  try {
    const response = await fetch(url, { ...init, credentials: "same-origin", cache: "no-store", signal: requestSignal(init?.signal, reading ? 20_000 : 90_000) });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) throw Object.assign(new Error(data?.message || (reading ? "Não foi possível carregar os dados. Tente novamente." : "Não foi possível confirmar o salvamento. Seus dados continuam nesta tela.")), { status: response.status });
    if (response.status === 202 && isJobReceipt(data)) {
      const completed = await waitForJob(data, { signal: init?.signal ?? undefined, onProgress: job => onProgress?.(jobMessage(job)) });
      return completed.result as T;
    }
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
  const [draftFeedback, setDraftFeedback] = useState<Record<string, DraftPersistenceFeedback>>({});
  const deviceWriteGeneration = useRef(new Map<string, number>());
  const deviceSavedContent = useRef(new Map<string, string>());
  const deviceQueue = useRef<Promise<unknown>>(Promise.resolve());
  const failed = useRef(new Map<string, string>());
  // A 409 means the server revision moved on; autosave stops until the audit is reopened or retried.
  const conflicted = useRef(new Set<string>());
  const [draftVersions, setDraftVersions] = useState<Record<string, PersistedAudit>>({});
  const meta = useRef(new Map<string, { revision: number; saved: string; files: Map<string, File> }>());
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const query = publicationQuery(actor);
  const listQuery = `${query}${month ? `&mes=${month}` : ""}`;
  const loadKey = `${listQuery}:${loadAttempt}`;
  const accept = useCallback((data: PersistedAudit) => {
    const serverKey = draftContentKey(data.responses, data.safetyClosure);
    const reconciliation = typeof window === "undefined" ? null
      : reconcileDeviceAuditDraft({ actorId: actor.userId, auditId: data.audit.id, workId: data.audit.workId,
        modelId: data.audit.modelId, revision: data.revision, responses: data.responses,
        criteria: data.criteria, safetyClosure: data.safetyClosure }, readDeviceAuditDraft(window.localStorage, actor.userId, data.audit.id));
    const local = reconciliation?.draft ?? null;
    const recovered = local && local.contentKey !== serverKey ? local : null;
    const accepted = recovered ? { ...data, responses: recovered.responses, safetyClosure: recovered.safetyClosure } : data;
    meta.current.set(data.audit.id, { revision: data.revision, saved: serverKey, files: new Map() });
    conflicted.current.delete(data.audit.id);
    setDraftVersions(current => ({ ...current, [data.audit.id]: accepted }));
    setSession(current => ({ ...current, audits: [...current.audits.filter(a => a.id !== data.audit.id), data.audit],
      responses: { ...current.responses, [data.audit.id]: accepted.responses },
      safetyClosures: (() => { const closures = { ...current.safetyClosures }; if (accepted.safetyClosure) closures[data.audit.id] = accepted.safetyClosure; else delete closures[data.audit.id]; return closures; })(),
      criteriaSnapshots: { ...current.criteriaSnapshots, [data.audit.id]: data.criteria } }));
    if (recovered) {
      if (reconciliation?.repaired && typeof window !== "undefined") writeDeviceAuditDraft(window.localStorage, recovered);
      setDraftFeedback(current => ({ ...current, [data.audit.id]: "saving" }));
      void restoreDeviceAuditPhotos(actor.userId, data.audit.id).then((photos) => {
        photos.forEach(({ reference, file }) => photoStore.restore(reference, file));
        const restored = new Set(photos.map(({ reference }) => reference));
        const pending = [...auditPhotoReferences([recovered.responses])]
          .filter(reference => !reference.startsWith("/api/publications/"));
        if (pending.every(reference => restored.has(reference))) {
          deviceSavedContent.current.set(data.audit.id, recovered.contentKey);
          setDraftFeedback(current => ({ ...current, [data.audit.id]: "device" }));
        } else {
          deviceSavedContent.current.delete(data.audit.id);
          setStatus("Erro ao salvar");
          setError("O rascunho foi recuperado, mas uma ou mais fotos locais não estavam disponíveis. Revise as evidências antes de continuar.");
          setDraftFeedback(current => ({ ...current, [data.audit.id]: "error" }));
        }
      });
    } else if (typeof window !== "undefined") {
      deviceSavedContent.current.delete(data.audit.id);
      clearDeviceAuditDraft(window.localStorage, actor.userId, data.audit.id);
      void clearDeviceAuditPhotos(actor.userId, data.audit.id);
      setDraftFeedback(current => ({ ...current, [data.audit.id]: "server" }));
    }
  }, [actor.userId, photoStore, setSession]);
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
      const key = draftContentKey(responses, safetyClosure);
      if (current.saved === key || (automatic && (failed.current.get(id) === key || conflicted.current.has(id)))) return current.revision;
      setStatus("Salvando..."); setError(""); setDraftFeedback(value => ({ ...value, [id]: "saving" }));
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
        const result = await publicationFetch<{ revision: number }>(`/api/publications/${id}/save-audit?${query}`, { method: "POST", body: form }, setStatus);
        current.revision = result.revision; current.saved = key; failed.current.delete(id);
        files.forEach(({ ref, file }) => current.files.set(ref, file));
        if (typeof window !== "undefined") {
          const local = readDeviceAuditDraft(window.localStorage, actor.userId, id);
          if (local?.contentKey === key) {
            deviceSavedContent.current.delete(id);
            clearDeviceAuditDraft(window.localStorage, actor.userId, id);
            void clearDeviceAuditPhotos(actor.userId, id);
          } else if (local) writeDeviceAuditDraft(window.localStorage, { ...local, serverRevision: result.revision });
        }
        setStatus("Rascunho salvo"); setDraftFeedback(value => ({ ...value, [id]: "server" })); return result.revision;
      } catch (reason) {
        failed.current.set(id, key); if ((reason as { status?: number }).status === 409) conflicted.current.add(id); setStatus("Erro ao salvar"); setDraftFeedback(value => ({ ...value, [id]: "error" }));
        const keptOnDevice = deviceSavedContent.current.get(id) === key;
        setError(`${reason instanceof Error ? reason.message : "Falha ao salvar."}${keptOnDevice ? " O rascunho permanece neste dispositivo." : " Mantenha esta página aberta e tente novamente."}`); throw reason;
      }
    });
    queue.current = task; return task;
  }, [actor.userId, photoStore, query]);
  useEffect(() => {
    const dirty = session.audits.filter(a => !a.isDemo && a.status !== "Publicada" && meta.current.has(a.id)
      && meta.current.get(a.id)!.saved !== draftContentKey(session.responses[a.id] ?? {}, session.safetyClosures?.[a.id]));
    if (!dirty.length) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    dirty.forEach((audit) => {
      const responses = session.responses[audit.id] ?? {};
      const safetyClosure = session.safetyClosures?.[audit.id];
      const contentKey = draftContentKey(responses, safetyClosure);
      const generation = (deviceWriteGeneration.current.get(audit.id) ?? 0) + 1;
      deviceWriteGeneration.current.set(audit.id, generation);
      deviceSavedContent.current.delete(audit.id);
      setDraftFeedback(value => ({ ...value, [audit.id]: "saving" }));
      const snapshot: DeviceAuditDraft = { version: 1, actorId: actor.userId, auditId: audit.id,
        workId: audit.workId, modelId: audit.modelId, serverRevision: meta.current.get(audit.id)!.revision,
        updatedAt: new Date().toISOString(), contentKey, responses, ...(safetyClosure ? { safetyClosure } : {}) };
      const stored = writeDeviceAuditDraft(window.localStorage, snapshot);
      const references = auditPhotoReferences([responses]);
      const photos = photoStore.entries().filter(({ reference }) => references.has(reference));
      const photoWrite = deviceQueue.current.catch(() => undefined)
        .then(() => persistDeviceAuditPhotos(actor.userId, audit.id, photos));
      deviceQueue.current = photoWrite;
      void photoWrite.then((photosStored) => {
        if (deviceWriteGeneration.current.get(audit.id) !== generation) return;
        if (stored && photosStored && meta.current.get(audit.id)?.saved !== contentKey) {
          deviceSavedContent.current.set(audit.id, contentKey);
          setStatus("Rascunho salvo no dispositivo; aguardando confirmação do servidor.");
          setDraftFeedback(value => ({ ...value, [audit.id]: "device" }));
        } else {
          deviceSavedContent.current.delete(audit.id);
        }
      });
    });
    const timer = window.setTimeout(() => {
      dirty.filter(a => failed.current.get(a.id) !== draftContentKey(session.responses[a.id] ?? {}, session.safetyClosures?.[a.id])).forEach(a => { void save(a.id, session.responses[a.id] ?? {}, session.safetyClosures?.[a.id], true).catch(() => undefined); });
    }, 1000);
    return () => { window.clearTimeout(timer); window.removeEventListener("beforeunload", warn); };
  }, [actor.userId, photoStore, retryAttempt, save, session]);
  return { photoStore, plans, status, error, draftVersions, draftFeedback, save,
    loading: enabled && loaded?.key !== loadKey,
    loadError: enabled && loaded?.key === loadKey ? loaded.error : "",
    retryLoad: () => setLoadAttempt(value => value + 1),
    retrySave: () => { failed.current.clear(); conflicted.current.clear(); setError(""); setStatus("Salvando..."); setRetryAttempt(value => value + 1); },
    rememberedPosition: (id: string) => typeof window === "undefined" ? null : readDeviceAuditPosition(window.localStorage, actor.userId, id),
    rememberPosition: (id: string, position: number) => { if (typeof window !== "undefined") writeDeviceAuditPosition(window.localStorage, actor.userId, id, position); },
    async start(visit: Visit) {
      const data = await publicationFetch<PersistedAudit>(`/api/publications?${query}`, publicationJson({ visitId: visit.id, modelId: visit.modelId }));
      accept(data); setError(""); setStatus("Rascunho recuperado"); return data.audit.id;
    },
    async publish(id: string, responses: AuditDrafts, safetyClosure?: SafetyClosure) {
      const revision = await save(id, responses, safetyClosure);
      setStatus("Solicitando publicação…");
      await publicationFetch(`/api/publications/${id}/publish-audit?${query}`, publicationJson({ revision }), setStatus);
      const data = await publicationFetch<PersistedAudit>(`/api/publications/${id}/audit?${query}`);
      if (typeof window !== "undefined") {
        deviceSavedContent.current.delete(id);
        clearDeviceAuditDraft(window.localStorage, actor.userId, id);
        clearDeviceAuditPosition(window.localStorage, actor.userId, id);
        void clearDeviceAuditPhotos(actor.userId, id);
      }
      accept(data); setStatus("Auditoria publicada"); setError(""); return data.audit;
    },
    planPublished(auditId: string, workId: string, module: "quality" | "safety") {
      setPlans(current => [...current.filter(p => p.auditId !== auditId), { auditId, workId, module }]);
    },
  };
}

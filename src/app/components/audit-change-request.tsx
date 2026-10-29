"use client";

import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import type { AgendaActorContext } from "@/lib/agenda/contracts";
import {
  auditChangeNotices, auditChangeStatusLabels, changeNoteLimit, changeReasonLimits, parseAuditChangeRequest,
  type AuditChangeEditableItem, type AuditChangeItem, type AuditChangeNotice, type AuditChangeRequest,
} from "@/domain/audit-change";
import { publicationQuery } from "./use-audit-publication";
import styles from "./audit-change-request.module.css";

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const formatMoment = (value: string | null) => {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? dateTime.format(parsed) : "";
};

async function changeFetch<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, credentials: "same-origin", cache: "no-store",
      ...(init?.body ? { headers: { "Content-Type": "application/json" } } : {}) });
  } catch { throw new Error("Sem conexão com o servidor. Tente novamente."); }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(typeof data?.message === "string" ? data.message : "Não foi possível concluir. Tente novamente.");
  return data as T;
}

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

/** Latest request per audit shown in the published audit cards. */
export function useAuditChangeRequests(actor: AgendaActorContext | null, auditIds: readonly string[]) {
  const key = auditIds.slice().sort().join(",");
  const [state, setState] = useState<{ key: string; requests: AuditChangeRequest[]; error: boolean }>({ key: "", requests: [], error: false });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!actor || !key) return;
    let active = true;
    const query = `${publicationQuery(actor)}&ids=${encodeURIComponent(key)}`;
    changeFetch<{ requests: unknown[] }>(`/api/audits/change-requests?${query}`)
      .then((data) => { if (active) setState({ key, requests: data.requests.flatMap((raw) => parseAuditChangeRequest(raw) ?? []), error: false }); })
      .catch(() => { if (active) setState({ key, requests: [], error: true }); });
    return () => { active = false; };
  }, [actor, key, attempt]);
  const latest = new Map<string, AuditChangeRequest>();
  if (state.key === key) for (const request of state.requests) if (!latest.has(request.auditId)) latest.set(request.auditId, request);
  return { latest, error: state.key === key && state.error, reload: useCallback(() => setAttempt((value) => value + 1), []) };
}

/** Bell notices for change requests. Refreshes when the bell opens and every minute while the tab is visible. */
export function useAuditChangeNotices(actor: AgendaActorContext | null, bellOpen: boolean): AuditChangeNotice[] {
  const [notices, setNotices] = useState<{ key: string; items: AuditChangeNotice[] }>({ key: "", items: [] });
  const relevant = actor && (actor.profile === "ADMINISTRATIVO" || actor.profile === "AUDITOR_SEGURANCA" || actor.profile === "AUDITOR_QUALIDADE") ? actor : null;
  const key = relevant ? publicationQuery(relevant) : "";
  useEffect(() => {
    if (!relevant) return;
    let active = true;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      changeFetch<{ requests: unknown[] }>(`/api/audits/change-requests?${key}`)
        .then((data) => { if (active) setNotices({ key, items: auditChangeNotices(data.requests.flatMap((raw) => parseAuditChangeRequest(raw) ?? []), relevant.profile === "ADMINISTRATIVO") }); })
        .catch(() => { /* A falha não esconde as notificações da agenda; a próxima consulta tenta de novo. */ });
    };
    load();
    const timer = window.setInterval(load, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [relevant, key, bellOpen]);
  return notices.key === key ? notices.items : [];
}

function RequestSummary({ request, actor }: { request: AuditChangeRequest; actor: AgendaActorContext }) {
  const previousPdf = request.status === "republished" && request.previousContentRevision !== null
    ? `/api/audits/${request.auditId}/report?${publicationQuery(actor)}&versao=${request.previousContentRevision}` : null;
  return <div className={styles.summary}>
    <p className={styles.status} data-status={request.status}>{auditChangeStatusLabels[request.status]}</p>
    <dl className={styles.facts}>
      <div><dt>Item</dt><dd>{request.criterionCode} · {request.criterionTitle}</dd></div>
      <div><dt>Motivo</dt><dd>{request.reason}</dd></div>
      <div><dt>Pedido por</dt><dd>{request.requestedBy} · {formatMoment(request.requestedAt)}</dd></div>
      {request.decidedBy && <div><dt>{request.status === "refused" ? "Recusado por" : "Aceito por"}</dt><dd>{request.decidedBy} · {formatMoment(request.decidedAt)}</dd></div>}
      {request.refusalReason && <div><dt>Motivo da recusa</dt><dd>{request.refusalReason}</dd></div>}
      {request.republishedBy && <div><dt>Publicada novamente por</dt><dd>{request.republishedBy} · {formatMoment(request.republishedAt)}</dd></div>}
    </dl>
    {previousPdf && <a className={styles.link} href={previousPdf} target="_blank" rel="noopener noreferrer">Abrir PDF anterior</a>}
  </div>;
}

/** Owner auditor: shows the latest request and opens a new one when none is open. */
export function AuditorChangeRequest({ auditId, workName, actor, request, onChanged }: {
  auditId: string; workName: string; actor: AgendaActorContext; request?: AuditChangeRequest; onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AuditChangeItem[] | null>(null);
  const [criterionId, setCriterionId] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const formId = useId();
  const openRequest = request && (request.status === "pending" || request.status === "accepted");

  const start = () => {
    setOpen(true); setError("");
    if (items) return;
    changeFetch<{ items: AuditChangeItem[] }>(`/api/audits/${auditId}/change-requests?${publicationQuery(actor)}`)
      .then((data) => setItems(data.items)).catch((reason: Error) => setError(reason.message));
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!criterionId) { setError("Escolha o item."); return; }
    if (reason.trim().length < changeReasonLimits.min) { setError("Descreva o motivo com pelo menos 5 caracteres."); return; }
    setPending(true); setError("");
    try {
      await changeFetch(`/api/audits/${auditId}/change-requests?${publicationQuery(actor)}`, post({ criterionId, reason }));
      setOpen(false); setReason(""); setCriterionId(""); onChanged();
    } catch (reason) { setError((reason as Error).message); } finally { setPending(false); }
  };

  return <div className={styles.block}>
    {request && <RequestSummary request={request} actor={actor} />}
    {!openRequest && !open && <button type="button" className="secondary" onClick={start}
      aria-label={`Solicitar alteração da auditoria: ${workName}`}>Solicitar alteração</button>}
    {open && <form className={styles.form} onSubmit={submit} aria-labelledby={`${formId}-title`}>
      <h5 id={`${formId}-title`}>Solicitar alteração</h5>
      <label htmlFor={`${formId}-item`}>Item</label>
      <select id={`${formId}-item`} className="filter-select" value={criterionId} disabled={!items || pending} onChange={(event) => setCriterionId(event.target.value)}>
        <option value="">{items ? "Selecione o item" : "Carregando itens…"}</option>
        {items?.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.title}</option>)}
      </select>
      <label htmlFor={`${formId}-reason`}>Motivo</label>
      <textarea id={`${formId}-reason`} value={reason} maxLength={changeReasonLimits.max} rows={3} disabled={pending}
        onChange={(event) => setReason(event.target.value)} placeholder="Descreva o que precisa ser alterado e por quê." />
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <button type="button" className="secondary" disabled={pending} onClick={() => { setOpen(false); setError(""); }}>Cancelar</button>
        <button type="submit" className="primary" disabled={pending}>{pending ? "Enviando…" : "Enviar chamado"}</button>
      </div>
    </form>}
  </div>;
}

/** Administrativo: decide a pending request; after accepting, edit the item observations and republish. */
export function AdminChangeRequest({ request, actor, onChanged }: { request: AuditChangeRequest; actor: AgendaActorContext; onChanged: () => void }) {
  const [refusing, setRefusing] = useState(false);
  const [refusal, setRefusal] = useState("");
  const [editor, setEditor] = useState<AuditChangeEditableItem | null>(null);
  const [note, setNote] = useState("");
  const [checkNotes, setCheckNotes] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const formId = useId();
  const url = `/api/audits/change-requests/${request.id}?${publicationQuery(actor)}`;

  const run = async (body: unknown, done: string) => {
    setPending(true); setError(""); setStatus("");
    try { await changeFetch(url, post(body)); setStatus(done); setRefusing(false); setEditor(null); onChanged(); }
    catch (reason) { setError((reason as Error).message); } finally { setPending(false); }
  };
  const loadEditor = () => {
    setPending(true); setError("");
    changeFetch<{ item: AuditChangeEditableItem }>(url)
      .then((data) => { setEditor(data.item); setNote(data.item.note); setCheckNotes(Object.fromEntries(data.item.checks.map((check) => [check.id, check.note]))); })
      .catch((reason: Error) => setError(reason.message)).finally(() => setPending(false));
  };

  return <div className={styles.block}>
    <RequestSummary request={request} actor={actor} />
    {request.status === "pending" && !refusing && <div className={styles.actions}>
      <button type="button" className="secondary" disabled={pending} onClick={() => setRefusing(true)}>Recusar</button>
      <button type="button" className="primary" disabled={pending} onClick={() => run({ action: "decide", revision: request.revision, accept: true }, "Chamado aceito. Edite a observação e publique novamente.")}>Aceitar</button>
    </div>}
    {request.status === "pending" && refusing && <form className={styles.form} onSubmit={(event) => {
      event.preventDefault();
      if (refusal.trim().length < changeReasonLimits.min) { setError("Informe o motivo da recusa com pelo menos 5 caracteres."); return; }
      void run({ action: "decide", revision: request.revision, accept: false, refusalReason: refusal }, "Chamado recusado.");
    }}>
      <label htmlFor={`${formId}-refusal`}>Motivo da recusa</label>
      <textarea id={`${formId}-refusal`} rows={3} maxLength={changeReasonLimits.max} value={refusal} disabled={pending} onChange={(event) => setRefusal(event.target.value)} />
      <div className={styles.actions}>
        <button type="button" className="secondary" disabled={pending} onClick={() => { setRefusing(false); setError(""); }}>Voltar</button>
        <button type="submit" className="primary" disabled={pending}>{pending ? "Enviando…" : "Confirmar recusa"}</button>
      </div>
    </form>}
    {request.status === "accepted" && !editor && <div className={styles.actions}>
      <button type="button" className="primary" disabled={pending} onClick={loadEditor}>{pending ? "Carregando…" : "Editar observação"}</button>
    </div>}
    {request.status === "accepted" && editor && <form className={styles.form} aria-labelledby={`${formId}-edit`} onSubmit={(event) => {
      event.preventDefault();
      void run({ action: "republish", revision: request.revision, note, checkNotes }, "Auditoria publicada novamente com o novo PDF.");
    }}>
      <h5 id={`${formId}-edit`}>{editor.code} · {editor.title}</h5>
      <p className={styles.hint}>Somente as observações deste item mudam. Respostas, notas e fotos continuam iguais; o PDF anterior fica no histórico.</p>
      <label htmlFor={`${formId}-note`}>Observação do item</label>
      <textarea id={`${formId}-note`} rows={3} maxLength={changeNoteLimit} value={note} disabled={pending} onChange={(event) => setNote(event.target.value)} />
      {editor.checks.map((check, index) => <div key={check.id} className={styles.check}>
        <label htmlFor={`${formId}-check-${index}`}>{String(index + 1).padStart(2, "0")}. {check.label}</label>
        <textarea id={`${formId}-check-${index}`} rows={2} maxLength={changeNoteLimit} value={checkNotes[check.id] ?? ""} disabled={pending}
          onChange={(event) => setCheckNotes((current) => ({ ...current, [check.id]: event.target.value }))} />
      </div>)}
      <div className={styles.actions}>
        <button type="button" className="secondary" disabled={pending} onClick={() => { setEditor(null); setError(""); }}>Cancelar</button>
        <button type="submit" className="primary" disabled={pending}>{pending ? "Publicando…" : "Publicar novamente"}</button>
      </div>
    </form>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {status && <p role="status" className={styles.done}>{status}</p>}
  </div>;
}

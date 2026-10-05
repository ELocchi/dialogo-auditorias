"use client";

import { useHydrated } from "@/app/components/use-hydrated";
import { NewAudit } from "@/app/components/audit-workspace";
import { AuditPhotoProvider } from "@/app/components/audit-photo-context";
import { qualityModels } from "@/domain/catalogs";
import Link from "next/link";
import { useState } from "react";
import { AuthForm } from "@/app/components/auth/AuthForm";
import { useAuditPublication, publicationFetch } from "@/app/components/use-audit-publication";
import { PublicationFeedback } from "@/app/components/publication-feedback";
import { PersistentActionPlanEditor } from "@/app/components/persistent-action-plan-editor";
import { EvidenceThumbnail } from "@/app/components/evidence-thumbnail";
import { DownloadButton } from "@/app/components/download-button";
import { AsyncSkeleton } from "@/app/components/async-feedback";
import { FollowUpSavedFindingRow } from "@/app/components/follow-up-workspace-rows";
import { useFollowUpPhotoStore } from "@/app/components/use-follow-up-photos";
import { useFollowUpSnapshot, isFollowUpReportIndexSnapshot } from "@/app/components/use-follow-up-snapshot";
import type { AgendaActorContext } from "@/lib/agenda/contracts";
import type { PrototypeAuditState } from "@/domain/prototype-audits";

const actor: AgendaActorContext = { userId: "a1000000-0000-4000-8000-000000000001", profile: "AUDITOR_QUALIDADE", engineeringScope: null, administrativeScope: null };
const auditId = "a1000000-0000-4000-8000-000000000002";
const visitId = "a1000000-0000-4000-8000-000000000003";

function FinishProbe() {
  const criterion = qualityModels[0].criteria.find(item => item.verificationRule === "Conforme/Não Conforme")!;
  const drafts = { "quality-f175": { [criterion.id]: { answer: "Conforme" as const, note: "Resposta de teste" } } };
  const [position, setPosition] = useState(0);
  const [message, setMessage] = useState("");
  return <AuditPhotoProvider responses={{ [auditId]: drafts }}><NewAudit model="Qualidade Simplificada" responseKey="quality-f175" criteria={[criterion]} activeIndex={position} setActiveIndex={setPosition} drafts={drafts} updateDraft={() => {}} details={{ date: "2026-10-05", auditor: "Auditor de teste" }} workName="Obra de teste" onFinish={async () => { await publicationFetch("/api/revisao-assincrona/revisar", { method: "POST", body: "{}" }); setMessage("Revisão aberta"); }} /><p role="status">{message}</p></AuditPhotoProvider>;
}

function PublicationProbe() {
  const [session, setSession] = useState<PrototypeAuditState>({ audits: [], responses: {} });
  const publication = useAuditPublication(actor, session, setSession);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const response = session.responses[auditId]?.["quality-f175"]?.item ?? { note: "" };
  return <section className="panel"><h2>Auditoria de teste</h2>
    <PublicationFeedback publication={publication} />
    <label>Observação<textarea aria-label="Observação" value={response.note} disabled={pending || publication.loading} onChange={event => setSession(current => ({ ...current, responses: { ...current.responses, [auditId]: { "quality-f175": { item: { ...response, note: event.target.value } } } } }))} /></label>
    <label>Foto<input type="file" accept="image/png,image/jpeg" disabled={pending || publication.loading} onChange={event => {
      const file = event.target.files?.[0]; if (!file) return;
      const reference = publication.photoStore.add(file);
      setSession(current => ({ ...current, responses: { ...current.responses, [auditId]: { "quality-f175": { item: { ...response, photos: [reference] } } } } }));
    }} /></label>
    <button type="button" className="primary" disabled={pending || publication.loading} onClick={async () => {
      setPending(true); setError("");
      try { await publication.publish(auditId, session.responses[auditId] ?? {}); }
      catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao publicar"); }
      finally { setPending(false); }
    }}>{pending ? "Publicando…" : "Publicar auditoria"}</button>
    {error && <p role="alert">{error}</p>}
  </section>;
}

function QueryProbe() {
  const [work, setWork] = useState("a");
  const snapshot = useFollowUpSnapshot(actor, `/api/follow-up/reports/${work}`, isFollowUpReportIndexSnapshot);
  return <section className="panel"><h2>Busca por obra</h2><label>Obra<select aria-label="Obra" value={work} onChange={event => setWork(event.target.value)}><option value="a">Obra A</option><option value="b">Obra B</option></select></label>
    {snapshot.loading && <AsyncSkeleton label="Carregando relatórios…" />}
    {snapshot.error && <div role="alert"><p>Não foi possível carregar os relatórios.</p><button className="secondary" onClick={snapshot.retry}>Tentar novamente</button></div>}
    {snapshot.data?.reports.map(report => <p key={report.id}>{report.title}</p>)}
    {!snapshot.loading && !snapshot.error && !snapshot.data?.reports.length && <p>Nenhum relatório nesta obra.</p>}
  </section>;
}

function UploadProbe() {
  const photoStore = useFollowUpPhotoStore(actor);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  return <section className="panel"><h2>Upload de acompanhamento</h2><p role="status">{message}</p><ul>
    <FollowUpSavedFindingRow item={{ id: "a1000000-0000-4000-8000-000000000004", source: "saved", visitId, workId: auditId, workName: "Obra de teste", date: "2026-10-05", description: "Apontamento de teste", location: "Pavimento 1", correction: "Revisar execução" }} actor={actor} photoStore={photoStore} disabled={pending} onComplete={() => {}}
      onUpload={async file => {
        setPending(true); setMessage("Enviando foto…");
        const body = new FormData(); body.set("photo", file);
        try { await publicationFetch("/api/revisao-assincrona/upload", { method: "POST", body }); setMessage("Foto enviada"); return true; }
        catch { setMessage("Falha ao enviar. A foto foi mantida."); return false; }
        finally { setPending(false); }
      }} />
  </ul></section>;
}

export default function Review({ flow }: { flow: string }) {
  const hydrated = useHydrated();
  return <main data-hydrated={hydrated} style={{ padding: 20, margin: "auto", maxWidth: 1050, minWidth: 0 }}>
    <h1>Validação de fluxos assíncronos</h1><p>Dados fictícios. As respostas de API são controladas pelo teste.</p>
    <nav style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }} aria-label="Fluxos de teste">{["auditoria", "plano", "foto", "busca", "formulario", "upload", "download", "revisar"].map(value => <Link key={value} href={`/revisao-assincrona?fluxo=${value}`}>{value}</Link>)}<Link prefetch={false} href="/revisao-assincrona/lenta">Página lenta</Link></nav>
    {flow === "auditoria" && <PublicationProbe />}
    {flow === "revisar" && <FinishProbe />}
    {flow === "plano" && <PersistentActionPlanEditor auditId={auditId} actor={actor} workName="Obra de teste" auditDate="2026-10-05" auditScore={8} module="quality" authorName="Auditor de teste" onBack={() => {}} onPublished={() => {}} />}
    {(flow === "foto" || flow === "foto-fora") && <section className="panel" style={flow === "foto-fora" ? { marginTop: 6000 } : undefined}><h2>Foto publicada</h2><EvidenceThumbnail thumbnailSrc="/api/revisao-assincrona/foto" originalSrc="/api/revisao-assincrona/original" alt="Evidência de teste" width={160} height={100} /></section>}
    {flow === "busca" && <QueryProbe />}
    {flow === "formulario" && <section className="panel"><h2>Formulário de acesso</h2><AuthForm mode="signup" /></section>}
    {flow === "upload" && <UploadProbe />}
    {flow === "download" && <section className="panel"><h2>Download</h2><DownloadButton href="/api/revisao-assincrona/pdf" label="Baixar PDF de teste" className="secondary">Baixar PDF</DownloadButton></section>}
  </main>;
}

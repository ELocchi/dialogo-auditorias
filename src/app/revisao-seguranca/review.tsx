"use client";
import { useState } from "react";
import { securityCriteria } from "@/domain/catalogs";
import { type AuditDrafts, updateItemResponse } from "@/domain/audit-draft";
import { reactivateGroupAfterAnswer, type SafetyClosure } from "@/domain/safety-audit";
import { NewAudit, AuditReview } from "../components/audit-workspace";
import { AuditPhotoProvider } from "../components/audit-photo-context";
const model = "security-it07-r02";
export default function SafetyReview() {
  const [drafts, setDrafts] = useState<AuditDrafts>({});
  const [index, setIndex] = useState(0);
  const [closure, setClosure] = useState<SafetyClosure>();
  const [review, setReview] = useState(false);
  const [message, setMessage] = useState("");
  const [date] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }));
  const details = { date, auditor: "Auditor de demonstração" };
  return <main style={{ maxWidth: 1400, margin: "auto", padding: 24 }}><section className="panel"><h1>Revisão das regras de Segurança</h1><p>Ambiente local de aprovação. Os dados desta demonstração ficam somente nesta guia e não são publicados.</p><div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
    <button className="secondary" onClick={() => { setDrafts({ [model]: Object.fromEntries(securityCriteria.map(c => [c.id, { note: "", answer: "10" }])) }); setReview(false); setClosure(undefined); setMessage(""); }}>Simular todos conformes</button>
    <button className="secondary" onClick={() => { setDrafts({}); setClosure(undefined); setReview(false); setMessage(""); }}>Recomeçar em branco</button>
  </div>{message && <p role="status">{message}</p>}</section>
  <AuditPhotoProvider responses={{ preview: drafts }}>{review ? <AuditReview model="Segurança — IT.07" modelId={model} workName="Obra de demonstração" details={details} criteria={securityCriteria} drafts={drafts} safetyClosure={closure} onBack={() => setReview(false)} onPublish={() => { setMessage("Revisão concluída localmente. Nenhuma publicação foi enviada ao banco."); return false; }} /> :
    <NewAudit model="Segurança — IT.07" responseKey={model} workName="Obra de demonstração" details={details} criteria={securityCriteria} drafts={drafts} activeIndex={index} setActiveIndex={setIndex} safetyClosure={closure} onDraftsChange={setDrafts} updateDraft={r => {
      const item = securityCriteria[index];
      const changed = drafts[model]?.[item.id]?.answer !== r.answer;
      const next = { ...r }; if (changed) delete next.autoGroupNA;
      setDrafts(updateItemResponse(changed ? reactivateGroupAfterAnswer(drafts, model, securityCriteria, item.group) : drafts, model, item, next));
    }} onFinish={value => { setClosure(value); setReview(true); }} />}</AuditPhotoProvider></main>;
}

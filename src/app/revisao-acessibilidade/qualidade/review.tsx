"use client";
import { useState } from "react";
import { qualityModels } from "@/domain/catalogs";
import { updateItemResponse, type AuditDrafts } from "@/domain/audit-draft";
import { NewAudit } from "../../components/audit-workspace";
import { AuditPhotoProvider } from "../../components/audit-photo-context";
const model=qualityModels[0];
export default function Review(){
 const [drafts,setDrafts]=useState<AuditDrafts>({});const [index,setIndex]=useState(0);
 return <main style={{maxWidth:1200,margin:"auto",padding:16}}><h1>Preenchimento de Qualidade — teste local</h1>
 <AuditPhotoProvider responses={{review:drafts}}><NewAudit model={model.name} criteria={model.criteria} activeIndex={index} setActiveIndex={setIndex} drafts={drafts} responseKey="quality-f175" details={{date:"2026-10-05",auditor:"Pessoa de teste"}} workName="Obra de teste" updateDraft={r=>setDrafts(updateItemResponse(drafts,"quality-f175",model.criteria[index],r))}/></AuditPhotoProvider></main>;
}

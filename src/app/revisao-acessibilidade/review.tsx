"use client";
import { useState } from "react";
import { AdminVisitCalendar } from "../components/admin-visit-calendar";
import { AdminMonthlyRanking } from "../components/admin-monthly-ranking";
import { AdminNotifications } from "../components/auth/AdminNotifications";
import { UserMenu } from "../components/auth/UserMenu";
import { SafetyClosureDialog } from "../components/safety-closure-dialog";
import { AuditPhotoThumbnail } from "../components/audit-photo-thumbnail";
import { Works } from "../components/operational-views";
import { EditUserDialog } from "../components/access/EditUserDialog";
import { PendingRequests } from "../components/access/PendingRequests";
import { HistoryPagination } from "../components/history-pagination";
import { VisitCard } from "../components/visit-agenda";
import { CatalogEditorPanel } from "../components/catalog-editor-panel";
import { bundledCatalog } from "@/lib/catalogs/contracts";
import { FollowUpReportPage } from "../components/follow-up-report-page";
import { ActionPlanEditor } from "../components/action-plan-editor";
import { workRecords } from "@/domain/operational-records";
import { demoUsers, type Visit } from "@/domain/prototype-access";
import { FollowUpWorkFindingRow } from "../components/follow-up-workspace-rows";
const uuid="10000000-0000-4000-8000-000000000001";
const works=workRecords.map(w=>({...w,isDemo:false}));
const visit: Visit={id:uuid,workId:works[0].id,module:"safety",kind:"audit",modelId:"security-it07-r02",auditorId:demoUsers[0].id,date:"2026-10-05",note:"Visita de teste",createdBy:demoUsers[5].id,createdAt:"2026-10-01T12:00:00Z",confirmationStatus:"confirmed",confirmedAt:"2026-10-01T12:00:00Z",revision:1,history:[]};
export default function Review(){
 const [accidents,setAccidents]=useState(false); const [file,setFile]=useState<File>();const [message,setMessage]=useState("");const [page,setPage]=useState(2);const [catalog,setCatalog]=useState(false);
 const [completed,setCompleted]=useState(false);
 return <main id="review-main" style={{maxWidth:1200,margin:"auto",padding:16}}>
  <h1>Auditoria de acessibilidade — componentes reais</h1><p>Dados fictícios. Ações de teste não publicam documentos nem alteram cadastros.</p>
  <p role="status">{message}</p>
  <section className="panel" aria-label="Cabeçalho"><h2>Conta e notificações</h2><div style={{display:"flex",gap:16,flexWrap:"wrap"}}><UserMenu name="Pessoa de teste"/><AdminNotifications userId="accessibility-fixture" items={[{id:"demo",type:"audit_published",workName:"Obra de teste",createdAt:"2026-10-05T12:00:00Z"}]}/></div></section>
  <div className="overview-grid"><AdminVisitCalendar visits={[visit]} works={works} auditors={demoUsers} viewerId={uuid}/><AdminMonthlyRanking modules={["safety"]}/></div>
  <section className="panel" aria-label="Acidentes"><h2>Acidentes</h2><button className="primary" onClick={()=>setAccidents(true)}>Informar acidentes</button>{accidents&&<SafetyClosureDialog date="2026-10-05" onCancel={()=>setAccidents(false)} onConfirm={()=>{setAccidents(false);setMessage("Declaração revisada localmente");}}/>}</section>
  <section className="panel" aria-label="Fotos"><h2>Foto da auditoria</h2><label>Foto de teste<input type="file" accept="image/*" onChange={e=>setFile(e.target.files?.[0])}/></label><span className="inline-photo-cell"><button className="inline-photo" aria-label="Adicionar foto de teste" onClick={()=>setMessage("Adicionar outra foto solicitado")}>+</button><AuditPhotoThumbnail file={file} label="item 01.01, foto 1" onAdd={()=>setMessage("Adicionar outra foto solicitado")} onDelete={()=>{setFile(undefined);setMessage("Foto de teste excluída");}}/></span></section>
  <Works works={works} canManage/>
  <section className="panel" aria-label="Agendamento"><h2>Agendamento</h2><VisitCard visit={visit} user={demoUsers[5]} users={demoUsers} work={works[0]} available onDelete={async()=>({status:"error",message:"Exclusão simulada"})} onConfirm={async()=>({status:"error",message:"Confirmação simulada"})}/></section>
  <section className="panel" aria-label="Usuários"><h2>Usuários</h2><EditUserDialog actorId={uuid} name="Pessoa de teste" email="pessoa@example.invalid" works={works.map(w=>({id:w.id,nome:w.name,ativo:true}))} grants={[]} account={{auth_user_id:uuid,perfis:["ADMINISTRATIVO"],atuacao_engenharia:null,atuacoes_engenharia:[],atuacao_administrativa:"GERAL",ativo:true}}/>
  <PendingRequests actorId="review" works={[]} previewIds={[uuid]} requests={[{auth_user_id:uuid,nome:"Solicitante de teste",email:"solicitante@example.invalid",cargo_area_informado:null,obra_referencia_informada:null,email_confirmado_em:"2026-10-05T12:00:00Z",created_at:"2026-10-05T12:00:00Z"}]}/></section>
  <section className="panel" aria-label="Apontamentos"><h2>Apontamentos</h2>{!completed?<ul><FollowUpWorkFindingRow item={{id:uuid,workId:works[0].id,module:"safety",location:"Térreo",description:"Proteção da abertura",correction:"Instalar proteção",serious:false,photoFileName:"test.jpg",createdAt:"2026-10-05T12:00:00Z"}} workName={works[0].name} actor={{userId:uuid,profile:"AUDITOR_SEGURANCA",engineeringScope:null,administrativeScope:null}} disabled={false} onComplete={()=>{setCompleted(true);setMessage("Apontamento de teste concluído");}}/></ul>:<p>Apontamento concluído</p>}</section>
  <section className="panel"><h2>Roteiros</h2><button className="secondary" onClick={()=>setCatalog(true)}>Editar roteiro de teste</button>{catalog&&<CatalogEditorPanel version={bundledCatalog("security-it07-r02")} available={false} actorId={uuid} onSaved={()=>{}} onClose={()=>setCatalog(false)}/>}</section>
  <ActionPlanEditor workName="Obra de teste" auditDate="2026-10-05" auditScore={8} module="safety" authorName="Pessoa de teste" findings={[{id:"finding",item:"01.01",description:"Proteção da abertura",nonconformity:"Ausência de proteção",evidencePhotos:[]}]} example onSave={()=>setMessage("Rascunho simulado")} onPublish={()=>setMessage("Publicação simulada")} onBack={()=>setMessage("Voltar solicitado")}/>
  <FollowUpReportPage visit={{...visit,kind:"follow_up",modelId:null}} actor={{userId:uuid,profile:"AUDITOR_SEGURANCA",engineeringScope:null,administrativeScope:null}} agendaAvailable reportsAvailable draftsAvailable backHref="/revisao-acessibilidade" backLabel="Voltar à revisão" initialPhotos={[]} initialReportedFindings={[]} initialWorkFindings={[]} initialDraft={{visitId:visit.id,revision:1,updatedAt:"2026-10-05T12:00:00Z",findings:[{id:uuid,location:"Térreo",description:"Proteção da abertura",correction:"Instalar proteção"}]}} />
  <HistoryPagination page={page} pageCount={3} total={30} first={page*10-9} last={page*10} label="Histórico de auditorias" onPageChange={setPage}/>
 </main>;
}

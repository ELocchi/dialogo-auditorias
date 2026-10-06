"use client";
import { WorkHistory } from "@/app/components/works/WorkHistory";
import { FollowUpReportPage } from "@/app/components/follow-up-report-page";
import Link from "next/link";
import { useCursorList } from "@/app/components/use-cursor-list";
import { ListFilters, ListStatus, ListPagination } from "@/app/components/list-controls";
import { StandaloneReportForm } from "@/app/components/standalone-report-form";
import { ActiveTeamProfiles } from "@/app/components/works/ActiveTeamProfiles";
import { AdminVisitCalendar } from "@/app/components/admin-visit-calendar";
import { AgendaWindow } from "@/app/components/agenda-window";
import { useAgenda } from "@/app/components/use-agenda";
import { unavailableAgenda } from "@/lib/agenda/contracts";
import { useHydrated } from "@/app/components/use-hydrated";
import type { WorkRecord } from "@/domain/operational-records";
const userId = "a1000000-0000-4000-8000-000000000001";
const actor = { userId, profile: "AUDITOR_QUALIDADE", engineeringScope: null, administrativeScope: null };
const works = [{ id: "a1000000-0000-4000-8000-000000000002", name: "Obra de teste A", city: "São Paulo" }, { id: "a1000000-0000-4000-8000-000000000003", name: "Obra de teste B", city: "São Paulo" }] as WorkRecord[];
export default function Review({ flow }: { flow: string }) {
 const hydrated = useHydrated();
 return <main className="content-wrap" data-hydrated={hydrated}><h1>Validação de listas — dados fictícios</h1>
  {flow === "historico" ? <><label>Nome em edição<input defaultValue="Obra em edição" /></label><WorkHistory actorId={userId} workId={works[0].id} initial={{page:1,error:false,total:41,rows:Array.from({length:20},(_,n)=>({id:String(n),obra_id:works[0].id,changed_at:"2026-10-06T12:00:00Z",actor_auth_user_id:userId,actor_snapshot:{nome:"Pessoa de teste"},before_snapshot:{nome:"Nome anterior"},after_snapshot:{nome:`Nome ${n}`}}))}} /></> : flow === "visita" ? <FollowUpReportPage actor={actor} visit={{id:"a1000000-0000-4000-8000-000000000004",workId:works[0].id,auditorId:userId,module:"quality",kind:"follow_up",modelId:null,date:"2026-09-20",confirmationStatus:"confirmed",createdBy:userId,createdAt:"2026-09-20T12:00:00Z",note:"",history:[]}} agendaAvailable reportsAvailable draftsAvailable backHref="/revisao-listas" backLabel="Voltar à lista" initialReportedFindings={[]} initialPhotos={[]} initialWorkFindings={[]} /> : flow === "selecao" ? <StandaloneReportForm works={works} actor={actor} today="2026-10-06" /> : flow === "usuarios" ? <section className="panel"><h2>Equipe</h2><ActiveTeamProfiles profiles={[]} /></section> : flow === "agenda" ? <Calendar /> : flow === "detalhe" ? <><p>Documento fictício</p><Link href="/revisao-listas">Voltar à lista</Link></> : <Listing />}
 </main>;
}
function Listing() {
 const { anchor: listAnchor, ...list } = useCursorList(actor, "work-findings", "browser-evidence", "quality");
 return <section className="panel" aria-label="Apontamentos" ref={listAnchor}><h2>Apontamentos</h2>
  <ListFilters list={list} works={works} label="Apontamentos" /><ListStatus list={list} />
  <ul data-testid="rows">{list.data?.items.map(item => <li key={item.key} style={{ padding: 12 }}><Link href="/revisao-listas?fluxo=detalhe">{item.description}</Link><p>{item.correction}</p></li>)}</ul>
  <ListPagination list={list} label="Apontamentos" />
 </section>;
}
const seed = unavailableAgenda();
function Calendar() {
 const agenda = useAgenda(seed, userId, "AUDITOR_QUALIDADE", null, null);
 return <AgendaWindow.Provider value={{ month: agenda.month, setMonth: agenda.setMonth, loading: agenda.refreshPending || !agenda.agenda.available, blocked: false, error: agenda.agendaSyncError, retry: () => { void agenda.retryAgenda(); } }}>
  <AdminVisitCalendar visits={agenda.agenda.visits} works={works} viewerId={userId} />
 </AgendaWindow.Provider>;
}

"use client";
import { useState } from "react";
import type { WorkChange } from "@/lib/works/contracts";
import { usePageResource } from "../use-page-resource";
import { useListState } from "../list-state";
import { HistoryPagination, initialPage, isPageState } from "../history-pagination";
import { AsyncSkeleton } from "../async-feedback";
import styles from "./work-edit.module.css";
type Page = { rows: WorkChange[]; error: boolean; total: number; page: number };
const valid = (v: unknown): v is Page => { const p=v as Page; return !!p && p.error===false && Number.isSafeInteger(p.total) && p.total>=0 && Array.isArray(p.rows) && p.rows.length<=20 && p.rows.every(r=>r && typeof r.id==="string" && Number.isFinite(Date.parse(r.changed_at)) && r.before_snapshot && r.after_snapshot && r.actor_snapshot); };
export function WorkHistory({ workId, actorId, initial }: { workId: string; actorId: string; initial: Page }) {
 const [state,setState]=useListState(`work-history:${actorId}:${workId}`,{...initialPage,page:initial.page},isPageState);
 const [force,setForce]=useState(false);
 const remote=usePageResource(`/api/access/list?${new URLSearchParams({workId,page:String(state.page)})}`,valid,force || state.page!==initial.page);
 const data=state.page===initial.page && !force ? initial : remote.data;
 const error=data?.error || remote.error;
 const rows=data?.rows??[], total=data?.total??0;
 return <section className={styles.historySection} aria-labelledby="work-history-title">
  <div className={styles.sectionHeading}><h2 id="work-history-title">Histórico do cadastro</h2><span>20 alterações por página · horários de Brasília</span></div>
  {remote.loading ? <AsyncSkeleton label="Carregando alterações…" /> : error ? <p role="alert">Não foi possível carregar o histórico. <button className="secondary" type="button" onClick={()=>{setForce(true);remote.retry();}}>Tentar novamente</button></p> : rows.length ? <div className={styles.history}>{rows.map(change=><WorkHistoryEntry key={change.id} change={change} />)}</div> : <p className={styles.empty}>Nenhuma alteração nesta página.</p>}
  <HistoryPagination page={state.page} pageCount={Math.max(1,Math.ceil(total/20))} total={total} first={rows.length?(state.page-1)*20+1:0} last={Math.min(state.page*20,total)} status={remote.loading?"loading":"ready"} onPageChange={page=>setState({...state,page})} label="Páginas do histórico da obra" unit="alterações" />
 </section>;
}
const date = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
const fieldLabels: Record<string, string> = {
  nome: "Nome do projeto", empreendimento: "Nome do empreendimento", etapa_obra: "Etapa da obra", logradouro: "Logradouro", numero: "Número", complemento: "Complemento",
  bairro: "Bairro", cidade: "Cidade", uf: "UF", cep: "CEP", responsavel_tecnico: "Responsável técnico",
  registro_tecnico: "Registro profissional", coordenacao: "Coordenador", equipe_obra: "Equipe da obra", observacoes: "Observações",
};

function WorkHistoryEntry({ change }: { change: WorkChange }) {
  const changed = Object.keys(fieldLabels).filter((key) => JSON.stringify(change.before_snapshot[key] ?? null) !== JSON.stringify(change.after_snapshot[key] ?? null));
  const actor = change.actor_snapshot;
  const actorName = typeof actor.nome === "string" && actor.nome ? actor.nome : typeof actor.email === "string" && actor.email ? actor.email : "Administrativo";
  return <details className={styles.historyEntry}>
    <summary><strong>{date(change.changed_at)}</strong><span>{actorName}</span><small>{changed.length === 1 ? fieldLabels[changed[0]] : `${changed.length} campos atualizados`}</small></summary>
    <div className={styles.historyBody}>
      {typeof actor.email === "string" && actor.email && actor.email !== actorName && <p className={styles.help}>Responsável: {actor.email}</p>}
      {changed.length === 0 ? <p className={styles.help}>Alteração registrada no cadastro.</p> : <div className={styles.changes}>{changed.map((key) => <section className={styles.change} key={key}><h3>{fieldLabels[key]}</h3><dl><div><dt>Antes</dt><dd>{snapshotText(key, change.before_snapshot[key])}</dd></div><div><dt>Depois</dt><dd>{snapshotText(key, change.after_snapshot[key])}</dd></div></dl></section>)}</div>}
    </div>
  </details>;
}

function snapshotText(key: string, value: unknown): string {
  if (key === "equipe_obra" && Array.isArray(value)) {
    const team = value.flatMap((entry) => {
      if (!entry || typeof entry !== "object" || typeof entry.nome !== "string" || !entry.nome) return [];
      return [typeof entry.funcao === "string" && entry.funcao ? `${entry.nome} — ${entry.funcao}` : entry.nome];
    });
    return team.join("\n") || "Não informada";
  }
  return typeof value === "string" && value ? value : "Não informado";
}

"use client";

import { useEffect, useState } from "react";
import { readEngineeringWorkFindingsAction, type WorkFinding } from "@/app/follow-up/actions";
import { moduleLabels, type AppModule } from "@/domain/prototype-access";
import { auditModelLabels, type AuditModelId, type WorkRecord } from "@/domain/operational-records";
import type { AgendaActorContext } from "@/lib/agenda/contracts";
import { catalogVersion, type CatalogSnapshot } from "@/lib/catalogs/contracts";
import styles from "./engineering-resource-panels.module.css";

export function EngineeringResourcePanels({ actor, works, module, catalogs }: {
  actor: AgendaActorContext;
  works: readonly WorkRecord[];
  module: AppModule;
  catalogs: CatalogSnapshot;
}) {
  const [findings, setFindings] = useState<WorkFinding[]>([]);
  const [available, setAvailable] = useState(true);
  const { userId, profile, engineeringScope, administrativeScope } = actor;
  const workNames = new Map(works.map((work) => [work.id, work.name]));
  const modelIds: AuditModelId[] = module === "safety" ? ["security-it07-r02"] : ["quality-f175", "quality-f176"];

  useEffect(() => {
    let active = true;
    readEngineeringWorkFindingsAction(module, { userId, profile, engineeringScope, administrativeScope })
      .then((result) => { if (active) { setFindings(result.findings); setAvailable(result.available); } })
      .catch(() => active && setAvailable(false));
    return () => { active = false; };
  }, [module, userId, profile, engineeringScope, administrativeScope]);

  return <div className={styles.grid}>
    <section className="panel" aria-label={`Apontamentos de ${moduleLabels[module]}`}>
      <div className="panel-heading"><h3>Apontamentos</h3></div>
      {!available ? <p className="muted">Não foi possível consultar os apontamentos.</p>
        : findings.length ? <ul className={styles.findings}>{findings.slice(0, 6).map((finding) => <li key={finding.id}>
          <strong>{finding.description}</strong>
          <span>{workNames.get(finding.workId) ?? "Obra"}{finding.location ? ` · ${finding.location}` : ""}</span>
          <p>{finding.correction}</p>
        </li>)}</ul>
          : <p className="muted">Nenhum apontamento ativo para esta disciplina.</p>}
    </section>
    <section className="panel" aria-label={`Roteiros de ${moduleLabels[module]}`}>
      <div className="panel-heading"><h3>Roteiros</h3></div>
      <ul className={styles.catalogs}>{modelIds.map((modelId) => {
        const version = catalogVersion(catalogs, modelId);
        return <li key={modelId}><strong>{auditModelLabels[modelId].name}</strong>
          <span>{version.criteria.length} itens · {auditModelLabels[modelId].version}</span></li>;
      })}</ul>
    </section>
  </div>;
}

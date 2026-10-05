import { BackLink } from "@/app/components/back-control";
import { ownAccessRequest, requireAdministrator } from "@/lib/auth/session";
import { readWorkDetails, readWorkHistory, readActiveTeamProfiles, readWorkTeamLinks } from "@/lib/works/queries";
import type { WorkChange } from "@/lib/works/contracts";
import { AdministrativeHeader } from "@/app/components/administrative-header";
import { WorkEditForm } from "@/app/components/works/WorkEditForm";
import styles from "@/app/components/works/work-edit.module.css";

export const dynamic = "force-dynamic";
const date = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
const fieldLabels: Record<string, string> = {
  nome: "Nome do projeto", empreendimento: "Nome do empreendimento", etapa_obra: "Etapa da obra", logradouro: "Logradouro", numero: "Número", complemento: "Complemento",
  bairro: "Bairro", cidade: "Cidade", uf: "UF", cep: "CEP", responsavel_tecnico: "Responsável técnico",
  registro_tecnico: "Registro profissional", coordenacao: "Coordenador", equipe_obra: "Equipe da obra", observacoes: "Observações",
};

export default async function EditWorkPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdministrator();
  const { id } = await params;
  const [work, history, ownRequest, activeProfiles, linkedProfiles] = await Promise.all([readWorkDetails(id), readWorkHistory(id), ownAccessRequest(user.id), readActiveTeamProfiles(), readWorkTeamLinks(id)]);
  const name = typeof ownRequest?.nome === "string" && ownRequest.nome.trim()
    ? ownRequest.nome : user.email ?? "Usuário";
  return <div className={styles.shell}>
    <a className="skip-link" href="#work-content">Ir para o cadastro da obra</a>
    <AdministrativeHeader name={name} email={user.email} userId={user.id} />
    <main id="work-content" tabIndex={-1} className={styles.main}>
      <div className={styles.pageHeading}>
        <BackLink href="/app?secao=obras" label="Voltar às obras" />
        <h2>Editar Obra</h2>
      </div>
      {!work ? <div className={styles.error} role="alert"><p>Não foi possível carregar este cadastro. Volte às obras e selecione a obra novamente.</p><BackLink href="/app?secao=obras" label="Voltar às obras" /></div> : <>
        <WorkEditForm work={work} activeProfiles={activeProfiles} linkedProfiles={linkedProfiles} />
        <section className={styles.historySection} aria-labelledby="work-history-title">
          <div className={styles.sectionHeading}><h2 id="work-history-title">Histórico do cadastro</h2><span>Até 20 alterações mais recentes · horários de Brasília</span></div>
          <p className={styles.help}>Cada alteração preserva os dados anteriores, os novos dados e o responsável por salvar.</p>
          {history.error ? <p className={styles.error} role="status">Não foi possível carregar o histórico agora. Os registros anteriores permanecem preservados.</p>
            : history.rows.length === 0 ? <p className={styles.empty}>Ainda não há alterações registradas neste cadastro.</p>
              : <div className={styles.history}>{history.rows.map((change) => <WorkHistoryEntry key={change.id} change={change} />)}</div>}
        </section>
      </>}
    </main>
  </div>;
}

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

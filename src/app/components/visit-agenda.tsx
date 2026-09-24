"use client";

import { useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  canAccessWorkModule,
  canAuditModule,
  canManageAgenda,
  canConsultAgenda,
  canReadVisit,
  canBeginScheduledAudit,
  modelModule,
  moduleLabels,
  type AppModule,
  type DemoUser,
  type Visit,
  type VisitInput,
} from "@/domain/prototype-access";
import {
  auditModelLabels,
  formatAuditDate,
  type AuditModelId,
  type WorkRecord,
} from "@/domain/operational-records";
import { getSaoPauloToday, isCalendarDate } from "@/domain/visit-calendar";
import type { AgendaActionResult } from "@/lib/agenda/contracts";
import { AdminVisitCalendar } from "./admin-visit-calendar";
import { Icon } from "./ui-icon";
import styles from "./visit-agenda.module.css";

type VisitAgendaProps = {
  user: DemoUser;
  works: readonly WorkRecord[];
  users: readonly DemoUser[];
  visits: readonly Visit[];
  module: AppModule;
  workId: string;
  available: boolean;
  mutationPending?: boolean;
  syncError?: string;
  onCreate: (input: VisitInput) => Promise<AgendaActionResult>;
  onDelete: (visitId: string, expectedRevision: number) => Promise<AgendaActionResult>;
  onConfirm: (visitId: string, expectedRevision: number) => Promise<AgendaActionResult>;
};

const modelIds = Object.keys(auditModelLabels) as AuditModelId[];
const visitTypeLabels: Record<AuditModelId, string> = {
  "security-it07-r02": "Auditoria de Segurança",
  "quality-f175": "Farol da Qualidade Simplificado",
  "quality-f176": "Farol da Qualidade Completo",
};
const months = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

export function VisitAgenda(props: VisitAgendaProps) {
  if (canManageAgenda(props.user)) return <AdministrativeAgenda {...props} />;
  if (props.user.role === "safety-auditor" || props.user.role === "quality-auditor") return <AuditorAgenda {...props} />;
  if (props.user.role === "engineering") return <EngineeringAgenda {...props} />;
  return <AgendaContext key={`${props.user.id}:${props.module}:${props.workId}`} {...props} />;
}

function AdministrativeAgenda({ user, works, users, visits, module, workId, available, mutationPending = false, syncError, onCreate, onDelete, onConfirm }: VisitAgendaProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const dialogTitleId = useId();
  const [selectedAuditorId, setSelectedAuditorId] = useState<string | null>(null);
  const [draftVisits, setDraftVisits] = useState<{ id: string; input: VisitInput }[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const authorizedWorks = works.filter((work) => user.modules.some((discipline) => canConsultAgenda(user, work.id, discipline)));
  const workIds = new Set(authorizedWorks.map((work) => work.id));
  const authorizedVisits = visits.filter((visit) => workIds.has(visit.workId) && canReadVisit(user, visit) && isCalendarDate(visit.date));
  const visibleVisits = authorizedVisits.filter((visit) => !selectedAuditorId || visit.auditorId === selectedAuditorId)
    .sort((first, second) => first.date.localeCompare(second.date) || first.id.localeCompare(second.id));
  const selectedAuditor = users.find((entry) => entry.id === selectedAuditorId);
  const previewVisits: Visit[] = draftVisits.map(({ id, input }) => ({
    ...input, id, createdBy: user.id, createdAt: new Date().toISOString(), history: [],
    auditorName: users.find((entry) => entry.id === input.auditorId)?.name,
  }));
  const sendAgenda = async () => {
    if (exporting || mutationPending || draftVisits.length === 0) return;
    setExporting(true);
    setExportError("");
    let exported = 0;
    try {
      for (const draft of draftVisits) {
        const result = await onCreate(draft.input);
        if (result.status !== "success") throw new Error(`${exported} de ${draftVisits.length} agendamentos foram enviados. ${result.message}`);
        exported += 1;
      }
      setDraftVisits([]);
      dialogRef.current?.close();
    } catch (cause) {
      if (exported > 0) setDraftVisits((current) => current.slice(exported));
      setExportError(errorMessage(cause, "Não foi possível exportar a agenda. Confira os itens restantes e tente novamente."));
    } finally { setExporting(false); }
  };

  return <>
    <div className="page-intro">
      <div><h2>Agenda de visitas</h2></div>
      <span className="badge">Agendamento administrativo</span>
    </div>
    {(!available || syncError) && <p role="status" className={styles.availability}>{syncError || "A agenda está indisponível no momento. Não é possível agendar ou confirmar visitas agora."}</p>}
    <div className={styles.administrativeLayout}>
      <section className={`panel ${styles.scheduledPanel}`} aria-labelledby={listId}>
        <div className={styles.scheduledHeading}>
          <div><h3 id={listId}>{selectedAuditor ? `Agenda de ${selectedAuditor.name}` : "Visitas agendadas"}</h3>{selectedAuditor && <button type="button" className={styles.clearProfile} onClick={() => setSelectedAuditorId(null)}>Ver todos os perfis</button>}</div>
          <button ref={addButtonRef} type="button" className={styles.addVisit} aria-label="Agendar visita" title="Agendar visita" aria-haspopup="dialog" disabled={mutationPending} onClick={() => dialogRef.current?.showModal()}><Icon name="plus" /></button>
        </div>
        {visibleVisits.length ? <div className={styles.visitList}>
          {visibleVisits.map((visit) => <VisitCard key={visit.id} visit={visit} user={user} users={users}
            work={authorizedWorks.find((work) => work.id === visit.workId)} available={available} mutationPending={mutationPending}
            onDelete={onDelete} onConfirm={onConfirm} />)}
        </div> : <div className={styles.scheduledEmpty}>
          <CalendarIcon />
          <p>{!available ? "Aguardando acesso à agenda." : authorizedWorks.length ? "Nenhuma visita agendada." : "Nenhuma obra disponível para agendamento."}</p>
        </div>}
      </section>
      <AdminVisitCalendar visits={authorizedVisits} works={authorizedWorks} auditors={users} viewerId={user.id} calendarOnly includeFollowUps={Boolean(selectedAuditorId)} selectedAuditorId={selectedAuditorId} onSelectAuditor={setSelectedAuditorId} />
    </div>
    <dialog ref={dialogRef} className={styles.scheduleDialog} aria-labelledby={dialogTitleId} onCancel={(event) => { if (mutationPending) event.preventDefault(); }} onClose={() => addButtonRef.current?.focus()}>
      <button type="button" className={`secondary ${styles.closeDialog}`} disabled={mutationPending} onClick={() => dialogRef.current?.close()}>Fechar</button>
      <CreateVisitForm user={user} works={authorizedWorks} users={users} module={module} workId={workId}
        available={available} mutationPending={mutationPending} onCreate={onCreate} headingId={dialogTitleId}
        draftCount={draftVisits.length} onStage={(input) => setDraftVisits((current) => [...current, { id: `draft-${crypto.randomUUID()}`, input }])}
        previewVisits={previewVisits} exporting={exporting} exportError={exportError}
        onRemoveDraft={(draftId) => setDraftVisits((current) => current.filter((entry) => entry.id !== draftId))}
        onUpdateDraft={(draftId, input) => setDraftVisits((current) => current.map((entry) => entry.id === draftId ? { ...entry, input } : entry))}
        drafts={draftVisits} onImport={(inputs) => setDraftVisits((current) => [...current, ...inputs.map((input) => ({ id: `draft-${crypto.randomUUID()}`, input }))])}
        onSend={() => { void sendAgenda(); }} />
    </dialog>
  </>;
}

function AuditorAgenda({ user, works, users, visits, available, mutationPending = false, syncError, onDelete, onConfirm }: VisitAgendaProps) {
  const listId = useId();
  const discipline: AppModule = user.role === "quality-auditor" ? "quality" : "safety";
  const visibleVisits = visits.filter((visit) => visit.module === discipline && canReadVisit(user, visit) && isCalendarDate(visit.date))
    .slice().sort((first, second) => first.date.localeCompare(second.date) || first.id.localeCompare(second.id));
  const authorizedWorks = works.filter((work) => canConsultAgenda(user, work.id, discipline)
    || visibleVisits.some((visit) => visit.workId === work.id));

  return <>
    <div className="page-intro"><h2>Agenda de visitas</h2></div>
    {(!available || syncError) && <p role="status" className={styles.availability}>{syncError || "A agenda está indisponível no momento. Tente novamente após a atualização."}</p>}
    <div className={styles.administrativeLayout}>
      <section className={`panel ${styles.scheduledPanel}`} aria-labelledby={listId}>
        <div className={styles.scheduledHeading}><h3 id={listId}>Visitas agendadas</h3></div>
        {visibleVisits.length ? <div className={styles.visitList}>
          {visibleVisits.map((visit) => <VisitCard key={visit.id} visit={visit} user={user} users={users}
            work={authorizedWorks.find((work) => work.id === visit.workId)} available={available} mutationPending={mutationPending}
            onDelete={onDelete} onConfirm={onConfirm} collapsedInitially />)}
        </div> : <div className={styles.scheduledEmpty}>
          <CalendarIcon />
          <p>{!available ? "Aguardando acesso à agenda." : "Nenhuma visita agendada para este auditor."}</p>
        </div>}
      </section>
      <AdminVisitCalendar visits={visibleVisits} works={authorizedWorks} viewerId={user.id} calendarOnly includeFollowUps colorBy="work" />
    </div>
  </>;
}

function EngineeringAgenda({ user, works, users, visits, available, mutationPending = false, syncError, onDelete, onConfirm }: VisitAgendaProps) {
  const listId = useId();
  const [selectedVisitorId, setSelectedVisitorId] = useState<string | null>(null);
  const authorizedWorks = works.filter((work) => user.modules.some((discipline) => canConsultAgenda(user, work.id, discipline)));
  const workIds = new Set(authorizedWorks.map((work) => work.id));
  const authorizedVisits = visits.filter((visit) => workIds.has(visit.workId) && canReadVisit(user, visit) && isCalendarDate(visit.date));
  const visibleVisits = authorizedVisits.filter((visit) => !selectedVisitorId || visit.auditorId === selectedVisitorId)
    .slice().sort((first, second) => first.date.localeCompare(second.date) || first.id.localeCompare(second.id));
  const selectedVisitor = users.find((entry) => entry.id === selectedVisitorId)
    ?? authorizedVisits.find((visit) => visit.auditorId === selectedVisitorId)?.auditorName;

  return <>
    <div className="page-intro"><h2>Agenda de visitas</h2></div>
    {(!available || syncError) && <p role="status" className={styles.availability}>{syncError || "A agenda está indisponível no momento. Tente novamente após a atualização."}</p>}
    <div className={styles.administrativeLayout}>
      <section className={`panel ${styles.scheduledPanel}`} aria-labelledby={listId}>
        <div className={styles.scheduledHeading}>
          <div><h3 id={listId}>{selectedVisitor ? `Agenda de ${typeof selectedVisitor === "string" ? selectedVisitor : selectedVisitor.name}` : "Visitas agendadas"}</h3>
            {selectedVisitorId && <button type="button" className={styles.clearProfile} onClick={() => setSelectedVisitorId(null)}>Ver todos os perfis</button>}
          </div>
        </div>
        {visibleVisits.length ? <div className={styles.visitList}>
          {visibleVisits.map((visit) => <VisitCard key={visit.id} visit={visit} user={user} users={users}
            work={authorizedWorks.find((work) => work.id === visit.workId)} available={available} mutationPending={mutationPending}
            onDelete={onDelete} onConfirm={onConfirm} collapsedInitially />)}
        </div> : <div className={styles.scheduledEmpty}>
          <CalendarIcon />
          <p>{!available ? "Aguardando acesso à agenda." : authorizedWorks.length ? "Nenhuma visita agendada nas obras autorizadas." : "Nenhuma obra disponível na agenda."}</p>
        </div>}
      </section>
      <AdminVisitCalendar visits={authorizedVisits} works={authorizedWorks} auditors={users} viewerId={user.id} calendarOnly includeFollowUps
        colorBy="auditor" selectedAuditorId={selectedVisitorId} onSelectAuditor={setSelectedVisitorId} keepVisitorColors highlightAuditDays />
    </div>
  </>;
}

function AgendaContext({ user, works, users, visits, module, workId, available, mutationPending = false, syncError, onCreate, onDelete, onConfirm }: VisitAgendaProps) {
  const canManage = canManageAgenda(user);
  const authorizedWorks = works.filter((work) => user.modules.some((discipline) => canConsultAgenda(user, work.id, discipline)));
  const authorizedWorkIds = new Set(authorizedWorks.map((work) => work.id));
  const canConsult = authorizedWorks.length > 0;
  const visibleVisits = visits
    .filter((visit) => authorizedWorkIds.has(visit.workId) && canReadVisit(user, visit))
    .slice()
    .sort((first, second) => first.date.localeCompare(second.date) || first.id.localeCompare(second.id));

  return <>
    <div className="page-intro">
      <div>
        <h2>Agenda de visitas</h2>
        <p className="muted">O Administrativo agenda e pode excluir agendamentos. Auditores confirmam as visitas sob sua responsabilidade.</p>
      </div>
      <span className="badge">{canManage ? "Agendamento administrativo" : "Consulta à agenda"}</span>
    </div>
    {(!available || syncError) && <p role="status" className={styles.availability}>{syncError || "A agenda está indisponível no momento. Tente novamente após a atualização."}</p>}

    {canConsult && <div className={styles.context}>
      <span><strong>{authorizedWorks.length}</strong> {authorizedWorks.length === 1 ? "obra relacionada" : "obras relacionadas"}</span>
      <span><strong>{visibleVisits.length}</strong> {visibleVisits.length === 1 ? "visita agendada" : "visitas agendadas"}</span>
    </div>}

    {!canConsult ? <section className={`panel ${styles.restriction}`}>
      <h3>Nenhuma obra disponível na agenda</h3>
      <p>A consulta depende dos vínculos de obra, disciplina e das autorizações do perfil selecionado.</p>
    </section> : <>
      {canManage && <CreateVisitForm user={user} works={authorizedWorks} users={users} module={module} workId={workId} available={available} mutationPending={mutationPending} onCreate={onCreate} />}
      <div className={styles.listHeading}>
        <h3>Visitas agendadas</h3>
        <span>Ordenadas pela data prevista</span>
      </div>
      {visibleVisits.length > 0 ? <div className={styles.visitList}>
        {visibleVisits.map((visit) => <VisitCard
          key={visit.id}
          visit={visit}
          user={user}
          users={users}
          work={authorizedWorks.find((work) => work.id === visit.workId)}
          available={available}
          mutationPending={mutationPending}
          onDelete={onDelete}
          onConfirm={onConfirm}
        />)}
      </div> : <section className={`panel ${styles.empty}`}>
        <CalendarIcon />
        <h3>Nenhuma visita disponível</h3>
        <p>{!available ? "Aguardando acesso à agenda." : canManage ? "Agende uma visita no formulário acima." : "Não há visitas para consulta nas obras autorizadas deste perfil."}</p>
      </section>}
    </>}
  </>;
}

function CreateVisitForm({ user, works, users, module, workId, available, mutationPending = false, onCreate, headingId, draftCount = 0, onStage, previewVisits = [], drafts = [], exporting = false, exportError = "", onRemoveDraft, onUpdateDraft, onImport, onSend }: Pick<VisitAgendaProps, "user" | "works" | "users" | "module" | "workId" | "available" | "mutationPending" | "onCreate"> & {
  headingId?: string;
  draftCount?: number;
  onStage?: (input: VisitInput) => void;
  previewVisits?: readonly Visit[];
  drafts?: readonly { id: string; input: VisitInput }[];
  exporting?: boolean;
  exportError?: string;
  onRemoveDraft?: (draftId: string) => void;
  onUpdateDraft?: (draftId: string, input: VisitInput) => void;
  onImport?: (inputs: VisitInput[]) => void;
  onSend?: () => void;
}) {
  const disciplines = (["safety", "quality"] as const).filter((discipline) =>
    works.some((work) => canConsultAgenda(user, work.id, discipline)));
  const initialModule = disciplines.includes(module) ? module : disciplines[0] ?? module;
  const [input, setInput] = useState<VisitInput>({
    workId: works.some((work) => work.id === workId && canConsultAgenda(user, work.id, initialModule))
      ? workId : works.find((work) => canConsultAgenda(user, work.id, initialModule))?.id ?? "",
    module: initialModule,
    kind: "audit",
    modelId: initialModule === "safety" ? "security-it07-r02" : "quality-f175",
    auditorId: "",
    date: "",
    note: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const submittingRef = useRef(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const eligibleWorks = works.filter((work) => canConsultAgenda(user, work.id, input.module));
  const auditors = users.filter((candidate) =>
    candidate.role === (input.module === "safety" ? "safety-auditor" : "quality-auditor")
    && (input.kind === "audit" ? canAuditModule(candidate, input.module) : canAccessWorkModule(candidate, input.workId, input.module)));

  const changeInput = (change: Partial<VisitInput>) => {
    setInput((current) => ({ ...current, ...change }));
    setError("");
    setSuccess("");
  };

  const importAgenda = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !onImport || importing) return;
    setImporting(true);
    setError("");
    setSuccess("");
    const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");
    const dateValue = (value: unknown, text: string) => {
      if (value instanceof Date && !Number.isNaN(value.getTime())) return `${value.getUTCFullYear().toString().padStart(4, "0")}-${(value.getUTCMonth() + 1).toString().padStart(2, "0")}-${value.getUTCDate().toString().padStart(2, "0")}`;
      const raw = text.trim();
      const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
      if (iso) return raw;
      const brazilian = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
      return brazilian ? `${brazilian[3]}-${brazilian[2]}-${brazilian[1]}` : "";
    };
    try {
      if (!file.name.toLocaleLowerCase("pt-BR").endsWith(".xlsx")) throw new Error("Selecione uma planilha Excel no formato .xlsx.");
      const { Workbook } = await import("exceljs");
      const workbook = new Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const sheet = workbook.worksheets[0];
      if (!sheet) throw new Error("A planilha não possui uma aba com dados.");
      const columns = new Map<string, number>();
      sheet.getRow(1).eachCell((cell, column) => columns.set(normalize(cell.text), column));
      const required = ["obra", "disciplina", "finalidade", "tipo de auditoria", "profissional", "data", "observacao"];
      if (required.some((header) => !columns.has(header))) throw new Error("A primeira linha deve conter: Obra, Disciplina, Finalidade, Tipo de auditoria, Profissional, Data e Observação.");
      const cell = (row: number, header: string) => sheet.getRow(row).getCell(columns.get(header) ?? 0);
      const imported: VisitInput[] = [];
      for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
        if (!required.some((header) => cell(rowNumber, header).text.trim())) continue;
        const workText = cell(rowNumber, "obra").text.trim();
        const work = works.find((entry) => normalize(entry.name) === normalize(workText) || entry.id === workText);
        if (!work) throw new Error(`Linha ${rowNumber}: obra não encontrada ou não autorizada.`);
        const disciplineText = normalize(cell(rowNumber, "disciplina").text);
        const importedModule: AppModule | null = disciplineText === "seguranca" ? "safety" : disciplineText === "qualidade" ? "quality" : null;
        if (!importedModule || !canConsultAgenda(user, work.id, importedModule)) throw new Error(`Linha ${rowNumber}: disciplina inválida para esta obra.`);
        const purpose = normalize(cell(rowNumber, "finalidade").text);
        const kind: VisitInput["kind"] | null = purpose === "auditoria" ? "audit" : purpose === "acompanhamento" || purpose === "acompanhamento da obra" ? "follow_up" : null;
        if (!kind) throw new Error(`Linha ${rowNumber}: finalidade inválida.`);
        const modelText = normalize(cell(rowNumber, "tipo de auditoria").text);
        const modelId = kind === "follow_up" ? null : importedModule === "safety" ? "security-it07-r02"
          : modelIds.find((id) => modelModule(id) === "quality" && (normalize(visitTypeLabels[id]) === modelText || id === cell(rowNumber, "tipo de auditoria").text.trim())) ?? null;
        if (kind === "audit" && !modelId) throw new Error(`Linha ${rowNumber}: informe um tipo de auditoria de Qualidade válido.`);
        const professionalText = cell(rowNumber, "profissional").text.trim();
        const eligible = users.filter((candidate) => candidate.role === (importedModule === "safety" ? "safety-auditor" : "quality-auditor")
          && (kind === "audit" ? canAuditModule(candidate, importedModule) : canAccessWorkModule(candidate, work.id, importedModule)));
        const professional = eligible.find((candidate) => normalize(candidate.name) === normalize(professionalText) || candidate.id === professionalText);
        if (!professional) throw new Error(`Linha ${rowNumber}: profissional não encontrado ou não autorizado para esta finalidade.`);
        const dateCell = cell(rowNumber, "data");
        const date = dateValue(dateCell.value, dateCell.text);
        if (!isCalendarDate(date)) throw new Error(`Linha ${rowNumber}: data inválida. Use DD/MM/AAAA.`);
        imported.push({ workId: work.id, module: importedModule, kind, modelId, auditorId: professional.id, date,
          note: cell(rowNumber, "observacao").text.trim() });
      }
      if (imported.length === 0) throw new Error("A planilha não possui agendamentos para importar.");
      onImport(imported);
      setSuccess(`${imported.length} ${imported.length === 1 ? "agendamento importado" : "agendamentos importados"} para verificação.`);
    } catch (cause) {
      setError(errorMessage(cause, "Não foi possível importar a agenda. Confira a planilha e tente novamente."));
    } finally { setImporting(false); }
  };

  const downloadTemplate = async () => {
    if (downloadingTemplate) return;
    setDownloadingTemplate(true);
    setError("");
    try {
      const { Workbook } = await import("exceljs");
      const workbook = new Workbook();
      const agendaSheet = workbook.addWorksheet("Agenda", { views: [{ state: "frozen", ySplit: 1 }] });
      const headers = ["Obra", "Disciplina", "Finalidade", "Tipo de auditoria", "Profissional", "Data", "Observação"];
      agendaSheet.addRow(headers);
      agendaSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      agendaSheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
      agendaSheet.columns = [{ width: 28 }, { width: 16 }, { width: 25 }, { width: 35 }, { width: 28 }, { width: 15 }, { width: 45 }];
      agendaSheet.autoFilter = "A1:G1";
      const lists = workbook.addWorksheet("Listas");
      const workNames = [...new Set(works.map((work) => work.name))];
      const professionalNames = [...new Set(users.filter((candidate) => candidate.role === "safety-auditor" || candidate.role === "quality-auditor").map((candidate) => candidate.name))];
      const listColumns = [workNames, professionalNames, ["Segurança", "Qualidade"], ["Auditoria", "Acompanhamento da obra"], Object.values(visitTypeLabels)];
      listColumns.forEach((values, columnIndex) => values.forEach((value, rowIndex) => { lists.getCell(rowIndex + 1, columnIndex + 1).value = value; }));
      lists.state = "veryHidden";
      for (let row = 2; row <= 201; row += 1) {
        agendaSheet.getCell(`A${row}`).dataValidation = { type: "list", allowBlank: false, formulae: [`Listas!$A$1:$A$${Math.max(workNames.length, 1)}`] };
        agendaSheet.getCell(`B${row}`).dataValidation = { type: "list", allowBlank: false, formulae: ["Listas!$C$1:$C$2"] };
        agendaSheet.getCell(`C${row}`).dataValidation = { type: "list", allowBlank: false, formulae: ["Listas!$D$1:$D$2"] };
        agendaSheet.getCell(`D${row}`).dataValidation = { type: "list", allowBlank: true, formulae: [`Listas!$E$1:$E$${Object.keys(visitTypeLabels).length}`] };
        agendaSheet.getCell(`E${row}`).dataValidation = { type: "list", allowBlank: false, formulae: [`Listas!$B$1:$B$${Math.max(professionalNames.length, 1)}`] };
        agendaSheet.getCell(`F${row}`).numFmt = "dd/mm/yyyy";
      }
      const data = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([data as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "planilha-padrao-agenda.xlsx";
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(errorMessage(cause, "Não foi possível gerar a planilha padrão."));
    } finally { setDownloadingTemplate(false); }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current || mutationPending) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      if (!available) throw new Error("A agenda está indisponível no momento. Aguarde a atualização e tente novamente.");
      if (!canManageAgenda(user)) throw new Error("Somente o Administrativo pode agendar visitas.");
      if (!eligibleWorks.some((work) => work.id === input.workId)
        || !auditors.some((auditor) => auditor.id === input.auditorId)) {
        throw new Error("Selecione uma obra e um profissional autorizados para esta visita.");
      }
      if (!isCalendarDate(input.date)) throw new Error("Selecione uma data válida para a visita.");
      const prepared = { ...input, note: input.note.trim() };
      if (onStage) {
        onStage(prepared);
        setSuccess("Visita adicionada à agenda para verificação.");
      } else {
        const result = await onCreate(prepared);
        if (result.status !== "success") throw new Error(result.message);
        setSuccess(result.message);
      }
      setInput((current) => ({ ...current, auditorId: "", date: "", note: "" }));
    } catch (cause) {
      setError(errorMessage(cause, "Não foi possível agendar a visita. Confira os campos e tente novamente."));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return <section className={`panel ${styles.createPanel}`} aria-label="Agendamento administrativo">
    <div className={styles.panelHeading}>
      <CalendarIcon />
      <div><h3 id={headingId}>Agendar visita</h3><p>Escolha a obra, a finalidade da visita e o dia de cada profissional.</p></div>
    </div>
    {onStage && <div className={styles.schedulePreview}>
      <AdminVisitCalendar visits={previewVisits} works={works} viewerId={`${user.id}:draft`} calendarOnly includeFollowUps colorBy="work" />
    </div>}
    <form onSubmit={submit} aria-busy={submitting}>
      <fieldset className={styles.formFields} disabled={submitting || mutationPending}>
      <div className={styles.draftTableWrap}>
        <table className={`${styles.draftTable} ${styles.editableTable}`} aria-label="Planilha editável de agendamentos">
          <thead><tr><th>Obra</th><th>Disciplina</th><th>Finalidade</th><th>Tipo de auditoria</th><th>Profissional</th><th>Data</th><th>Observação</th><th><span className={styles.actionLabel}>Ação</span></th></tr></thead>
          <tbody>
            {drafts.map((draft) => <EditableAgendaRow key={draft.id} input={draft.input} user={user} works={works} users={users} disabled={exporting}
              onChange={(next) => onUpdateDraft?.(draft.id, next)} onRemove={onRemoveDraft ? () => onRemoveDraft(draft.id) : undefined} />)}
            <EditableAgendaRow input={input} user={user} works={works} users={users} disabled={exporting || !available} newRow onChange={(next) => changeInput(next)} />
          </tbody>
        </table>
      </div>
      <div className={styles.formFooter}>
        {!onStage && <p>Agende uma visita por profissional, obra e dia. A pessoa selecionada receberá a solicitação para confirmar a data no aplicativo.</p>}
        <div className={styles.formActions}>
          {onImport && <button type="button" className="secondary" disabled={downloadingTemplate || importing || exporting || mutationPending} onClick={() => { void downloadTemplate(); }}>{downloadingTemplate ? "Preparando…" : "Baixar planilha padrão"}</button>}
          {onImport && <><input ref={importInputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" tabIndex={-1} aria-hidden="true" style={{ display: "none" }} onChange={(event) => { void importAgenda(event); }} /><button type="button" className="secondary" disabled={importing || exporting || mutationPending} onClick={() => importInputRef.current?.click()}>{importing ? "Importando…" : "Importar planilha"}</button></>}
          {onSend && <button type="button" className="primary" disabled={draftCount === 0 || exporting || mutationPending} onClick={onSend}>{exporting ? "Enviando…" : `Enviar para confirmação (${draftCount})`}</button>}
        </div>
      </div>
      </fieldset>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {success && <p role="status" className={styles.success}>{success}</p>}
      {exportError && <p role="alert" className={styles.error}>{exportError}</p>}
    </form>
  </section>;
}

function EditableAgendaRow({ input, user, works, users, disabled, newRow = false, onChange, onRemove }: {
  input: VisitInput;
  user: DemoUser;
  works: readonly WorkRecord[];
  users: readonly DemoUser[];
  disabled: boolean;
  newRow?: boolean;
  onChange: (input: VisitInput) => void;
  onRemove?: () => void;
}) {
  const disciplines = (["safety", "quality"] as const).filter((discipline) => works.some((work) => canConsultAgenda(user, work.id, discipline)));
  const eligibleWorks = works.filter((work) => canConsultAgenda(user, work.id, input.module));
  const models = modelIds.filter((modelId) => modelModule(modelId) === input.module);
  const auditors = users.filter((candidate) => candidate.role === (input.module === "safety" ? "safety-auditor" : "quality-auditor")
    && (input.kind === "audit" ? canAuditModule(candidate, input.module) : canAccessWorkModule(candidate, input.workId, input.module)));
  const update = (change: Partial<VisitInput>) => onChange({ ...input, ...change });

  return <tr className={newRow ? styles.newDraftRow : undefined}>
    <td data-label="Obra"><select className="filter-select" required value={input.workId} aria-label="Obra" disabled={disabled} onChange={(event) => update({ workId: event.target.value, auditorId: "" })}>
      {eligibleWorks.length === 0 && <option value="">Nenhuma obra</option>}
      {eligibleWorks.map((work) => <option value={work.id} key={work.id}>{work.name}</option>)}
    </select></td>
    <td data-label="Disciplina">{disciplines.length > 1 ? <select className="filter-select" value={input.module} aria-label="Disciplina" disabled={disabled} onChange={(event) => {
      const nextModule = event.target.value as AppModule;
      const nextWorks = works.filter((work) => canConsultAgenda(user, work.id, nextModule));
      update({ module: nextModule, modelId: input.kind === "follow_up" ? null : nextModule === "safety" ? "security-it07-r02" : "quality-f175",
        workId: nextWorks.some((work) => work.id === input.workId) ? input.workId : nextWorks[0]?.id ?? "", auditorId: "" });
    }}>{disciplines.map((discipline) => <option key={discipline} value={discipline}>{moduleLabels[discipline]}</option>)}</select>
      : <span className={styles.tableFixedValue}>{moduleLabels[input.module]}</span>}</td>
    <td data-label="Finalidade"><select className="filter-select" value={input.kind} aria-label="Finalidade" disabled={disabled} onChange={(event) => {
      const kind = event.target.value as VisitInput["kind"];
      update({ kind, modelId: kind === "audit" ? input.module === "safety" ? "security-it07-r02" : "quality-f175" : null, auditorId: "" });
    }}><option value="audit">Auditoria</option><option value="follow_up">Acompanhamento</option></select></td>
    <td data-label="Tipo de auditoria">{input.kind === "audit" && input.module === "quality" && models.length > 1
      ? <select className="filter-select" value={input.modelId ?? ""} aria-label="Tipo de auditoria" disabled={disabled} onChange={(event) => update({ modelId: event.target.value as AuditModelId })}>{models.map((modelId) => <option key={modelId} value={modelId}>{visitTypeLabels[modelId]}</option>)}</select>
      : <span className={styles.tableFixedValue}>{input.kind === "audit" && input.modelId ? visitTypeLabels[input.modelId] : "—"}</span>}</td>
    <td data-label="Profissional"><select className="filter-select" required value={input.auditorId} aria-label="Profissional responsável" disabled={disabled} onChange={(event) => update({ auditorId: event.target.value })}>
      <option value="">Selecione</option>{auditors.map((auditor) => <option value={auditor.id} key={auditor.id}>{auditor.name}</option>)}
    </select></td>
    <td data-label="Data"><input required type="date" value={input.date} aria-label="Data da visita" disabled={disabled} onChange={(event) => update({ date: event.target.value })} /></td>
    <td data-label="Observação"><textarea maxLength={2000} value={input.note} aria-label="Observação" disabled={disabled} placeholder="Opcional" onChange={(event) => update({ note: event.target.value })} /></td>
    <td data-label="Ação">{onRemove ? <button type="button" className="secondary" disabled={disabled} onClick={onRemove}>Retirar</button>
      : <button type="submit" className="primary" disabled={disabled || !eligibleWorks.some((work) => work.id === input.workId) || !auditors.some((auditor) => auditor.id === input.auditorId)}>Adicionar</button>}</td>
  </tr>;
}

type VisitCardProps = Pick<VisitAgendaProps, "user" | "users" | "available" | "mutationPending" | "onDelete" | "onConfirm"> & {
  visit: Visit;
  work?: WorkRecord;
  collapsedInitially?: boolean;
  showType?: boolean;
  onStartAudit?: (visit: Visit) => Promise<void>;
  auditStarted?: boolean;
};

export function VisitCard({ visit, user, users, work, available, mutationPending = false, onDelete, onConfirm, collapsedInitially = false, showType = true, onStartAudit, auditStarted = false }: VisitCardProps) {
  const manager = canManageAgenda(user);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState(!manager && !collapsedInitially);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [starting, setStarting] = useState(false);
  const confirmingRef = useRef(false);
  const startingRef = useRef(false);
  const deletingRef = useRef(false);
  const assignedAllowed = visit.auditorId === user.id
    && (user.role === "safety-auditor" || user.role === "quality-auditor")
    && canReadVisit(user, visit);
  const hasRevision = Number.isInteger(visit.revision) && (visit.revision ?? 0) > 0;
  const confirmAllowed = assignedAllowed && canReadVisit(user, visit) && visit.confirmationStatus === "pending_confirmation" && hasRevision;
  const startVisible = !!onStartAudit && assignedAllowed && visit.kind === "audit";
  const startAllowed = startVisible && available && canBeginScheduledAudit(user, visit, getSaoPauloToday());
  const auditorName = visit.auditorName ?? users.find((entry) => entry.id === visit.auditorId)?.name ?? (visit.auditorId === user.id ? user.name : visit.auditorId);
  const creatorName = visit.createdByName ?? users.find((entry) => entry.id === visit.createdBy)?.name ?? (visit.createdBy === user.id ? user.name : visit.createdBy);
  const [year, month, day] = visit.date.split("-");
  const visitLabel = visit.kind === "follow_up" ? `Acompanhamento da obra · ${moduleLabels[visit.module]}`
    : visit.modelId ? visitTypeLabels[visit.modelId] : "Auditoria";

  const deleteVisit = async () => {
    if (deletingRef.current || mutationPending) return;
    deletingRef.current = true;
    setDeleting(true);
    setError("");
    try {
      if (!available || !manager || !canReadVisit(user, visit) || !hasRevision || visit.revision === undefined) {
        throw new Error("A exclusão não está disponível para este agendamento.");
      }
      const result = await onDelete(visit.id, visit.revision);
      if (result.status !== "success") throw new Error(result.message);
      setConfirmDelete(false);
    } catch (cause) {
      setError(errorMessage(cause, "Não foi possível excluir o agendamento. Atualize a agenda e tente novamente."));
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  };

  const confirm = async () => {
    if (confirmingRef.current || mutationPending) return;
    confirmingRef.current = true;
    setConfirming(true);
    setError("");
    setSuccess("");
    try {
      if (!available || !confirmAllowed || visit.revision === undefined) throw new Error("A confirmação não está disponível para esta visita.");
      const result = await onConfirm(visit.id, visit.revision);
      if (result.status !== "success") throw new Error(result.message);
      setSuccess(result.message);
    } catch (cause) {
      setError(errorMessage(cause, "Não foi possível confirmar a visita. Tente novamente."));
    } finally {
      confirmingRef.current = false;
      setConfirming(false);
    }
  };

  const startAudit = async () => {
    if (!onStartAudit || startingRef.current || mutationPending || !startAllowed) return;
    startingRef.current = true;
    setStarting(true);
    setError("");
    try { await onStartAudit(visit); }
    catch (cause) { setError(errorMessage(cause, "Não foi possível iniciar a auditoria. Atualize a agenda e tente novamente.")); }
    finally { startingRef.current = false; setStarting(false); }
  };

  return <article className={styles.visitCard} data-visit-kind={visit.kind} aria-label={`${visitLabel} em ${formatAuditDate(visit.date)}`}>
    <details className={styles.visitDisclosure} open={expanded} onToggle={(event) => {
      setExpanded(event.currentTarget.open);
      if (!event.currentTarget.open) setConfirmDelete(false);
    }}>
      <summary className={styles.visitSummary}>
        <time className={`${styles.dateTile} ${visit.confirmationStatus === "confirmed" ? styles.dateTileConfirmed : styles.dateTilePending}`} dateTime={visit.date} aria-label={`${formatAuditDate(visit.date)}; ${visit.confirmationStatus === "confirmed" ? "visita confirmada" : "aguardando confirmação"}`}><strong>{day}</strong><span>{months[Number(month) - 1]} {year}</span></time>
        <span className={styles.visitTitle}>
          <strong>{work?.name ?? visit.workId}</strong>
          <span><small>Profissional responsável</small>{auditorName}</span>
          {showType && <span className={styles.visitType}>{visitLabel}</span>}
        </span>
        <span className={styles.expandIndicator} aria-hidden="true" />
      </summary>
      <div className={styles.visitExpanded}>
        {confirmAllowed && <div className={styles.visitActions}>
          <button type="button" className="primary" disabled={!available || mutationPending || confirming} onClick={() => { void confirm(); }}>{confirming ? "Confirmando…" : "Confirmar data"}</button>
        </div>}
        <div className={styles.visitAdminRow}>
          <dl className={styles.visitDetails}>
            <div><dt>AGENDAMENTO ADMINISTRATIVO</dt><dd>{creatorName}<small>Registrado em <time dateTime={visit.createdAt}>{formatRecordedAt(visit.createdAt)}</time></small></dd></div>
          </dl>
          {startVisible && <button type="button" className={`primary ${styles.startAuditButton}`} disabled={!startAllowed || mutationPending || starting} title={!available ? "Agenda indisponível" : visit.confirmationStatus !== "confirmed" ? "Confirme a data da visita antes de iniciar" : visit.date !== getSaoPauloToday() ? "Disponível somente na data agendada" : undefined} onClick={() => { void startAudit(); }}>{starting ? "Abrindo…" : auditStarted ? "Retomar auditoria" : "Iniciar auditoria"}</button>}
          {manager && <button type="button" className="secondary" disabled={!available || !hasRevision || mutationPending || deleting} aria-expanded={confirmDelete} onClick={() => { setConfirmDelete(!confirmDelete); setError(""); }}>{confirmDelete ? "Voltar" : "Excluir agendamento"}</button>}
        </div>
        {confirmDelete && manager && <div className={styles.deleteConfirmation}>
          <p>Excluir este agendamento da agenda de todos os perfis? A visita deixará de aparecer no calendário e nas notificações.</p>
          <button type="button" className="secondary" disabled={!available || mutationPending || deleting} onClick={() => { void deleteVisit(); }}>{deleting ? "Excluindo…" : "Confirmar exclusão"}</button>
        </div>}
        {visit.note && <p className={styles.visitNote}><strong>Observação: </strong>{visit.note}</p>}

        {error && <p role="alert" className={styles.error}>{error}</p>}
        {success && <p role="status" className={styles.success}>{success}</p>}
      </div>
    </details>
  </article>;
}

function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

function formatRecordedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Horário não informado" : new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function CalendarIcon() {
  return <span className={styles.calendarIcon} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 11h18M7 15h3M14 15h3" /></svg></span>;
}

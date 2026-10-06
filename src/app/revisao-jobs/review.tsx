"use client";
import { useState } from "react";
import { JobsPanel } from "@/app/components/jobs-panel";
import { ClosedReportPdf } from "@/app/components/follow-up-report-page";
import { readAgendaSpreadsheet } from "@/lib/agenda/spreadsheet-client";
export default function Review() {
  const [message, setMessage] = useState("");
  const [clicks, setClicks] = useState(0);
  return <main style={{ maxWidth: 1000, margin: "24px auto", padding: 16 }}>
    <h1>Processamentos — dados fictícios</h1><JobsPanel />
    <section className="panel"><ClosedReportPdf report={{ id: "aa000000-0000-4000-8000-000000000001" }} href="/api/review-pdf" autoDownload={false} message="Relatório salvo." /></section>
    <section className="panel"><h2>Importação local</h2><label>Planilha<input type="file" accept=".xlsx" onChange={async event => {
      const file = event.target.files?.[0]; if (!file) return;
      setMessage("Lendo planilha…");
      try { setMessage(`${(await readAgendaSpreadsheet(file)).length - 1} agendamentos lidos`); }
      catch (error) { setMessage((error as Error).message); }
    }} /></label><p role="status">{message}</p><button className="secondary" onClick={() => setClicks(n => n + 1)}>Interagir: {clicks}</button></section>
  </main>;
}

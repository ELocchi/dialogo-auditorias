"use client";
import { useEffect, useRef, useState } from "react";
import { validateSafetyClosure, type SafetyClosure, type SafetyAccident } from "@/domain/safety-audit";
import styles from "./safety-closure.module.css";
export function SafetyClosureDialog({ date, initial, onCancel, onConfirm }: { date: string; initial?: SafetyClosure; onCancel: () => void; onConfirm: (value: SafetyClosure) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [choice, setChoice] = useState<boolean | undefined>(initial?.hadAccidents);
  const [accidents, setAccidents] = useState<SafetyAccident[]>(initial?.accidents ?? []);
  const [error, setError] = useState("");
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  const add = () => setAccidents(current => [...current, { date: "", type: "common", event: "", justification: "" }]);
  const remove = (index: number) => {
    const remaining = accidents.filter((_, i) => i !== index);
    setAccidents(remaining);
    setError("");
    if (!remaining.length) setChoice(false);
  };
  const change = (index: number, field: keyof SafetyAccident, value: string) => setAccidents(current => current.map((a, i) => i === index ? { ...a, [field]: value } : a));
  return <dialog ref={dialog} className={styles.dialog} onCancel={e => { e.preventDefault(); onCancel(); }} aria-labelledby="accident-title">
    <form onSubmit={e => { e.preventDefault(); try { onConfirm(validateSafetyClosure({ hadAccidents: choice, accidents: choice ? accidents : [] }, date)); } catch (reason) { setError((reason as Error).message); } }}>
      <h2 id="accident-title">Acidentes na obra</h2>
      <fieldset><legend>Houve acidente na obra neste mês?</legend><div className={styles.choices}>
        {[false, true].map(value => <label key={String(value)} className={choice === value ? value ? styles.yes : styles.no : undefined}><input type="radio" name="hadAccidents" required checked={choice === value} onChange={() => { setChoice(value); setError(""); if (value && !accidents.length) add(); }} /><span>{value ? "Sim" : "Não"}</span></label>)}
      </div></fieldset>
      {choice && <>{!accidents.length && <div className={styles.accidentHeading}><strong>Acidentes</strong><button type="button" className={`primary ${styles.iconButton}`} aria-label="Adicionar acidente" title="Adicionar acidente" onClick={add}>+</button></div>}{accidents.map((a, i) => <fieldset key={i} className={styles.accident}>
        <legend className={styles.accidentLegend}><span className={styles.accidentHeading}><span>Acidente {i + 1}</span><span className={styles.headingActions}><button type="button" className={`primary ${styles.iconButton}`} aria-label="Adicionar acidente" title="Adicionar acidente" onClick={add} disabled={accidents.length >= 100}>+</button><button type="button" className={`secondary ${styles.iconButton} ${styles.removeButton}`} aria-label={`Remover acidente ${i + 1}`} title="Remover acidente" onClick={() => remove(i)}>×</button></span></span></legend>
        <div className={styles.row}><label>Data<input type="date" required value={a.date} min={`${date.slice(0, 7)}-01`} max={new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0, 12).toISOString().slice(0, 10)} onChange={e => change(i, "date", e.target.value)} /></label>
        <label>Tipo<select className="filter-select" value={a.type} onChange={e => change(i, "type", e.target.value)}><option value="common">Comum</option><option value="leave">Com afastamento</option></select></label></div>
        <label>Acontecimento<textarea required maxLength={10000} value={a.event} onChange={e => change(i, "event", e.target.value)} /></label>
        <label>Justificativa<textarea required maxLength={10000} value={a.justification} onChange={e => change(i, "justification", e.target.value)} /></label>
      </fieldset>)}</>}
      {error && <p role="alert">{error}</p>}
      <div className={styles.actions}><button type="button" className="secondary" onClick={onCancel}>Voltar</button><button type="submit" className="primary">Conferir relatório</button></div>
    </form>
  </dialog>;
}

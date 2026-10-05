"use client";
import { containDialogFocus } from "./dialog-keyboard";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";

export function AuditPhotoThumbnail({ file, label, onAdd, onDelete }: {
  file?: File; label: string; onAdd: () => void; onDelete: () => void;
}) {
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const url = preview?.file === file ? preview?.url : undefined;
  useEffect(() => {
    let cancelled = false;
    const nextUrl = file ? URL.createObjectURL(file) : null;
    queueMicrotask(() => { if (!cancelled) setPreview(file && nextUrl ? { file, url: nextUrl } : null); });
    return () => { cancelled = true; if (nextUrl) URL.revokeObjectURL(nextUrl); };
  }, [file]);
  const open = () => { setConfirmDelete(false); dialog.current?.showModal(); };
  const close = () => { dialog.current?.close(); trigger.current?.focus(); };
  return file && url ? <span className="audit-photo-menu-wrap">
    <button ref={trigger} type="button" className="audit-photo-thumbnail-button" onClick={open}
      onContextMenu={event => { event.preventDefault(); open(); }}
      aria-label={`Ver foto: ${label}`} data-tooltip="Ver foto e opções" aria-haspopup="dialog">
      <Image className="audit-photo-thumbnail" src={url} alt="" width={44} height={44} unoptimized />
    </button>
    <dialog onKeyDown={containDialogFocus} ref={dialog} className="audit-photo-dialog" aria-label={`Foto: ${label}`} onCancel={event => { event.preventDefault(); close(); }}>
      <div className="audit-photo-dialog-heading"><h2>Foto — {label}</h2><button autoFocus type="button" className="secondary" onClick={close} aria-label="Fechar foto" data-tooltip="Fechar foto">×</button></div>
      <Image src={url} alt={`Foto ampliada: ${label}`} width={1400} height={1050} unoptimized />
      {confirmDelete ? <div className="audit-photo-dialog-actions"><p>Excluir esta foto do preenchimento da auditoria?</p>
        <button autoFocus type="button" className="secondary" onClick={() => setConfirmDelete(false)}>Manter foto</button>
        <button type="button" className="secondary photo-delete" onClick={() => {
          // The thumbnail disappears after removal. Return to the add-photo
          // control in the same field, rather than leaving focus on the body.
          const field = trigger.current?.closest(".inline-photo-cell");
          close(); onDelete(); requestAnimationFrame(() => field?.querySelector<HTMLButtonElement>("button.inline-photo")?.focus());
        }}>Excluir foto</button></div>
        : <div className="audit-photo-dialog-actions"><button type="button" className="secondary" onClick={() => { close(); onAdd(); }}>Adicionar foto</button>
          <button type="button" className="secondary photo-delete" onClick={() => setConfirmDelete(true)}>Excluir foto</button></div>}
    </dialog>
  </span> : null;
}

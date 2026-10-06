"use client";

import { memo, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Image from "next/image";
import { formatAuditDate } from "@/domain/operational-records";
import type { AgendaActorContext } from "@/lib/agenda/contracts";
import { followUpPhotoThumbnailUrl } from "@/lib/photos/urls";
import type { SavedFollowUpFinding } from "@/lib/follow-up/display";
import { maxPhotoBytes, maxPhotosPerFinding } from "@/lib/follow-up/photos";
import { preparePhotoUpload } from "@/lib/photos/prepare-upload";
import type { WorkFinding } from "@/app/follow-up/actions";
import { EvidenceThumbnail } from "./evidence-thumbnail";
import { useFollowUpVisitPhotos, type useFollowUpPhotoStore } from "./use-follow-up-photos";
import styles from "./follow-up-workspace.module.css";

export function FollowUpPhotoPicker({ onSelect, disabled, previewUrl }: { onSelect: (file: File) => void; disabled: boolean; previewUrl?: string | null }) {
  const galleryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const operation = useRef<AbortController | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => () => operation.current?.abort(), []);
  const select = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || disabled || operation.current) return;
    const controller = new AbortController(); operation.current = controller;
    setPreparing(true); setError("");
    try {
      const prepared = await preparePhotoUpload(file, maxPhotoBytes, controller.signal);
      if (!controller.signal.aborted) onSelect(prepared);
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Não foi possível preparar a foto.");
    } finally {
      if (!controller.signal.aborted) setPreparing(false);
      if (operation.current === controller) operation.current = null;
    }
  };
  const blocked = disabled || preparing;
  return <div className={styles.photoPicker} aria-busy={preparing}>
    {!previewUrl && <div className={styles.photoControls}>
      <button type="button" className="secondary" disabled={blocked} onClick={() => galleryInput.current?.click()}>Escolher foto</button>
      <button type="button" className="secondary" disabled={blocked} onClick={() => cameraInput.current?.click()}>Tirar foto</button>
    </div>}
    <input ref={galleryInput} type="file" accept="image/jpeg,image/png" disabled={blocked} onChange={select} aria-label="Escolher foto" tabIndex={-1} style={{ display: "none" }} />
    <input ref={cameraInput} type="file" accept="image/jpeg,image/png" capture="environment" disabled={blocked} onChange={select} aria-label="Tirar foto" tabIndex={-1} style={{ display: "none" }} />
    {preparing && <p role="status">Preparando foto…</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {previewUrl && <Image className={styles.photoPreview} src={previewUrl} alt="Foto selecionada para o apontamento" width={640} height={480} unoptimized />}
  </div>;
}

export const FollowUpWorkFindingRow = memo(function FollowUpWorkFindingRow({ item, workName, actor, disabled, onComplete }: {
  item: WorkFinding; workName: string; actor: AgendaActorContext; disabled: boolean; onComplete: (id: string) => void;
}) {
  const original = `/app/acompanhamento/obras/${item.workId}/fotos/${item.photoFileName}`;
  return <li>
    <div className={styles.findingMedia}><EvidenceThumbnail thumbnailSrc={followUpPhotoThumbnailUrl(original, actor)} originalSrc={original} alt={`Foto de ${item.description}`} width={90} height={90}  /></div>
    <div className={styles.findingDetails}><strong>{item.description}{item.serious && <em className={styles.seriousBadge}>Item grave</em>}</strong><span>{workName}{item.location ? ` · ${item.location}` : ""}</span><p>Orientação: {item.correction}</p></div>
    <button type="button" className={`secondary ${styles.findingComplete}`} disabled={disabled} aria-label={`Concluir apontamento: ${item.description}`} data-tooltip="Concluir apontamento" onClick={() => onComplete(item.id)}>Concluir apontamento</button>
  </li>;
});

export const FollowUpSavedFindingRow = memo(function FollowUpSavedFindingRow({ item, actor, photoStore, disabled, onComplete, onUpload }: {
  item: SavedFollowUpFinding; actor: AgendaActorContext; photoStore: ReturnType<typeof useFollowUpPhotoStore>; disabled: boolean;
  onComplete: (visitId: string, findingId: string) => void;
  onUpload: (file: File, visitId: string, findingId: string) => Promise<boolean>;
}) {
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const upload = async (file: File) => {
    setSelectedPhoto(file);
    if (await onUpload(file, item.visitId, item.id)) setSelectedPhoto(null);
  };
  const { ref, status, photos, message, retry } = useFollowUpVisitPhotos(photoStore, item.visitId);
  const itemPhotos = useMemo(() => photos.filter((photo) => photo.findingId === item.id), [photos, item.id]);
  return <li ref={ref}>
    <div className={styles.findingMedia}>{status === "ready" ? itemPhotos.length ? itemPhotos.map((photo) => {
      const original = `/app/acompanhamento/fotos/${item.visitId}/${photo.fileName}`;
      return <EvidenceThumbnail thumbnailSrc={followUpPhotoThumbnailUrl(original, actor)} originalSrc={original} alt={`Foto de ${item.description}`} width={90} height={90}  key={photo.fileName} />;
    }) : <span>Sem foto</span> : status === "error" ? <span role="status">{message ?? "Não foi possível consultar a foto."}<button type="button" className="secondary" onClick={retry}>Recarregar foto</button></span> : <span role="status">Carregando foto…</span>}</div>
    <div className={styles.findingDetails}><strong>{item.description}{item.serious && <em className={styles.seriousBadge}>Item grave</em>}</strong><span>{item.workName} · {formatAuditDate(item.date)}{item.location ? ` · ${item.location}` : ""}</span><p>Orientação: {item.correction}</p>
      {status === "ready" && item.source === "saved" && itemPhotos.length < maxPhotosPerFinding && <div className={styles.addPhotoField}><strong>Adicionar foto</strong><FollowUpPhotoPicker disabled={disabled} onSelect={file => { void upload(file); }} />{selectedPhoto && <div><span>{selectedPhoto.name}</span><button type="button" className="secondary" disabled={disabled} onClick={() => { void upload(selectedPhoto); }}>{disabled ? "Enviando…" : "Tentar enviar"}</button></div>}</div>}
    </div>
    <button type="button" className={`secondary ${styles.findingComplete}`} disabled={disabled} aria-label={`Concluir apontamento: ${item.description}`} data-tooltip="Concluir apontamento" onClick={() => onComplete(item.visitId, item.id)}>Concluir apontamento</button>
  </li>;
});

"use client";

import { memo, useMemo, useRef, type ChangeEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Visit } from "@/domain/prototype-access";
import { formatAuditDate } from "@/domain/operational-records";
import type { AgendaActorContext } from "@/lib/agenda/contracts";
import { followUpPhotoThumbnailUrl } from "@/lib/photos/urls";
import type { SavedFollowUpFinding } from "@/lib/follow-up/display";
import { maxPhotosPerFinding } from "@/lib/follow-up/photos";
import type { WorkFinding } from "@/app/follow-up/actions";
import { EvidenceThumbnail } from "./evidence-thumbnail";
import { useFollowUpVisitPhotos, type useFollowUpPhotoStore } from "./use-follow-up-photos";
import styles from "./follow-up-workspace.module.css";

const monthNames = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
export function FollowUpPhotoPicker({ onSelect, disabled, previewUrl }: { onSelect: (file: File) => void; disabled: boolean; previewUrl?: string | null }) {
  const galleryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const select = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onSelect(file);
    event.target.value = "";
  };
  return <div className={styles.photoPicker}>
    {!previewUrl && <div className={styles.photoControls}>
      <button type="button" className="secondary" disabled={disabled} onClick={() => galleryInput.current?.click()}>Escolher foto</button>
      <button type="button" className="secondary" disabled={disabled} onClick={() => cameraInput.current?.click()}>Tirar foto</button>
    </div>}
    <input ref={galleryInput} type="file" accept="image/jpeg,image/png" disabled={disabled} onChange={select} aria-label="Escolher foto do dispositivo" tabIndex={-1} style={{ display: "none" }} />
    <input ref={cameraInput} type="file" accept="image/jpeg,image/png" capture="environment" disabled={disabled} onChange={select} aria-label="Tirar foto com a câmera" tabIndex={-1} style={{ display: "none" }} />
    {previewUrl && <Image className={styles.photoPreview} src={previewUrl} alt="Foto selecionada para o apontamento" width={640} height={480} unoptimized />}
  </div>;
}

export const FollowUpVisitRow = memo(function FollowUpVisitRow({ visit, workName, auditorName, reportCount, expanded, availableToCreate, hasFindings, onToggle }: {
  visit: Visit; workName?: string; auditorName: string; reportCount: number; expanded: boolean;
  availableToCreate: boolean; hasFindings: boolean; onToggle: (id: string) => void;
}) {
  const [year, month, day] = visit.date.split("-");
  const saved = reportCount > 0;
  return <article className={`${styles.visitCard}${expanded ? ` ${styles.expanded}` : ""}`}>
    <button type="button" className={styles.visitSummary} aria-expanded={expanded} aria-controls={`follow-up-details-${visit.id}`} onClick={() => onToggle(visit.id)}>
      <time dateTime={visit.date} className={`${styles.dateTile} ${visit.confirmationStatus === "confirmed" ? styles.dateTileConfirmed : styles.dateTilePending}`}><strong>{day}</strong><span>{monthNames[Number(month) - 1]} {year}</span></time>
      <span className={styles.visitInfo}><strong>{workName}</strong><span className={styles.professional}><small>Profissional responsável</small>{auditorName}</span>
        <span className={styles.visitType}>Acompanhamento da obra · {visit.module === "safety" ? "Segurança" : "Qualidade"}</span>
        {saved && <span className={styles.saved}>{reportCount} {reportCount === 1 ? "relatório salvo" : "relatórios salvos"}</span>}
      </span><span className={styles.expandIndicator} aria-hidden="true" />
    </button>
    {expanded && <div id={`follow-up-details-${visit.id}`} className={styles.visitDetails}>
      <span className={styles.visitStatus}>{visit.confirmationStatus === "confirmed" ? "Data confirmada" : "Aguardando confirmação da data"}</span>
      {saved || availableToCreate ? <Link className="primary" href={`/app/acompanhamento/relatorio/${visit.id}`}>Relatórios</Link>
        : <button type="button" className="primary" disabled title={visit.confirmationStatus !== "confirmed" ? "Confirme a data na Agenda" : !hasFindings ? "Registre um apontamento antes de criar o relatório" : "Disponível a partir da data agendada"}>Relatórios</button>}
    </div>}
  </article>;
});

export const FollowUpWorkFindingRow = memo(function FollowUpWorkFindingRow({ item, workName, actor, disabled, onComplete }: {
  item: WorkFinding; workName: string; actor: AgendaActorContext; disabled: boolean; onComplete: (id: string) => void;
}) {
  const original = `/app/acompanhamento/obras/${item.workId}/fotos/${item.photoFileName}`;
  return <li>
    <div className={styles.findingMedia}><a href={original} target="_blank" rel="noreferrer" aria-label="Abrir foto do apontamento"><EvidenceThumbnail thumbnailSrc={followUpPhotoThumbnailUrl(original, actor)} originalSrc={original} alt={`Foto de ${item.description}`} width={90} height={90} /></a></div>
    <div className={styles.findingDetails}><strong>{item.description}</strong><span>{workName}{item.location ? ` · ${item.location}` : ""}</span><p>Orientação: {item.correction}</p></div>
    <button type="button" className={`secondary ${styles.findingComplete}`} disabled={disabled} onClick={() => onComplete(item.id)}>Concluído</button>
  </li>;
});

export const FollowUpSavedFindingRow = memo(function FollowUpSavedFindingRow({ item, actor, photoStore, disabled, onComplete, onUpload }: {
  item: SavedFollowUpFinding; actor: AgendaActorContext; photoStore: ReturnType<typeof useFollowUpPhotoStore>; disabled: boolean;
  onComplete: (visitId: string, findingId: string) => void;
  onUpload: (file: File, visitId: string, findingId: string) => void;
}) {
  const { ref, status, photos, message, retry } = useFollowUpVisitPhotos(photoStore, item.visitId);
  const itemPhotos = useMemo(() => photos.filter((photo) => photo.findingId === item.id), [photos, item.id]);
  return <li ref={ref}>
    <div className={styles.findingMedia}>{status === "ready" ? itemPhotos.length ? itemPhotos.map((photo) => {
      const original = `/app/acompanhamento/fotos/${item.visitId}/${photo.fileName}`;
      return <a key={photo.fileName} href={original} target="_blank" rel="noreferrer" aria-label="Abrir foto do apontamento"><EvidenceThumbnail thumbnailSrc={followUpPhotoThumbnailUrl(original, actor)} originalSrc={original} alt={`Foto de ${item.description}`} width={90} height={90} /></a>;
    }) : <span>Sem foto</span> : status === "error" ? <span role="status">{message ?? "Não foi possível consultar a foto."}<button type="button" className="secondary" onClick={retry}>Tentar novamente</button></span> : <span role="status">Carregando foto…</span>}</div>
    <div className={styles.findingDetails}><strong>{item.description}</strong><span>{item.workName} · {formatAuditDate(item.date)}{item.location ? ` · ${item.location}` : ""}</span><p>Orientação: {item.correction}</p>
      {status === "ready" && item.source === "saved" && itemPhotos.length < maxPhotosPerFinding && <div className={styles.addPhotoField}><strong>Adicionar foto</strong><FollowUpPhotoPicker disabled={disabled} onSelect={(file) => onUpload(file, item.visitId, item.id)} /></div>}
    </div>
    <button type="button" className={`secondary ${styles.findingComplete}`} disabled={disabled} onClick={() => onComplete(item.visitId, item.id)}>Concluído</button>
  </li>;
});

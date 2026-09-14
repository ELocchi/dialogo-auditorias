"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "../ui-icon";
import styles from "./admin-notifications.module.css";

export type AdminNotification = {
  id: string;
  type: "visit_scheduled" | "visit_confirmation_requested" | "visit_confirmed" | "audit_published";
  workName: string;
  createdAt: string;
  detail?: string;
  href?: string;
};

const labels: Record<AdminNotification["type"], string> = {
  visit_scheduled: "Visita agendada",
  visit_confirmation_requested: "Confirmação de visita solicitada",
  visit_confirmed: "Visita confirmada",
  audit_published: "Auditoria publicada",
};
const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

function timestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function NotificationContent({ item }: { item: AdminNotification }) {
  const date = Date.parse(item.createdAt);
  return <>
    <span className={styles.itemIcon}>
      <Icon name={item.type === "audit_published" ? "report" : "calendar"} />
    </span>
    <span className={styles.itemContent}>
      <strong>{labels[item.type]}</strong>
      <span className={styles.workName}>{item.workName}</span>
      {item.detail && <span className={styles.detail}>{item.detail}</span>}
      {Number.isFinite(date) && <time dateTime={item.createdAt}>{dateFormatter.format(date)}</time>}
    </span>
  </>;
}

export function AdminNotifications({ items = [], onNavigateAgenda }: {
  items?: readonly AdminNotification[];
  onNavigateAgenda?: (item: AdminNotification) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const headingId = useId();
  const sortedItems = [...items].sort((left, right) => timestamp(right.createdAt) - timestamp(left.createdAt));
  const countLabel = items.length === 1 ? "1 notificação" : `${items.length} notificações`;

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismissOutside);
    return () => document.removeEventListener("pointerdown", dismissOutside);
  }, [open]);

  return <div ref={rootRef} className={styles.root}
    onBlur={(event) => {
      if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}
    onKeyDown={(event) => {
      if (event.key === "Escape" && open) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }}>
    <button ref={triggerRef} type="button" className={styles.trigger}
      aria-label={items.length ? `Notificações, ${countLabel}` : "Notificações"}
      aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((previous) => !previous)}>
      <Icon name="bell" />
      {items.length > 0 && <span className={styles.count} aria-hidden="true">{items.length > 99 ? "99+" : items.length}</span>}
    </button>
    <section id={panelId} className={styles.panel} aria-labelledby={headingId} hidden={!open}>
      <div className={styles.heading}>
        <h2 id={headingId}>Notificações</h2>
        <p>Agendamentos, confirmações e auditorias publicadas</p>
      </div>
      {sortedItems.length ? <ul className={styles.list}>
        {sortedItems.map((item) => <li key={`${item.type}:${item.id}`}>
          {item.type !== "audit_published" || item.href
            ? <a className={styles.item} href={item.href ?? "/app?secao=agenda"}
              onClick={(event) => {
                if (item.type === "audit_published" || !onNavigateAgenda || event.defaultPrevented
                  || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                setOpen(false);
                triggerRef.current?.focus();
                onNavigateAgenda(item);
              }}><NotificationContent item={item} /></a>
            : <div className={styles.item}><NotificationContent item={item} /></div>}
        </li>)}
      </ul> : <p className={styles.empty}>Nenhuma notificação no momento.</p>}
    </section>
  </div>;
}

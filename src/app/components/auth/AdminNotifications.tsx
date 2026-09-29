"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
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

const readStorageKey = (userId: string) => `dialogo-auditorias:notifications-read:${userId}`;
const dismissedStorageKey = (userId: string) => `dialogo-auditorias:notifications-dismissed:${userId}`;
const notificationKey = (item: AdminNotification) => `${item.type}:${item.id}`;
const emptyNotifications: readonly AdminNotification[] = [];
const readChangeEvent = "dialogo-auditorias:notifications-read-changed";
const dismissedChangeEvent = "dialogo-auditorias:notifications-dismissed-changed";

function storedSnapshot(key: string) {
  try { return localStorage.getItem(key) ?? "[]"; } catch { return "[]"; }
}

function parseReadKeys(snapshot: string): Set<string> {
  try {
    const value: unknown = JSON.parse(snapshot);
    return new Set(Array.isArray(value) ? value.filter((key): key is string => typeof key === "string" && key.length <= 200) : []);
  } catch { return new Set(); }
}

function sameKeys(left: Set<string>, right: Set<string>) {
  return left.size === right.size && [...left].every((key) => right.has(key));
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

export function AdminNotifications({ items = emptyNotifications, userId, loading = false, error, onOpenChange, onNavigateAgenda }: {
  items?: readonly AdminNotification[];
  userId: string;
  loading?: boolean;
  error?: string;
  onOpenChange?: (open: boolean) => void;
  onNavigateAgenda?: (item: AdminNotification) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const headingId = useId();
  const subscribeReadKeys = useCallback((onChange: () => void) => {
    const onStorage = (event: StorageEvent) => { if (event.key === readStorageKey(userId)) onChange(); };
    const onLocalChange = (event: Event) => {
      if (event instanceof CustomEvent && event.detail === userId) onChange();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(readChangeEvent, onLocalChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(readChangeEvent, onLocalChange);
    };
  }, [userId]);
  const subscribeDismissedKeys = useCallback((onChange: () => void) => {
    const onStorage = (event: StorageEvent) => { if (event.key === dismissedStorageKey(userId)) onChange(); };
    const onLocalChange = (event: Event) => {
      if (event instanceof CustomEvent && event.detail === userId) onChange();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(dismissedChangeEvent, onLocalChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(dismissedChangeEvent, onLocalChange);
    };
  }, [userId]);
  const getReadSnapshot = useCallback(() => storedSnapshot(readStorageKey(userId)), [userId]);
  const getDismissedSnapshot = useCallback(() => storedSnapshot(dismissedStorageKey(userId)), [userId]);
  const snapshot = useSyncExternalStore(subscribeReadKeys, getReadSnapshot, () => "[]");
  const dismissedSnapshot = useSyncExternalStore(subscribeDismissedKeys, getDismissedSnapshot, () => "[]");
  const readKeys = useMemo(() => parseReadKeys(snapshot), [snapshot]);
  const dismissedKeys = useMemo(() => parseReadKeys(dismissedSnapshot), [dismissedSnapshot]);
  const visibleItems = useMemo(() => items.filter((item) => !dismissedKeys.has(notificationKey(item))), [items, dismissedKeys]);
  const sortedItems = [...visibleItems].sort((left, right) => timestamp(right.createdAt) - timestamp(left.createdAt));
  const unreadCount = visibleItems.filter((item) => !readKeys.has(notificationKey(item))).length;
  const countLabel = unreadCount === 1 ? "1 notificação não lida" : `${unreadCount} notificações não lidas`;

  const markVisibleRead = useCallback(() => {
    const stored = parseReadKeys(storedSnapshot(readStorageKey(userId)));
    const next = new Set([...stored, ...visibleItems.map(notificationKey)]);
    if (sameKeys(next, stored)) return;
    try {
      localStorage.setItem(readStorageKey(userId), JSON.stringify([...next]));
      window.dispatchEvent(new CustomEvent(readChangeEvent, { detail: userId }));
    } catch { /* Browser storage may be unavailable. */ }
  }, [visibleItems, userId]);

  const dismissNotification = (item: AdminNotification) => {
    const stored = parseReadKeys(storedSnapshot(dismissedStorageKey(userId)));
    stored.add(notificationKey(item));
    try {
      localStorage.setItem(dismissedStorageKey(userId), JSON.stringify([...stored]));
      window.dispatchEvent(new CustomEvent(dismissedChangeEvent, { detail: userId }));
    } catch { /* Browser storage may be unavailable. */ }
  };

  useEffect(() => {
    if (open) markVisibleRead();
  }, [open, markVisibleRead]);

  useEffect(() => { onOpenChange?.(open); }, [open, onOpenChange]);

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
      aria-label={unreadCount ? `Notificações, ${countLabel}` : "Notificações"}
      aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((previous) => !previous)}>
      <Icon name="bell" />
      {unreadCount > 0 && <span className={styles.count} aria-hidden="true">{unreadCount > 99 ? "99+" : unreadCount}</span>}
    </button>
    <section id={panelId} className={styles.panel} aria-labelledby={headingId} hidden={!open}>
      <div className={styles.heading}>
        <h2 id={headingId}>Notificações</h2>
      </div>
      {loading && <p className={styles.empty} role="status">Carregando notificações…</p>}
      {error && <p className={styles.empty} role="alert">{error}</p>}
      {sortedItems.length ? <ul className={styles.list}>
        {sortedItems.map((item) => <li key={`${item.type}:${item.id}`}>
          {item.type !== "audit_published" || item.href
            ? <a className={styles.item} href={item.href ?? "/app?secao=agenda"}
              onClick={(event) => {
                dismissNotification(item);
                if (item.type === "audit_published" || !onNavigateAgenda || event.defaultPrevented
                  || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                setOpen(false);
                triggerRef.current?.focus();
                onNavigateAgenda(item);
              }}><NotificationContent item={item} /></a>
            : <button type="button" className={`${styles.item} ${styles.itemButton}`}
              onClick={() => dismissNotification(item)}><NotificationContent item={item} /></button>}
        </li>)}
      </ul> : !loading && !error && <p className={styles.empty}>Nenhuma notificação no momento.</p>}
    </section>
  </div>;
}

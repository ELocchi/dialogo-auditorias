"use client";

import { useEffect, useId, useRef, useState } from "react";
import { LogoutButton } from "./LogoutButton";
import styles from "./user-menu.module.css";

export function UserMenu({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

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
      // A pending logout can disable its button without moving focus to another
      // control. Keep the form mounted so any failure stays visible.
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
    <button ref={triggerRef} type="button" className={`summary-item ${styles.trigger}`}
      aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((previous) => !previous)}>
      <span>USUÁRIO</span><strong>{name}</strong><span className={styles.chevron} aria-hidden="true" />
    </button>
    <nav id={panelId} className={styles.panel} aria-label="Opções do usuário" hidden={!open}>
      <a href="/escolher-perfil">Trocar perfil</a>
      <a href="/minha-conta">Meus acessos</a>
      <LogoutButton />
    </nav>
  </div>;
}

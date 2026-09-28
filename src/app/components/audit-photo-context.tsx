"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AuditDrafts } from "@/domain/audit-draft";
import { createAuditPhotoStore, type AuditPhotoStore } from "@/lib/audits/photo-store";

const AuditPhotoContext = createContext<AuditPhotoStore | null>(null);

export function AuditPhotoProvider({ responses, children }: { responses: Record<string, AuditDrafts>; children: ReactNode }) {
  const [store] = useState(() => createAuditPhotoStore(Object.values(responses)));
  useEffect(() => { store.retainDrafts(Object.values(responses)); }, [responses, store]);
  useEffect(() => () => store.clear(), [store]);
  return <AuditPhotoContext value={store}>{children}</AuditPhotoContext>;
}

export function useAuditPhotoStore(): AuditPhotoStore {
  const store = useContext(AuditPhotoContext);
  if (!store) throw new Error("As fotos precisam do contexto da área de auditorias.");
  return store;
}

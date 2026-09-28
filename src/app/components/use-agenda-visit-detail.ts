"use client";

import { useEffect, useEffectEvent, useState } from "react";
import type { DemoUser, Visit } from "@/domain/prototype-access";
import { agendaDetailKey, fetchAgendaVisitDetail } from "@/lib/agenda/detail-client";

/** The result lives only with this mounted card and its current actor/revision. */
export function useAgendaVisitDetail(visit: Visit, user: DemoUser, expanded: boolean, available: boolean) {
  const key = agendaDetailKey(user, visit);
  const compact = visit.detailsLoaded === false;
  const [result, setResult] = useState<{ key: string; detail?: Visit; error?: string } | null>(null);
  // A changed actor/revision or failed workspace refresh invalidates private
  // detail. Returning must reauthorize instead of revealing an old note.
  if (result !== null && (!available || result.key !== key)) setResult(null);
  const current = result?.key === key ? result : null;
  const settled = current !== null;
  // The semantic key controls when a read is replaced. Equivalent snapshot
  // objects from polling must not restart an in-flight request.
  const readDetail = useEffectEvent((signal: AbortSignal) => fetchAgendaVisitDetail(visit, user, signal));
  useEffect(() => {
    if (!compact || !expanded || !available || settled) return;
    let active = true;
    const controller = new AbortController();
    // Deferring one microtask avoids a discarded request during StrictMode setup.
    void Promise.resolve().then(async () => {
      if (!active) return;
      try {
        const detail = await readDetail(controller.signal);
        if (active) setResult({ key, detail });
      } catch (cause) {
        if (active) setResult({ key, error: cause instanceof Error ? cause.message : "Não foi possível carregar a observação." });
      }
    });
    return () => { active = false; controller.abort(); };
  }, [available, compact, expanded, key, settled]);
  return {
    note: compact ? available ? current?.detail?.note ?? "" : "" : visit.note,
    loading: compact && available && !settled,
    error: compact ? available ? current?.error : "Agenda indisponível. Atualize a página para consultar os detalhes." : undefined,
    retry: () => setResult(null),
  };
}

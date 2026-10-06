"use client";
import { useEffect, useState } from "react";
import { requestSignal } from "@/lib/request-signal";

export function usePageResource<T>(url: string, validate: (value: unknown) => value is T, enabled = true) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ url: string; attempt: number; data: T | null; error: boolean } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void fetch(url, { cache: "no-store", credentials: "same-origin", signal: requestSignal(controller.signal) })
      .then(async response => { if (!response.ok) throw new Error("Page unavailable"); const data: unknown = await response.json();
        if (!validate(data)) throw new Error("Invalid page");
        if (!controller.signal.aborted) setResult({ url, attempt, data, error: false });
      }).catch(() => { if (!controller.signal.aborted) setResult({ url, attempt, data: null, error: true }); });
    return () => controller.abort();
  }, [url, attempt, validate, enabled]);
  const loading = enabled && (result?.url !== url || result.attempt !== attempt);
  return { loading, error: !loading && result?.url === url && result.error, data: result?.url === url ? result.data : null,
    retry: () => setAttempt(n => n + 1) };
}

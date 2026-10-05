"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./evidence-thumbnail.module.css";

/** The retry button is a sibling of the photo link, never nested inside it. */
export function EvidenceThumbnail({ thumbnailSrc, originalSrc, alt, width, height, className, caption }: {
  thumbnailSrc?: string; originalSrc: string; alt: string; width: number; height: number;
  className?: string; caption?: ReactNode;
}) {
  const [attempt, setAttempt] = useState(0);
  const [visible, setVisible] = useState(false);
  const container = useRef<HTMLSpanElement>(null);
  const [result, setResult] = useState<{ key: string; failed: boolean } | null>(null);
  const key = JSON.stringify([thumbnailSrc, originalSrc, attempt]);
  const loading = result?.key !== key;
  const failed = !loading && result?.failed;
  let src = thumbnailSrc ?? originalSrc;
  if (attempt && !/^(blob:|data:)/.test(src)) src += `${src.includes("?") ? "&" : "?"}retry=${attempt}`;
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      const timer = window.setTimeout(() => setVisible(true), 0);
      return () => window.clearTimeout(timer);
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "400px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    // Lazy images outside the viewport have not started a request yet.
    if (!loading || !visible) return;
    const timer = window.setTimeout(() => setResult({ key, failed: true }), 20_000);
    return () => window.clearTimeout(timer);
  }, [key, loading, visible]);
  return <span ref={container} className={styles.container} data-evidence-thumbnail>
    <a className={className} href={originalSrc} target="_blank" rel="noopener noreferrer" data-tooltip="Foto em nova guia" aria-label={`Abrir foto: ${alt}`}>
      <span className={styles.frame} style={{ width, height, maxWidth: "100%" }}>
        {loading && <span role="status" className={styles.placeholder}>Carregando foto…</span>}
        {failed ? <span className={styles.unavailable} role="status">Foto indisponível</span> : <Image key={key} src={src} alt={alt} width={width} height={height} unoptimized
          onLoad={() => setResult({ key, failed: false })} onError={() => setResult({ key, failed: true })} />}
      </span>
      {caption}
    </a>
    {(failed || attempt > 0) && <button type="button" disabled={loading} className={styles.retry} aria-label={`Recarregar foto: ${alt}`} onClick={() => setAttempt(value => value + 1)}>Recarregar</button>}
  </span>;
}

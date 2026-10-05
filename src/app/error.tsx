"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return <main style={{ maxWidth: 720, margin: "32px auto", padding: 16 }}>
    <section className="panel">
      <h2>Não foi possível abrir a página</h2>
      <p role="alert">Confira a conexão e tente novamente.</p>
      <button className="primary" disabled={pending} onClick={() => startTransition(() => { router.refresh(); reset(); })}>{pending ? "Carregando…" : "Tentar novamente"}</button>
    </section>
  </main>;
}

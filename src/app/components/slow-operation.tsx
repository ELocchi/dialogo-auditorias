"use client";

import { useEffect, useState } from "react";

function PendingOperation() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 12_000);
    return () => window.clearTimeout(timer);
  }, []);
  return <span role="status">{slow ? "Ainda aguardando confirmação. Mantenha esta página aberta." : ""}</span>;
}

/** An unconfirmed write must not be unlocked or repeated just because it is slow. */
export function SlowOperation({ pending }: { pending: boolean }) {
  return pending ? <PendingOperation /> : null;
}

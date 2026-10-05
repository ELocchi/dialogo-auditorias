"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps } from "react";

export function PendingSubmit({ children, disabled, ...props }: ComponentProps<"button">) {
  const { pending } = useFormStatus();
  return <button {...props} disabled={disabled || pending} aria-busy={pending}>
    {children}{pending && <span role="status">Abrindo…</span>}
  </button>;
}

"use client";

import { unstable_rethrow } from "next/navigation";

/** Preserve the form on transport failures. Never turn a Next redirect into an error. */
export function recoverAction<S extends { status: string; message: string }>(action: (previous: S, form: FormData) => Promise<S>) {
  return async (previous: S, form: FormData): Promise<S> => {
    try { return await action(previous, form); }
    catch (reason) {
      unstable_rethrow(reason);
      return { ...previous, status: "error", message: "Não foi possível confirmar a operação. Seus dados foram mantidos. Confira a conexão e tente novamente." };
    }
  };
}

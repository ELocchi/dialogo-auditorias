/** Bound network failures without logging URLs, credentials or provider bodies. */
export const supabaseFetch: typeof fetch = async (input, init) => {
  try {
    const timeout = AbortSignal.timeout(15_000);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return await fetch(input, { ...init, cache: "no-store", signal });
  } catch {
    throw new Error("Serviço de autenticação indisponível.");
  }
};

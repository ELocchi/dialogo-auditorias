/** Bound network reads without confusing a deadline with cancellation by the caller.
 * Keep this signal attached while consuming the body, too. Mutations are never retried here.
 */
export function requestSignal(signal?: AbortSignal | null, milliseconds = 20_000): AbortSignal {
  const deadline = AbortSignal.timeout(milliseconds);
  return signal ? AbortSignal.any([signal, deadline]) : deadline;
}

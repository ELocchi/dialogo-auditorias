/** Only for reads: a timed-out mutation may still commit and must not be replayed blindly. */
export async function readWithDeadline<T>(read: Promise<T>, milliseconds = 20_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([read, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("A consulta demorou. Tente novamente.")), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

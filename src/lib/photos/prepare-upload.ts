const maximumOriginalBytes = 40 * 1024 * 1024;
const maximumDimension = 2400;

/** Prepare a copy in the browser; the original file and server limits are unchanged. */
export async function preparePhotoUpload(file: File, maximumBytes: number, signal?: AbortSignal): Promise<File> {
  signal?.throwIfAborted();
  if (!file.size) throw new Error("A foto está vazia. Escolha outra.");
  if (file.size > maximumOriginalBytes) throw new Error("Escolha uma foto de até 40 MB.");
  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const jpeg = header[0] === 255 && header[1] === 216 && header[2] === 255;
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => header[index] === byte);
  if (!jpeg && !png) throw new Error("Escolha uma foto JPG ou PNG.");
  const type = jpeg ? "image/jpeg" : "image/png";
  signal?.throwIfAborted();
  if (file.size <= maximumBytes) return file.type === type ? file : new File([file], file.name, { type, lastModified: file.lastModified });

  const url = URL.createObjectURL(file);
  const image = new Image();
  const canvas = document.createElement("canvas");
  try {
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer); signal?.removeEventListener("abort", aborted);
        image.onload = null; image.onerror = null;
        if (error) reject(error); else resolve();
      };
      const aborted = () => finish(new DOMException("Operação cancelada", "AbortError"));
      const timer = setTimeout(() => finish(new Error("A foto demorou para abrir. Tente novamente.")), 15000);
      image.onload = () => finish();
      image.onerror = () => finish(new Error("Não foi possível abrir a foto. Escolha outra."));
      signal?.addEventListener("abort", aborted, { once: true });
      image.src = url;
    });
    signal?.throwIfAborted();
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 60_000_000)
      throw new Error("A resolução da foto é muito alta. Exporte uma cópia menor.");
    const scale = Math.min(1, maximumDimension / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar a foto. Tente outro navegador.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.88, 0.78, 0.68]) {
      signal?.throwIfAborted();
      const blob = await new Promise<Blob>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("A foto demorou para preparar. Tente novamente.")), 15000);
        canvas.toBlob(value => {
          clearTimeout(timer);
          if (value) resolve(value); else reject(new Error("Não foi possível preparar a foto. Escolha outra."));
        }, "image/jpeg", quality);
      });
      signal?.throwIfAborted();
      if (blob.size > 0 && blob.size <= maximumBytes) {
        return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "foto"}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
      }
    }
    throw new Error("A foto continua muito grande. Escolha uma versão menor.");
  } finally {
    image.src = "";
    URL.revokeObjectURL(url);
    canvas.width = 1; canvas.height = 1;
  }
}

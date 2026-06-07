// Lightweight client-side image compression using canvas (no extra deps).
// Resizes to a max edge and re-encodes as JPEG at the given quality.
export async function compressImage(
  file: File,
  opts: { maxEdge?: number; quality?: number } = {},
): Promise<File> {
  const maxEdge = opts.maxEdge ?? 1200;
  const quality = opts.quality ?? 0.8;

  if (!file.type.startsWith("image/")) return file;
  // Skip tiny files — re-encoding can make them larger.
  if (file.size < 200 * 1024) return file;

  try {
    const bitmap = await createImageBitmap(file).catch(() => null);
    let width: number;
    let height: number;
    let source: CanvasImageSource;

    if (bitmap) {
      width = bitmap.width;
      height = bitmap.height;
      source = bitmap;
    } else {
      const url = URL.createObjectURL(file);
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = reject;
          el.src = url;
        });
        width = img.naturalWidth;
        height = img.naturalHeight;
        source = img;
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    const scale = Math.min(1, maxEdge / Math.max(width, height));
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(source, 0, 0, w, h);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob || blob.size >= file.size) return file;

    const base = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${base}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}
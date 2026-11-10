/**
 * Préparation des images avant l'envoi : réduction à une taille raisonnable pour que la page
 * reste rapide et que l'envoi soit léger, même avec une connexion mobile.
 */
export interface ShrinkOptions {
  /** Taille maximale du plus grand côté, en pixels. */
  maxSide: number;
  type: 'image/jpeg' | 'image/png';
  quality?: number;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('conversion impossible'))), type, quality));
}

export async function shrinkImage(file: File, { maxSide, type, quality = 0.85 }: ShrinkOptions): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas indisponible');
  // Le JPEG n'a pas de transparence : fond blanc plutôt que noir
  if (type === 'image/jpeg') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let out = await toBlob(canvas, type, quality);
  // Un logo PNG trop lourd repasse en JPEG plutôt que d'être refusé par le serveur
  if (type === 'image/png' && out.size > 1.8 * 1024 * 1024) {
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    out = await toBlob(canvas, 'image/jpeg', 0.85);
  }
  return out;
}

export function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

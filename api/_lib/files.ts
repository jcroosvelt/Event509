// Contrôle des fichiers envoyés. Le type annoncé par le navigateur n'est jamais cru :
// on lit les premiers octets, et seuls JPEG, PNG, WebP (et PDF pour la vérification) sont acceptés.

export type FileKind = 'event_cover' | 'org_logo' | 'verification';
export const DOC_TYPES = ['id', 'license', 'bank', 'selfie', 'registration', 'representation'] as const;

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_PDF_BYTES = 3 * 1024 * 1024;

export function sniff(b: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf' | null {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 12 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (b.length > 8 && b.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return null;
}

/** Nom d'affichage sûr : pas de chemin, pas de caractères de contrôle, 80 caractères au plus. */
export function safeName(name: unknown) {
  const n = typeof name === 'string' ? name : '';
  // eslint-disable-next-line no-control-regex
  return n.replace(/[\\/\u0000-\u001f]/g, '_').trim().slice(0, 80) || 'fichier';
}

/** Vérifie un fichier pour un usage donné. Renvoie le type réel, ou un message d'erreur. */
export function checkFile(kind: FileKind, data: Buffer): { mime: string } | { error: string } {
  const mime = sniff(data);
  if (!mime) return { error: 'Format non pris en charge : envoyez une image JPG, PNG ou WebP' + (kind === 'verification' ? ' ou un PDF' : '') };
  if (mime === 'application/pdf') {
    if (kind !== 'verification') return { error: 'Un PDF n’est pas accepté ici : envoyez une image' };
    if (data.length > MAX_PDF_BYTES) return { error: 'Fichier trop lourd : 3 Mo maximum' };
  } else if (data.length > MAX_IMAGE_BYTES) return { error: 'Image trop lourde : 2 Mo maximum' };
  return { mime };
}

/** Valeur acceptée pour l'image d'un événement : dégradé, fichier du site ou adresse https. */
export function validCover(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 600 && (/^(linear|radial)-gradient\([^;{}<>]*\)$/.test(v) || /^\/api\/files\/[\w-]{6,40}$/.test(v) || /^https:\/\/[^\s"'<>]+$/.test(v));
}

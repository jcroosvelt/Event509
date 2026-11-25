import { createHash, randomBytes } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { all, one, tx, db } from './db.js';
import { claimOnce, notifyAllDevices } from './push.js';
import type { Ctx, UserRow } from './routes.js';

/**
 * Application Android hébergée par la plateforme : l'administrateur téléverse l'APK dans l'espace d'administration, il est
 * stocké dans la base (en morceaux) et remplace l'ancien, qui est effacé. Le site le sert (/app/event509.apk, reprise de
 * téléchargement possible) et publie sa fiche de version (/app/version.json) : plus aucun passage par GitHub.
 *
 * Le numéro et le nom de version sont lus DANS l'APK (manifeste binaire), jamais saisis à la main : impossible de publier un
 * fichier dont le numéro ne correspond pas. Seul un APK de l'application EVENT509 (identifiant ci-dessous) est accepté.
 */

export const APP_PACKAGE = 'com.event509.event509_app';
/**
 * Empreinte SHA-256 du certificat de signature de l'application (information publique, pas un secret). Un APK signé par une autre
 * clé est refusé : même avec un compte administrateur volé, personne ne peut faire distribuer une autre application sous ce nom.
 * Changement de clé : renseigner APP_SIGNER_SHA256 dans Vercel (sans toucher au code).
 */
const DEFAULT_SIGNER_SHA256 = '7970e03c5b99e76f3a5b1fd1cf3339c9eea7db558cd2132c4d7924ad80bf2fd2';
export const expectedSigner = () => (process.env.APP_SIGNER_SHA256 ?? DEFAULT_SIGNER_SHA256).replace(/[^0-9a-f]/gi, '').toLowerCase();
/** Taille d'un morceau envoyé (octets bruts) : une fois en base64, il reste sous la limite de 4,5 Mo d'une requête Vercel. */
export const CHUNK_BYTES = 2_500_000;
export const MIN_APK_BYTES = 200_000;
export const MAX_APK_BYTES = 80_000_000;
const MAX_CHUNKS = Math.ceil(MAX_APK_BYTES / CHUNK_BYTES) + 1;

/** Version servie tant qu'aucun APK n'a été téléversé (dernière version publiée avant ce système, via GitHub). */
export const FALLBACK_RELEASE = {
  versionCode: 72, versionName: '1.72.0', size: 29821039,
  sha256: '31c0e880af39957ee55ef6ca47a1c4bac34c34c52a0e8f28361f7d9d685ea8b7', date: '2026-11-19', minAndroid: '7.0', file: '/app/event509.apk',
};
const FALLBACK_URL = 'https://github.com/jcroosvelt/Event509/releases/latest/download/event509.apk';

// ---------- Lecture du manifeste d'un APK ----------

export interface ApkInfo { packageName: string; versionCode: number; versionName: string }

/** Contenu (décompressé) d'une entrée d'une archive ZIP, ou null. Seul le répertoire central est lu : rien n'est exécuté. */
function zipEntry(zip: Buffer, wanted: string): Buffer | null {
  const min = Math.max(0, zip.length - 65_557);
  let eocd = -1;
  for (let i = zip.length - 22; i >= min; i--) if (zip.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return null;
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  for (let n = 0; n < count && p + 46 <= zip.length; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) return null;
    const method = zip.readUInt16LE(p + 10);
    const csize = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const name = zip.toString('utf8', p + 46, p + 46 + nameLen);
    if (name === wanted) {
      if (local + 30 > zip.length || zip.readUInt32LE(local) !== 0x04034b50) return null;
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const raw = zip.subarray(start, start + csize);
      if (method === 0) return raw;
      if (method === 8) {
        try { return inflateRawSync(raw, { maxOutputLength: 5_000_000 }); } catch { return null; }
      }
      return null;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

/** Lit l'identifiant, le numéro et le nom de version dans AndroidManifest.xml (format binaire d'Android). */
export function readApk(apk: Buffer): ApkInfo | null {
  try {
    if (apk.length < 100 || apk.readUInt32LE(0) !== 0x04034b50) return null;
    const xml = zipEntry(apk, 'AndroidManifest.xml');
    if (!xml || xml.readUInt16LE(0) !== 0x0003) return null;
    let strings: string[] = [];
    let resIds: number[] = [];
    let p = xml.readUInt16LE(2);
    while (p + 8 <= xml.length) {
      const type = xml.readUInt16LE(p);
      const size = xml.readUInt32LE(p + 4);
      if (size < 8 || p + size > xml.length) return null;
      if (type === 0x0001) {
        const count = xml.readUInt32LE(p + 8);
        const utf8 = (xml.readUInt32LE(p + 16) & 0x100) !== 0;
        const base = p + xml.readUInt32LE(p + 20);
        const table = p + xml.readUInt16LE(p + 2);
        strings = [];
        for (let i = 0; i < count; i++) {
          let o = base + xml.readUInt32LE(table + i * 4);
          if (utf8) {
            let l = xml[o]!; o += (l & 0x80) ? 2 : 1;
            l = xml[o]!; o += 1; // octets : longueur sur 1 ou 2 octets
            const byteLen = (l & 0x80) ? ((l & 0x7f) << 8) | xml[o++]! : l;
            strings.push(xml.toString('utf8', o, o + byteLen));
          } else {
            let l = xml.readUInt16LE(o); o += 2;
            if (l & 0x8000) { l = ((l & 0x7fff) << 16) | xml.readUInt16LE(o); o += 2; }
            strings.push(xml.toString('utf16le', o, o + l * 2));
          }
        }
      } else if (type === 0x0180) {
        resIds = [];
        for (let o = p + 8; o + 4 <= p + size; o += 4) resIds.push(xml.readUInt32LE(o));
      } else if (type === 0x0102) {
        // Première balise : <manifest>
        const attrStart = p + 16 + xml.readUInt16LE(p + 24);
        const attrSize = xml.readUInt16LE(p + 26);
        const attrCount = xml.readUInt16LE(p + 28);
        let packageName = '';
        let versionCode = 0;
        let versionName = '';
        for (let i = 0; i < attrCount; i++) {
          const a = attrStart + i * attrSize;
          const nameIdx = xml.readUInt32LE(a + 4);
          const raw = xml.readUInt32LE(a + 8);
          const dataType = xml[a + 15]!;
          const data = xml.readUInt32LE(a + 16);
          const id = resIds[nameIdx] ?? 0;
          const name = strings[nameIdx] ?? '';
          if (name === 'package' && raw !== 0xffffffff) packageName = strings[raw] ?? '';
          else if (id === 0x0101021b && dataType >= 0x10 && dataType <= 0x1f) versionCode = data;
          else if (id === 0x0101021c) versionName = raw !== 0xffffffff ? strings[raw] ?? '' : dataType === 0x03 ? strings[data] ?? '' : '';
        }
        return packageName && versionCode > 0 ? { packageName, versionCode, versionName: versionName || `1.${versionCode}.0` } : null;
      }
      p += size;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Empreinte SHA-256 du certificat qui a signé l'APK, lue dans le bloc de signature v2 (juste avant le répertoire central du ZIP).
 * Le contrôle cryptographique de la signature reste fait par Android à l'installation : ici on refuse seulement un APK qui ne porte
 * pas le certificat de l'application.
 */
export function readApkSigner(apk: Buffer): string | null {
  try {
    let eocd = -1;
    for (let i = apk.length - 22; i >= Math.max(0, apk.length - 65_557); i--) if (apk.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) return null;
    const cd = apk.readUInt32LE(eocd + 16);
    if (cd < 32 || apk.toString('latin1', cd - 16, cd) !== 'APK Sig Block 42') return null;
    const size = Number(apk.readBigUInt64LE(cd - 24));
    const start = cd - size - 8;
    if (start < 0 || Number(apk.readBigUInt64LE(start)) !== size) return null;
    for (let p = start + 8; p + 12 <= cd - 24; ) {
      const len = Number(apk.readBigUInt64LE(p));
      if (len < 4 || p + 8 + len > cd - 24) return null;
      if (apk.readUInt32LE(p + 8) === 0x7109871a) {
        // signatures v2 : signataires[ signataire[ données signées[ empreintes, certificats[ … ] ], … ] ]
        let q = p + 12 + 4 + 4 + 4; // longueurs : signataires, premier signataire, données signées
        q += 4 + apk.readUInt32LE(q); // empreintes
        q += 4; // longueur de la liste des certificats
        const certLen = apk.readUInt32LE(q);
        q += 4;
        if (certLen < 100 || q + certLen > p + 8 + len) return null;
        return createHash('sha256').update(apk.subarray(q, q + certLen)).digest('hex');
      }
      p += 8 + len;
    }
    return null;
  } catch {
    return null;
  }
}

// ---------- Stockage ----------

interface ReleaseRow {
  version_code: number; version_name: string; size: string; sha256: string; chunks: number; upload_id: string; created_at: Date | string;
}

export const currentRelease = () => one<ReleaseRow>(`select version_code, version_name, size, sha256, chunks, upload_id, created_at from app_release where id = 1`);

const publicInfo = (r: ReleaseRow) => ({
  versionCode: r.version_code,
  versionName: r.version_name,
  size: Number(r.size),
  sha256: r.sha256,
  date: new Date(r.created_at).toISOString().slice(0, 10),
  minAndroid: '7.0',
  file: '/app/event509.apk',
});

/** Fiche de version publique (/app/version.json). */
export async function publicRelease() {
  const r = await currentRelease().catch(() => null);
  return r ? publicInfo(r) : FALLBACK_RELEASE;
}

/** Fichier de l'application (/app/event509.apk) : envoyé morceau par morceau (pas de limite de 4,5 Mo), avec reprise (Range). */
export async function streamApk(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const r = await currentRelease().catch(() => null);
  if (!r) {
    // Aucun APK téléversé : ancienne Release GitHub
    res.writeHead(302, { Location: FALLBACK_URL, 'Cache-Control': 'no-store' }).end();
    return;
  }
  const total = Number(r.size);
  let from = 0;
  let to = total - 1;
  let status = 200;
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''));
  if (range && (range[1] || range[2])) {
    if (range[1]) { from = Number(range[1]); to = range[2] ? Math.min(Number(range[2]), total - 1) : total - 1; }
    else { from = Math.max(0, total - Number(range[2])); }
    if (!(from <= to) || from >= total) {
      res.writeHead(416, { 'Content-Range': `bytes */${total}`, 'Cache-Control': 'no-store' }).end();
      return;
    }
    status = 206;
  }
  // Chaque téléchargement complet lit 28 Mo dans la base : limité par adresse IP (20 par heure ; la reprise d'un téléchargement ne compte pas)
  const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim();
  if (ip && from === 0 && req.method !== 'HEAD') {
    const used = await one<{ n: string }>(`select count(*)::text as n from rate_events where key = $1 and at > now() - interval '1 hour'`, [`apk:${ip}`]);
    if (Number(used?.n ?? 0) >= 20) {
      res.writeHead(429, { 'Retry-After': '3600', 'Cache-Control': 'no-store' }).end();
      return;
    }
    await db().query(`insert into rate_events (key) values ($1)`, [`apk:${ip}`]);
  }
  res.writeHead(status, {
    'Content-Type': 'application/vnd.android.package-archive',
    'Content-Disposition': 'attachment; filename="event509.apk"',
    'Content-Length': String(to - from + 1),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Content-Sha256': r.sha256,
    ...(status === 206 ? { 'Content-Range': `bytes ${from}-${to}/${total}` } : {}),
  });
  if (req.method === 'HEAD') { res.end(); return; }
  for (let i = Math.floor(from / CHUNK_BYTES); i * CHUNK_BYTES <= to && i < r.chunks; i++) {
    const row = await one<{ data: Buffer }>(`select data from app_chunk where upload_id = $1 and idx = $2`, [r.upload_id, i]);
    if (!row) { res.destroy(); return; }
    const start = i * CHUNK_BYTES;
    const part = row.data.subarray(Math.max(0, from - start), Math.min(row.data.length, to - start + 1));
    if (!res.write(part)) await new Promise<void>((ok) => res.once('drain', ok));
  }
  res.end();
}

// ---------- Routes d'administration ----------

type Handler = (c: Ctx) => Promise<unknown>;
export interface AppReleaseDeps {
  fail: (status: number, message: string, code?: string) => never;
  str: (v: unknown, max?: number) => string;
  admin: (c: Ctx) => UserRow;
  audit: (c: Ctx, action: string, target: string) => Promise<void>;
}

export function appReleaseRoutes({ fail, str, admin, audit }: AppReleaseDeps): [string, string, Handler][] {
  const idOf = (v: unknown) => {
    const id = str(v, 40);
    if (!/^up_[0-9a-f]{20}$/.test(id)) fail(422, 'Envoi invalide');
    return id;
  };

  const status: Handler = async (c) => {
    admin(c);
    const r = await currentRelease().catch(() => null);
    return { release: r ? publicInfo(r) : null, hosted: !!r, fallback: r ? null : FALLBACK_RELEASE, chunkBytes: CHUNK_BYTES, maxBytes: MAX_APK_BYTES };
  };

  const start: Handler = async (c) => {
    admin(c);
    // Les envois abandonnés depuis plus d'une heure sont effacés
    await db().query(`delete from app_chunk where upload_id in (select upload_id from app_upload where created_at < now() - interval '1 hour')`);
    await db().query(`delete from app_upload where created_at < now() - interval '1 hour'`);
    const id = `up_${randomBytes(10).toString('hex')}`;
    await db().query(`insert into app_upload (upload_id, created_by) values ($1, $2)`, [id, c.user!.id]);
    return { uploadId: id, chunkBytes: CHUNK_BYTES };
  };

  const chunk: Handler = async (c) => {
    admin(c);
    const id = idOf(c.body.uploadId);
    const index = Number(c.body.index);
    if (!Number.isInteger(index) || index < 0 || index >= MAX_CHUNKS) fail(422, 'Morceau invalide');
    const b64 = typeof c.body.data === 'string' ? c.body.data : '';
    if (!b64 || b64.length > Math.ceil(CHUNK_BYTES * 4 / 3) + 16 || !/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) fail(422, 'Morceau invalide');
    const data = Buffer.from(b64, 'base64');
    if (!data.length || data.length > CHUNK_BYTES) fail(422, 'Morceau invalide');
    if (!(await one(`select 1 from app_upload where upload_id = $1`, [id]))) fail(404, 'Envoi introuvable ou expiré : recommencez');
    await db().query(
      `insert into app_chunk (upload_id, idx, data) values ($1, $2, $3) on conflict (upload_id, idx) do update set data = excluded.data`,
      [id, index, data],
    );
    return { ok: true };
  };

  const finish: Handler = async (c) => {
    const u = admin(c);
    const id = idOf(c.body.uploadId);
    const count = Number(c.body.chunks);
    if (!Number.isInteger(count) || count < 1 || count > MAX_CHUNKS) fail(422, 'Nombre de morceaux invalide');
    let apk: Buffer;
    let info: ApkInfo;
    try {
      const rows = await all<{ idx: number; data: Buffer }>(`select idx, data from app_chunk where upload_id = $1 order by idx`, [id]);
      if (rows.length !== count || rows.some((r, i) => r.idx !== i)) fail(422, 'Fichier incomplet : recommencez l’envoi');
      // Tous les morceaux, sauf le dernier, ont exactement la taille convenue (la reprise du téléchargement en dépend)
      if (rows.slice(0, -1).some((r) => r.data.length !== CHUNK_BYTES)) fail(422, 'Fichier invalide : recommencez l’envoi');
      apk = Buffer.concat(rows.map((r) => r.data));
      if (apk.length < MIN_APK_BYTES || apk.length > MAX_APK_BYTES) fail(422, 'Taille de fichier invalide');
      info = readApk(apk) ?? fail(422, 'Ce fichier n’est pas un APK Android valide');
      if (info.packageName !== APP_PACKAGE) fail(422, `Ce n’est pas l’application EVENT509 (${info.packageName})`);
      if (readApkSigner(apk) !== expectedSigner()) fail(422, 'Ce fichier n’est pas signé avec la clé de l’application EVENT509 : il est refusé.', 'bad_signer');
      const cur = await currentRelease().catch(() => null);
      if (cur && info.versionCode <= cur.version_code) fail(409, `La version en ligne est déjà la ${cur.version_name} (${cur.version_code}). Envoyez une version plus récente.`, 'not_newer');
      if (!cur && info.versionCode <= FALLBACK_RELEASE.versionCode) fail(409, `Une version ${FALLBACK_RELEASE.versionName} est déjà publiée : envoyez une version plus récente.`, 'not_newer');
    } catch (e) {
      // Envoi refusé : ses morceaux sont effacés tout de suite (l'ancien APK reste en place)
      await db().query(`delete from app_chunk where upload_id = $1`, [id]);
      await db().query(`delete from app_upload where upload_id = $1`, [id]);
      throw e;
    }
    const sha = createHash('sha256').update(apk).digest('hex');
    await tx(async (q) => {
      await q.query(
        `insert into app_release (id, version_code, version_name, size, sha256, chunks, upload_id, uploaded_by, created_at)
         values (1, $1, $2, $3, $4, $5, $6, $7, now())
         on conflict (id) do update set version_code = excluded.version_code, version_name = excluded.version_name, size = excluded.size,
           sha256 = excluded.sha256, chunks = excluded.chunks, upload_id = excluded.upload_id, uploaded_by = excluded.uploaded_by, created_at = now()`,
        [info.versionCode, info.versionName, apk.length, sha, count, id, u.id],
      );
      // L'ancienne version (et tout envoi en cours ou abandonné) est effacée : un seul APK est gardé
      await q.query(`delete from app_chunk where upload_id <> $1`, [id]);
      await q.query(`delete from app_upload`);
    });
    await audit(c, 'Application Android publiée', `${info.versionName} (${info.versionCode}, ${Math.round(apk.length / 1048576)} Mo)`);
    let sent = 0;
    if (c.body.announce === true && (await claimOnce(`app-update:${info.versionCode}`))) {
      sent = await notifyAllDevices({
        title: 'Mise à jour disponible',
        body: `EVENT509 ${info.versionName} est disponible. Touchez pour l’installer.`,
        url: '/telecharger',
        channel: 'updates',
      }).catch(() => 0);
    }
    return { release: publicInfo((await currentRelease())!), notified: sent };
  };

  const remove: Handler = async (c) => {
    admin(c);
    const cur = await currentRelease().catch(() => null);
    if (!cur) fail(404, 'Aucun fichier hébergé');
    await tx(async (q) => {
      await q.query(`delete from app_chunk`);
      await q.query(`delete from app_release`);
      await q.query(`delete from app_upload`);
    });
    await audit(c, 'Application Android retirée', cur!.version_name);
    return { ok: true };
  };

  return [
    ['GET', '/admin/app', status],
    ['POST', '/admin/app/upload/start', start],
    ['POST', '/admin/app/upload/chunk', chunk],
    ['POST', '/admin/app/upload/finish', finish],
    ['DELETE', '/admin/app', remove],
    ['GET', '/app/version', async () => publicRelease()],
  ];
}

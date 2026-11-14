import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { all, db, one, tx, type Q } from './db.js';
import { newId, readPurposeToken, signPurposeToken, signToken } from './auth.js';
import type { Ctx, UserRow } from './routes.js';

/**
 * Vérification par code à usage unique (OTP) envoyé sur WhatsApp, avec l'API officielle Meta Cloud.
 *
 * Règles (appliquées ici, côté serveur) :
 *   - code de 6 chiffres, tiré par crypto.randomInt, jamais stocké en clair (HMAC-SHA256) ;
 *   - valable 5 minutes ; un nouveau code invalide l'ancien (même motif, même numéro) ;
 *   - 3 demandes maximum par 24 h glissantes, partagées entre l'inscription, le mot de passe oublié et le
 *     changement de mot de passe (référence : le compte, ou le numéro E.164 tant qu'il n'y a pas de compte) ;
 *   - 5 essais maximum par code ; un code n'est utilisable qu'une fois ;
 *   - un envoi refusé par Meta ne compte pas comme envoyé : le code est invalidé et ne consomme pas la limite ;
 *   - les demandes simultanées sont sérialisées par un verrou consultatif Postgres (pas de dépassement possible) ;
 *   - le journal de sécurité (otp_security_log) ne contient jamais un code ni un numéro complet.
 */

export const OTP_TTL_SECONDS = 300;
export const OTP_MAX_PER_DAY = 3;
export const OTP_MAX_ATTEMPTS = 5;
export type OtpPurpose = 'register' | 'forgot_password' | 'change_password';

type Handler = (c: Ctx) => Promise<unknown>;

// ---------- Numéros de téléphone ----------

/** Numéro au format international E.164 (« +50937123456 »), ou null s'il est invalide. Un numéro local à 8 chiffres est traité comme haïtien. */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let s = raw.trim().replace(/[\s().-]/g, '');
  if (!/^\+?\d+$|^00\d+$/.test(s)) return null;
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  else if (!s.startsWith('+')) {
    if (/^\d{8}$/.test(s)) s = `+509${s}`;
    else return null;
  }
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
}

/** « +509••••3456 » : pour les journaux et les écrans, jamais le numéro complet. */
export const maskPhone = (p: string) => `${p.slice(0, 4)}••••${p.slice(-2)}`;

// ---------- Code et hachage ----------

export const generateCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

function pepper() {
  const s = process.env.OTP_PEPPER || process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error('JWT_SECRET (ou OTP_PEPPER) manquant ou trop court');
  return s;
}
/** Empreinte du code, liée à la ligne, au numéro et au motif : un code volé ne sert à rien ailleurs. */
export const hashCode = (id: string, phone: string, purpose: OtpPurpose, code: string) =>
  createHmac('sha256', pepper()).update(`${id}|${phone}|${purpose}|${code}`).digest('hex');
const sameHash = (a: string, b: string) => {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
};

// ---------- Envoi par WhatsApp Cloud API (Meta) ----------

export const otpConfigured = () => !!process.env.META_ACCESS_TOKEN && !!process.env.META_PHONE_NUMBER_ID;

export type SendFailure = 'invalid_number' | 'unreachable' | 'auth' | 'rate_limit' | 'template' | 'temporary' | 'not_configured';
export class OtpSendError extends Error {
  constructor(public kind: SendFailure, public metaCode?: number) {
    super(kind);
  }
}

/** Classe une erreur renvoyée par Meta (code d'erreur Graph API ou statut HTTP). */
export function classifyMetaError(status: number, code?: number): SendFailure {
  const c = code ?? -1;
  if (c === 190 || c === 10 || (c >= 200 && c <= 299) || status === 401 || status === 403) return 'auth';
  if ([4, 80007, 130429, 131056].includes(c) || status === 429) return 'rate_limit';
  if ([132000, 132001, 132005, 132007, 132012, 132015, 132016].includes(c)) return 'template';
  if ([131026, 131030, 131047, 131049, 131050].includes(c)) return 'unreachable';
  if ([100, 131009, 131021, 33].includes(c)) return 'invalid_number';
  return 'temporary'; // 1, 2, 131000, 131016, 368, erreurs 5xx et tout cas inconnu : on réessaiera plus tard
}

/**
 * Envoie le modèle WhatsApp de catégorie AUTHENTICATION (code à 6 chiffres + bouton « Copier le code »).
 * Lève OtpSendError si Meta ne confirme pas l'envoi : un code n'est jamais présenté comme envoyé sans accusé de Meta.
 */
export async function sendWhatsappCode(phone: string, code: string): Promise<{ wamid: string }> {
  if (!otpConfigured()) throw new OtpSendError('not_configured');
  const base = process.env.META_GRAPH_BASE_URL || 'https://graph.facebook.com';
  const version = process.env.META_GRAPH_API_VERSION || 'v21.0';
  const template = process.env.META_OTP_TEMPLATE || 'event509_otp';
  const lang = process.env.META_OTP_LANG || 'fr';
  const components: unknown[] = [{ type: 'body', parameters: [{ type: 'text', text: code }] }];
  // Les modèles d'authentification ont un bouton « Copier le code » (type URL) qui reçoit aussi le code
  if (process.env.META_OTP_COPY_BUTTON !== 'false') components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] });
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(`${base}/${version}/${encodeURIComponent(process.env.META_PHONE_NUMBER_ID!)}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: phone.slice(1), type: 'template', template: { name: template, language: { code: lang }, components } }),
      signal: ctl.signal,
    });
  } catch {
    throw new OtpSendError('temporary');
  } finally {
    clearTimeout(timer);
  }
  const body = (await res.json().catch(() => ({}))) as { messages?: { id?: string }[]; error?: { code?: number } };
  const wamid = body.messages?.[0]?.id;
  if (!res.ok || !wamid) throw new OtpSendError(classifyMetaError(res.status, body.error?.code), body.error?.code);
  return { wamid };
}

// ---------- Journal de sécurité ----------

async function log(event: string, purpose: OtpPurpose | null, phone: string | null, userId: string | null, detail: Record<string, unknown> = {}, q: Q = db()) {
  // Jamais de code, jamais de numéro complet
  await q.query(`insert into otp_security_log (id, event, purpose, user_id, phone_masked, detail) values ($1,$2,$3,$4,$5,$6::jsonb)`, [newId('osl'), event, purpose, userId, phone ? maskPhone(phone) : null, JSON.stringify(detail)]).catch(() => {});
}

// ---------- Cœur : demande et vérification ----------

export interface SendResult {
  ok: boolean;
  /** Raison d'un refus : « limit » (3 par jour atteints), ou le type d'échec côté Meta. */
  reason?: 'limit' | SendFailure;
  expiresInSeconds?: number;
  requestsLeft?: number;
}

/** Verrou consultatif : deux demandes pour le même compte ou numéro passent l'une après l'autre. */
async function lock(q: Q, keys: string[]) {
  for (const k of [...new Set(keys)].sort()) await q.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [`otp:${k}`]);
}

/**
 * Crée un code pour (motif, numéro, compte éventuel) et l'envoie par WhatsApp.
 * La limite quotidienne est vérifiée et la ligne réservée dans une même transaction verrouillée ; l'appel à Meta se fait
 * ensuite (hors verrou). Si Meta échoue, le code est invalidé et ne compte pas dans la limite.
 */
export async function requestOtp(purpose: OtpPurpose, phone: string, userId: string | null): Promise<SendResult> {
  const reserved = await tx(async (q) => {
    await lock(q, [`p:${phone}`, ...(userId ? [`u:${userId}`] : [])]);
    // Ménage : les anciennes lignes ne servent plus (la limite ne regarde que les dernières 24 h)
    await q.query(`delete from otp_verifications where created_at < now() - interval '48 hours'`);
    await q.query(`delete from otp_security_log where at < now() - interval '90 days'`);
    const used = await one<{ n: string }>(
      `select count(*)::text as n from otp_verifications
       where (phone_number = $1 or ($2::text is not null and user_id = $2)) and created_at > now() - interval '24 hours' and send_failed = false`,
      [phone, userId], q);
    const count = Number(used?.n ?? 0);
    if (count >= OTP_MAX_PER_DAY) return null;
    // Un nouveau code invalide l'ancien
    await q.query(`update otp_verifications set consumed_at = now() where purpose = $1 and phone_number = $2 and consumed_at is null`, [purpose, phone]);
    const id = newId('otp');
    const code = generateCode();
    await q.query(
      `insert into otp_verifications (id, user_id, phone_number, otp_hash, purpose, expires_at) values ($1,$2,$3,$4,$5, now() + ($6 || ' seconds')::interval)`,
      [id, userId, phone, hashCode(id, phone, purpose, code), purpose, String(OTP_TTL_SECONDS)]);
    return { id, code, left: OTP_MAX_PER_DAY - count - 1 };
  });
  if (!reserved) {
    await log('limit_reached', purpose, phone, userId);
    return { ok: false, reason: 'limit', requestsLeft: 0 };
  }
  try {
    const { wamid } = await sendWhatsappCode(phone, reserved.code);
    await db().query(`update otp_verifications set wamid = $2, delivery_status = 'sent' where id = $1`, [reserved.id, wamid]);
    await log('sent', purpose, phone, userId, { left: reserved.left });
    return { ok: true, expiresInSeconds: OTP_TTL_SECONDS, requestsLeft: reserved.left };
  } catch (e) {
    const kind = e instanceof OtpSendError ? e.kind : 'temporary';
    await db().query(`update otp_verifications set send_failed = true, consumed_at = now(), delivery_status = 'failed' where id = $1`, [reserved.id]);
    await log('send_failed', purpose, phone, userId, { kind, metaCode: e instanceof OtpSendError ? e.metaCode : undefined });
    return { ok: false, reason: kind };
  }
}

export type VerifyOutcome = { ok: true; id: string } | { ok: false; reason: 'invalid' | 'expired' | 'locked' | 'none' };

/**
 * Vérifie un code. Les essais (5 au plus) sont comptés même en cas d'échec : la mise à jour est validée avant de répondre.
 * Un code bon est marqué « vérifié » (une seule fois) ; l'usage final le marque « consommé ».
 */
export async function verifyOtp(purpose: OtpPurpose, phone: string, userId: string | null, code: string): Promise<VerifyOutcome> {
  const out = await tx(async (q): Promise<VerifyOutcome> => {
    await lock(q, [`p:${phone}`, ...(userId ? [`u:${userId}`] : [])]);
    const row = await one<{ id: string; otp_hash: string; attempts: number; expired: boolean }>(
      `select id, otp_hash, attempts, expires_at <= now() as expired from otp_verifications
       where purpose = $1 and phone_number = $2 and ($3::text is null or user_id = $3) and consumed_at is null and verified_at is null
       order by created_at desc limit 1 for update`,
      [purpose, phone, userId], q);
    if (!row) return { ok: false, reason: 'none' };
    if (row.expired) {
      await q.query(`update otp_verifications set consumed_at = now() where id = $1`, [row.id]);
      return { ok: false, reason: 'expired' };
    }
    if (row.attempts >= OTP_MAX_ATTEMPTS) {
      await q.query(`update otp_verifications set consumed_at = now() where id = $1`, [row.id]);
      return { ok: false, reason: 'locked' };
    }
    const attempts = row.attempts + 1;
    if (/^\d{6}$/.test(code) && sameHash(row.otp_hash, hashCode(row.id, phone, purpose, code))) {
      await q.query(`update otp_verifications set attempts = $2, verified_at = now() where id = $1`, [row.id, attempts]);
      return { ok: true, id: row.id };
    }
    // Échec : le code est invalidé au 5e essai
    await q.query(`update otp_verifications set attempts = $2, consumed_at = case when $2::int >= $3::int then now() else null end where id = $1`, [row.id, attempts, OTP_MAX_ATTEMPTS]);
    return { ok: false, reason: attempts >= OTP_MAX_ATTEMPTS ? 'locked' : 'invalid' };
  });
  await log(out.ok ? 'verified' : `verify_${out.reason}`, purpose, phone, userId);
  return out;
}

/** Marque une vérification comme utilisée, une seule fois (renvoie false si elle l'était déjà ou si elle n'existe pas). */
export async function consumeOtp(id: string, purpose: OtpPurpose, q: Q = db()): Promise<boolean> {
  const r = await q.query(`update otp_verifications set consumed_at = now() where id = $1 and purpose = $2 and verified_at is not null and consumed_at is null`, [id, purpose]);
  return (r.rowCount ?? 0) === 1;
}

/** Accusés de réception de Meta (webhook) : met à jour l'état de livraison ; un échec est noté, le code reste soumis à son expiration. */
export async function recordDeliveryStatus(wamid: string, status: string, errorCode?: number) {
  if (!['sent', 'delivered', 'read', 'failed'].includes(status)) return;
  const r = await db().query(`update otp_verifications set delivery_status = $2 where wamid = $1 returning purpose, phone_number, user_id`, [wamid, status]);
  const row = r.rows[0] as { purpose: OtpPurpose; phone_number: string; user_id: string | null } | undefined;
  if (row && status === 'failed') {
    await db().query(`update otp_verifications set send_failed = true, consumed_at = coalesce(consumed_at, now()) where wamid = $1`, [wamid]);
    await log('delivery_failed', row.purpose, row.phone_number, row.user_id, { metaCode: errorCode });
  }
}

// ---------- Routes ----------

export interface OtpDeps {
  fail: (status: number, message: string, code?: string) => never;
  auth: (c: Ctx) => UserRow;
  checkPassword: (password: string, email: string, name: string) => void;
  hashPassword: (p: string) => Promise<string>;
  rateLimit: (key: string, max: number, windowMinutes: number) => Promise<void>;
}

const FAIL_MESSAGES: Record<SendFailure, [number, string]> = {
  invalid_number: [422, 'Ce numéro ne peut pas recevoir de message WhatsApp. Vérifiez-le.'],
  unreachable: [422, 'Ce numéro n’est pas joignable sur WhatsApp.'],
  auth: [503, 'Le service de vérification est momentanément indisponible. Réessayez plus tard.'],
  rate_limit: [503, 'Le service de vérification est très sollicité. Réessayez dans quelques minutes.'],
  template: [503, 'Le service de vérification est momentanément indisponible. Réessayez plus tard.'],
  temporary: [503, 'L’envoi du code a échoué. Réessayez dans un instant.'],
  not_configured: [503, 'La vérification par WhatsApp n’est pas encore disponible.'],
};

export function otpRoutes(d: OtpDeps) {
  const { fail } = d;
  const GENERIC_FORGOT = { sent: true, message: 'Si un compte correspond à ce numéro, un code vient d’être envoyé sur WhatsApp.', expiresInSeconds: OTP_TTL_SECONDS };

  const phoneOf = (c: Ctx) => {
    const p = normalizePhone(c.body.phone);
    if (!p) fail(422, 'Numéro de téléphone invalide. Utilisez le format international, par exemple +509 3712 3456.', 'phone_invalid');
    return p!;
  };
  const codeOf = (c: Ctx) => (typeof c.body.code === 'string' ? c.body.code.replace(/\s/g, '').slice(0, 12) : '');
  const needService = () => {
    if (!otpConfigured()) fail(503, FAIL_MESSAGES.not_configured[1], 'otp_unavailable');
  };
  /** Toute demande d'envoi : 10 par heure et par connexion, en plus de la limite par compte ou numéro. */
  const ipGuard = async (c: Ctx) => {
    if (c.ip) await d.rateLimit(`otp:${c.ip}`, 10, 60);
  };
  const sendFailure = (r: SendResult): never => {
    if (r.reason === 'limit') fail(429, 'Limite atteinte : 3 codes par 24 heures. Réessayez plus tard.', 'otp_limit');
    const [status, msg] = FAIL_MESSAGES[(r.reason ?? 'temporary') as SendFailure];
    return fail(status, msg, `otp_${r.reason}`);
  };
  const verifyFailure = (o: Extract<VerifyOutcome, { ok: false }>): never => {
    if (o.reason === 'expired') fail(400, 'Ce code a expiré. Demandez-en un nouveau.', 'otp_expired');
    if (o.reason === 'locked') fail(400, 'Trop d’essais : ce code n’est plus valable. Demandez-en un nouveau.', 'otp_locked');
    return fail(400, 'Code incorrect ou expiré.', 'otp_invalid');
  };
  const byPhone = (phone: string) => one<UserRow>(`select * from users where data->>'phone' = $1 and (data->>'phoneVerified')::boolean is true order by created_at limit 1`, [phone]);

  // A. Inscription -----------------------------------------------------------

  const status: Handler = async () => ({ enabled: otpConfigured() });

  const registerSend: Handler = async (c) => {
    needService();
    await ipGuard(c);
    const phone = phoneOf(c);
    const r = await requestOtp('register', phone, null);
    if (!r.ok) sendFailure(r);
    return { sent: true, expiresInSeconds: r.expiresInSeconds, requestsLeft: r.requestsLeft };
  };

  /** Code bon → preuve signée de 30 minutes (liée au numéro), à présenter à l'inscription ; le serveur décide, jamais le navigateur. */
  const registerVerify: Handler = async (c) => {
    needService();
    await ipGuard(c);
    const phone = phoneOf(c);
    const o = await verifyOtp('register', phone, null, codeOf(c));
    if (!o.ok) verifyFailure(o);
    return { verified: true, phone, proof: signPurposeToken(`phone:${phone}`, (o as { id: string }).id, 30 * 60) };
  };

  // B. Mot de passe oublié ---------------------------------------------------

  const forgotSend: Handler = async (c) => {
    needService();
    await ipGuard(c);
    const phone = phoneOf(c);
    const u = await byPhone(phone);
    // Même réponse, que le compte existe ou non (et même si la limite ou Meta refuse) : rien n'est révélé
    if (u && u.status !== 'suspended') await requestOtp('forgot_password', phone, u.id).catch(() => null);
    else await log('forgot_unknown_phone', 'forgot_password', phone, null);
    return GENERIC_FORGOT;
  };

  /** Code bon → autorisation de réinitialisation, distincte du code, courte (10 min) et à usage unique : elle n'ouvre aucune session. */
  const forgotVerify: Handler = async (c) => {
    needService();
    await ipGuard(c);
    const phone = phoneOf(c);
    const u = await byPhone(phone);
    if (!u) {
      await log('verify_unknown_phone', 'forgot_password', phone, null);
      return fail(400, 'Code incorrect ou expiré.', 'otp_invalid');
    }
    const o = await verifyOtp('forgot_password', phone, u.id, codeOf(c));
    if (!o.ok) verifyFailure(o);
    return { verified: true, resetToken: signPurposeToken(`otp-reset:${(o as { id: string }).id}`, u.id, 10 * 60) };
  };

  const finishSession = async (u: UserRow, newHash: string, otpId: string, purpose: OtpPurpose) => {
    await tx(async (q) => {
      if (!(await consumeOtp(otpId, purpose, q))) fail(400, 'Cette autorisation n’est plus valable. Recommencez.', 'otp_invalid');
      // Toutes les sessions ouvertes avant ce moment deviennent invalides
      await q.query(`update users set password_hash = $2, sessions_valid_from = now() where id = $1`, [u.id, newHash]);
    });
    await log('password_changed', purpose, (u.data.phone as string) ?? null, u.id);
  };

  const readGrant = (token: unknown, prefix: 'otp-reset' | 'otp-change'): { userId: string; otpId: string } | null => {
    if (typeof token !== 'string') return null;
    // Le motif contient l'identifiant de la vérification : on le lit sans vérifier, puis on contrôle la signature avec ce motif
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as { p?: string };
      const m = new RegExp(`^${prefix}:(otp_[A-Za-z0-9_]+)$`).exec(payload.p ?? '');
      if (!m) return null;
      const userId = readPurposeToken(token, payload.p!);
      return userId ? { userId, otpId: m[1]! } : null;
    } catch {
      return null;
    }
  };

  const resetPassword: Handler = async (c) => {
    needService();
    const g = readGrant(c.body.resetToken, 'otp-reset');
    if (!g) fail(400, 'Cette autorisation n’est plus valable. Recommencez.', 'otp_invalid');
    const next = typeof c.body.password === 'string' ? c.body.password : '';
    const u = await one<UserRow>(`select * from users where id = $1`, [g!.userId]);
    if (!u || u.status === 'suspended') fail(400, 'Cette autorisation n’est plus valable. Recommencez.', 'otp_invalid');
    d.checkPassword(next, u!.email, (u!.data.name as string) ?? '');
    await finishSession(u!, await d.hashPassword(next), g!.otpId, 'forgot_password');
    return { ok: true };
  };

  // C. Changement de mot de passe (connecté) --------------------------------

  const userPhone = (u: UserRow) => (u.data.phoneVerified === true ? normalizePhone(u.data.phone) : null);

  const changeSend: Handler = async (c) => {
    needService();
    const u = d.auth(c);
    const phone = userPhone(u);
    if (!phone) fail(409, 'Ajoutez et vérifiez d’abord votre numéro WhatsApp.', 'phone_unverified');
    await ipGuard(c);
    const r = await requestOtp('change_password', phone!, u.id);
    if (!r.ok) sendFailure(r);
    return { sent: true, expiresInSeconds: r.expiresInSeconds, requestsLeft: r.requestsLeft, phoneMasked: maskPhone(phone!) };
  };

  const changeVerify: Handler = async (c) => {
    needService();
    const u = d.auth(c);
    const phone = userPhone(u);
    if (!phone) fail(409, 'Ajoutez et vérifiez d’abord votre numéro WhatsApp.', 'phone_unverified');
    await ipGuard(c);
    const o = await verifyOtp('change_password', phone!, u.id, codeOf(c));
    if (!o.ok) verifyFailure(o);
    return { verified: true, changeToken: signPurposeToken(`otp-change:${(o as { id: string }).id}`, u.id, 10 * 60) };
  };

  const changeConfirm: Handler = async (c) => {
    needService();
    const u = d.auth(c);
    const g = readGrant(c.body.changeToken, 'otp-change');
    // L'autorisation doit appartenir au compte connecté
    if (!g || g.userId !== u.id) fail(400, 'Cette autorisation n’est plus valable. Recommencez.', 'otp_invalid');
    const next = typeof c.body.password === 'string' ? c.body.password : '';
    d.checkPassword(next, u.email, (u.data.name as string) ?? '');
    await finishSession(u, await d.hashPassword(next), g!.otpId, 'change_password');
    // Les autres sessions sont fermées ; celle-ci continue avec un jeton émis après le changement
    return { ok: true, token: signToken(u.id) };
  };

  return [
    ['GET', '/auth/otp/status', status],
    ['POST', '/auth/otp/register/send', registerSend],
    ['POST', '/auth/otp/register/verify', registerVerify],
    ['POST', '/auth/otp/forgot-password/send', forgotSend],
    ['POST', '/auth/otp/forgot-password/verify', forgotVerify],
    ['POST', '/auth/otp/reset-password', resetPassword],
    ['POST', '/auth/otp/change-password/send', changeSend],
    ['POST', '/auth/otp/change-password/verify', changeVerify],
    ['POST', '/auth/otp/change-password/confirm', changeConfirm],
  ] as [string, string, Handler][];
}

/** Nombre de demandes restantes pour un compte ou un numéro (pour les tests et l'administration). */
export async function requestsLeft(phone: string, userId: string | null) {
  const r = await all<{ n: string }>(
    `select count(*)::text as n from otp_verifications where (phone_number = $1 or ($2::text is not null and user_id = $2)) and created_at > now() - interval '24 hours' and send_failed = false`,
    [phone, userId]);
  return Math.max(0, OTP_MAX_PER_DAY - Number(r[0]?.n ?? 0));
}

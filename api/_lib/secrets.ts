import { createHmac, randomInt } from 'node:crypto';
import { argon2id, argon2Verify } from 'hash-wasm';
import { randomBytes } from 'node:crypto';
import { all, one, type Q } from './db.js';
import { newId } from './auth.js';

/**
 * Secrets de récupération :
 *   - questions de sécurité (3, formulées par l'utilisateur) : réponses normalisées puis hachées avec Argon2id
 *     (sel individuel aléatoire, 19 Mio de mémoire, 2 passes : résistant aux attaques hors ligne malgré la faible entropie) ;
 *   - codes de récupération (10, à usage unique) : forte entropie, HMAC-SHA256 avec poivre serveur.
 * Aucune réponse, aucun code n'est jamais renvoyé par l'API ni écrit dans un journal après sa création.
 */

// ---------- Questions de sécurité ----------

/** Normalisation cohérente des réponses : Unicode NFKC, espaces réduits, casse ignorée ; les accents restent significatifs. */
export const normalizeAnswer = (a: string) => a.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

const PUBLIC_TOPICS = /date de naissance|ann?iversaire|nee? le\b|nom de famille|nom de (jeune )?fille|\b(mere|pere|maman|papa|parents?|frere|soeur|epoux|epouse|conjoint)\b|adresse|numero de telephone|\btelephone\b|etablissement actuel|ecole actuelle|ville actuelle|employeur actuel|reseaux? sociaux|instagram|facebook|\bpseudo\b.*(reseau|instagram|facebook)/;
const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const WEAK_ANSWERS = new Set(['oui', 'non', 'aucun', 'rien', 'je ne sais pas', 'jsp', 'test', 'azerty', 'password', '1234', '12345', '123456']);

export interface QuestionInput {
  question: string;
  answer: string;
}

/** Contrôle de qualité des questions (1 à 3, au choix de l'utilisateur) ; renvoie un message (non technique) en cas de problème. */
export function checkQuestions(list: unknown): { ok: true; items: QuestionInput[] } | { ok: false; message: string } {
  if (!Array.isArray(list) || list.length < 1 || list.length > 3) return { ok: false, message: 'Définissez entre une et trois questions de sécurité.' };
  const items: QuestionInput[] = [];
  for (const raw of list) {
    const q = typeof (raw as QuestionInput)?.question === 'string' ? (raw as QuestionInput).question.trim().replace(/\s+/g, ' ') : '';
    const a = typeof (raw as QuestionInput)?.answer === 'string' ? (raw as QuestionInput).answer : '';
    if (q.length < 8 || q.length > 160) return { ok: false, message: 'Chaque question doit faire entre 8 et 160 caractères.' };
    const n = normalizeAnswer(a);
    if (n.length < 3 || n.length > 100) return { ok: false, message: 'Chaque réponse doit faire entre 3 et 100 caractères.' };
    if (WEAK_ANSWERS.has(strip(n)) || /^(.)\1+$/.test(n)) return { ok: false, message: 'Une de vos réponses est trop facile à deviner. Choisissez une information que vous seul connaissez.' };
    if (PUBLIC_TOPICS.test(strip(q))) return { ok: false, message: 'Évitez les questions sur des informations publiques ou faciles à trouver (date de naissance, nom de famille, adresse, parents, réseaux sociaux…).' };
    if (strip(n) === strip(q)) return { ok: false, message: 'La réponse ne peut pas répéter la question.' };
    items.push({ question: q, answer: a });
  }
  if (new Set(items.map((i) => strip(i.question))).size !== items.length) return { ok: false, message: 'Les questions doivent être différentes.' };
  if (new Set(items.map((i) => strip(normalizeAnswer(i.answer)))).size !== items.length) return { ok: false, message: 'Les réponses doivent être différentes.' };
  return { ok: true, items };
}

export const hashAnswer = (answer: string) =>
  argon2id({ password: normalizeAnswer(answer), salt: randomBytes(16), parallelism: 1, iterations: 2, memorySize: 19456, hashLength: 32, outputType: 'encoded' });

/** Remplace les questions d'un compte (1 à 3, dans la transaction fournie). */
export async function saveQuestions(userId: string, items: QuestionInput[], q: Q) {
  const hashes = await Promise.all(items.map((i) => hashAnswer(i.answer)));
  await q.query(`delete from security_questions where user_id = $1`, [userId]);
  for (let i = 0; i < items.length; i++)
    await q.query(`insert into security_questions (id, user_id, position, question, answer_hash) values ($1,$2,$3,$4,$5)`, [newId('sq'), userId, i + 1, items[i]!.question, hashes[i]]);
}

/** Les questions d'un compte (texte seulement, jamais les réponses). */
export const getQuestions = (userId: string, q?: Q) =>
  all<{ position: number; question: string }>(`select position, question from security_questions where user_id = $1 order by position`, [userId], q);

/** Vérifie toutes les réponses (autant que de questions) ; toutes les empreintes sont calculées (pas de fuite par le temps de réponse). */
export async function verifyAnswers(userId: string, answers: unknown): Promise<boolean> {
  const rows = await all<{ position: number; answer_hash: string }>(`select position, answer_hash from security_questions where user_id = $1 order by position`, [userId]);
  if (rows.length < 1 || rows.length > 3 || !Array.isArray(answers) || answers.length !== rows.length) return false;
  const results = await Promise.all(rows.map((r, i) => {
    const a = answers[i];
    return typeof a === 'string' && a.length <= 200 ? argon2Verify({ password: normalizeAnswer(a), hash: r.answer_hash }).catch(() => false) : Promise.resolve(false);
  }));
  return results.every(Boolean);
}

// ---------- Codes de récupération ----------

const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'; // sans 0/O ni 1/I/L : lisibles à la main
export const CODE_COUNT = 10;

function pepper() {
  const s = process.env.AUTH_PEPPER || process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error('JWT_SECRET (ou AUTH_PEPPER) manquant ou trop court');
  return s;
}
export const normalizeCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '');
export const hashCode = (c: string) => createHmac('sha256', pepper()).update(`recovery|${normalizeCode(c)}`).digest('hex');

/** Un code « XXXX-XXXX-XXXX » : 12 caractères parmi 30 (environ 59 bits), tirés par crypto.randomInt. */
export const generateRecoveryCode = () => Array.from({ length: 3 }, () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')).join('-');

/** Révoque l'ancienne série et en crée une nouvelle ; renvoie les codes en clair, une seule fois. */
export async function replaceRecoveryCodes(userId: string, q: Q): Promise<string[]> {
  await q.query(`update recovery_codes set revoked_at = now() where user_id = $1 and used_at is null and revoked_at is null`, [userId]);
  const batch = newId('rcb');
  const codes = Array.from({ length: CODE_COUNT }, generateRecoveryCode);
  for (const c of codes) await q.query(`insert into recovery_codes (id, user_id, code_hash, batch) values ($1,$2,$3,$4)`, [newId('rc'), userId, hashCode(c), batch]);
  return codes;
}

export async function revokeRecoveryCodes(userId: string, q: Q) {
  const r = await q.query(`update recovery_codes set revoked_at = now() where user_id = $1 and used_at is null and revoked_at is null`, [userId]);
  return r.rowCount ?? 0;
}

/** Utilise un code (une seule fois, de façon atomique). */
export async function consumeRecoveryCode(userId: string, code: string, q?: Q): Promise<boolean> {
  if (normalizeCode(code).length !== 12) return false;
  const row = await one<{ id: string }>(
    `update recovery_codes set used_at = now() where user_id = $1 and code_hash = $2 and used_at is null and revoked_at is null returning id`,
    [userId, hashCode(code)], q);
  return !!row;
}

export const remainingCodes = async (userId: string) =>
  Number((await one<{ n: string }>(`select count(*)::text as n from recovery_codes where user_id = $1 and used_at is null and revoked_at is null`, [userId]))?.n ?? 0);

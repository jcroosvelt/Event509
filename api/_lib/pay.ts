/**
 * Paiement en ligne : une seule API pour MonCash, NatCash, KashPaw et carte (Square).
 * Documentation : « API Paiement & Retrait Marchand » (https://plopplop.solutionip.app/).
 * Réglages à définir dans Vercel (jamais dans le code) :
 *   PAY_CLIENT_ID   identifiant marchand fourni par la plateforme de paiement
 *   PAY_BASE_URL    (facultatif) adresse de l'API, par défaut https://plopplop.solutionip.app
 * Tant que PAY_CLIENT_ID n'est pas défini, le paiement en ligne est désactivé et le site garde son
 * fonctionnement actuel (commande validée sans paiement réel).
 */
export type OnlineMethod = 'moncash' | 'natcash' | 'kashpaw' | 'card';
export const ONLINE_METHODS: readonly string[] = ['moncash', 'natcash', 'kashpaw', 'card'];
/** Montant minimum accepté par la plateforme de paiement. */
export const MIN_HTG = 20;

export const payConfigured = () => !!process.env.PAY_CLIENT_ID;
const base = () => (process.env.PAY_BASE_URL || 'https://plopplop.solutionip.app').replace(/\/$/, '');

/** Nom de la méthode dans l'API de paiement (la carte s'appelle « carte »). */
const apiMethod = (m: OnlineMethod) => (m === 'card' ? 'carte' : m);

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${base()}/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: process.env.PAY_CLIENT_ID, ...body }),
    signal: AbortSignal.timeout(12_000),
  });
  const j = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error(`Paiement refusé (${res.status}) ${j.message ?? ''}`);
  return j;
}

/** Crée la transaction et renvoie l'adresse de la page de paiement sécurisée. */
export async function createPayment(opts: { reference: string; amountHtg: number; method: OnlineMethod }) {
  const j = await post<{ status?: boolean; url?: string | null; transaction_id?: string; message?: string }>('paiement-marchand', {
    refference_id: opts.reference, // (sic) orthographe de l'API
    montant: opts.amountHtg,
    payment_method: apiMethod(opts.method),
  });
  if (!j.status || !j.url) throw new Error(`Création du paiement impossible : ${j.message ?? 'réponse inattendue'}`);
  return { url: j.url, transactionId: String(j.transaction_id ?? '') };
}

export type PayStatus = 'paid' | 'pending' | 'failed';

/** Interroge la plateforme de paiement : « ok » = confirmé, « failed » = échoué, sinon en attente. */
export async function verifyPayment(reference: string): Promise<PayStatus> {
  const j = await post<{ status?: boolean; trans_status?: string }>('paiement-verify', { refference_id: reference });
  if (!j.status) return 'pending';
  if (j.trans_status === 'ok') return 'paid';
  if (j.trans_status === 'failed') return 'failed';
  return 'pending';
}

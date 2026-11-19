/**
 * Règles de versement par événement et de remboursement (fichier sans dépendance : utilisé par le site, le serveur et la démo).
 *
 * - Chaque événement a un délai de remboursement : l'acheteur peut demander un remboursement jusqu'à N jours avant le début
 *   (7 par défaut, réglable par l'organisateur de 0 à 30 ; 0 = aucun remboursement, sauf annulation).
 * - L'argent d'un événement n'est versé à l'organisateur qu'une fois ce délai terminé.
 * - Et seulement si au moins 40 % des billets payants sont vendus, ou si l'événement a lieu dans 5 jours ou moins.
 */
export const PAYOUT_MIN_SOLD = 40;
export const PAYOUT_LAST_DAYS = 5;
export const DEFAULT_REFUND_DAYS = 7;
export const MAX_REFUND_DAYS = 30;
const DAY = 86_400_000;

export interface PayoutEventInput {
  status: string;
  start: string;
  refundDays?: number;
  tickets: { kind: string; quota: number; sold: number }[];
}

/** Début de l'événement sans fuseau (heure locale d'Haïti) lu comme une heure UTC, comme le reste du site. */
export function startMs(iso: string) {
  return Date.parse(iso.length === 16 ? `${iso}:00Z` : `${iso}Z`.replace('ZZ', 'Z'));
}

/** Délai de remboursement de l'événement (jours avant le début), borné ; à défaut, celui de l'administrateur. */
export function refundDaysOf(e: { refundDays?: number }, fallback = DEFAULT_REFUND_DAYS) {
  const v = e.refundDays;
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_REFUND_DAYS) return v;
  return Number.isInteger(fallback) && fallback >= 0 && fallback <= MAX_REFUND_DAYS ? fallback : DEFAULT_REFUND_DAYS;
}

/** Fin du délai de remboursement (ms) ; `-Infinity` quand l'événement n'accepte aucun remboursement. */
export function refundDeadlineMs(e: Pick<PayoutEventInput, 'start' | 'refundDays'>, fallback = DEFAULT_REFUND_DAYS) {
  const days = refundDaysOf(e, fallback);
  return days === 0 ? -Infinity : startMs(e.start) - days * DAY;
}

/** Le délai de remboursement est-il encore ouvert ? */
export const refundOpen = (e: Pick<PayoutEventInput, 'start' | 'refundDays'>, now: number, fallback = DEFAULT_REFUND_DAYS) => now < refundDeadlineMs(e, fallback);

/** Part des billets payants vendus (0 à 1). */
export function paidSoldShare(e: Pick<PayoutEventInput, 'tickets'>) {
  const paid = e.tickets.filter((t) => t.kind === 'paid');
  const quota = paid.reduce((a, t) => a + t.quota, 0);
  return quota > 0 ? paid.reduce((a, t) => a + t.sold, 0) / quota : 0;
}

export type PayoutReason = 'ok' | 'status' | 'window' | 'threshold';
export interface PayoutState {
  eligible: boolean;
  reason: PayoutReason;
  /** Billets payants vendus, en % (0 à 100, arrondi à l'unité inférieure). */
  percentSold: number;
  /** Quand l'argent pourra être versé (ms), si ce n'est pas déjà le cas et que la date est connue. */
  availableAt?: number;
}

/** Un versement est-il possible pour cet événement, et sinon pourquoi pas et à partir de quand ? */
export function payoutState(e: PayoutEventInput, now: number, fallback = DEFAULT_REFUND_DAYS): PayoutState {
  const percentSold = Math.floor(paidSoldShare(e) * 100 + 1e-9);
  if (!['published', 'ended'].includes(e.status)) return { eligible: false, reason: 'status', percentSold };
  const deadline = refundDeadlineMs(e, fallback);
  if (now < deadline) return { eligible: false, reason: 'window', percentSold, availableAt: deadline };
  const lastDays = startMs(e.start) - PAYOUT_LAST_DAYS * DAY;
  if (percentSold < PAYOUT_MIN_SOLD && now < lastDays) return { eligible: false, reason: 'threshold', percentSold, availableAt: lastDays };
  return { eligible: true, reason: 'ok', percentSold };
}

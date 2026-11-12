// Copie serveur de src/lib/fees.ts (même calcul ; un test vérifie qu'ils concordent).
// Le serveur recalcule toujours les montants : ceux envoyés par le navigateur sont ignorés.

export type Currency = 'HTG' | 'USD';
export const DEFAULT_RATE = 132;
/** Taux du jour (gourdes pour 1 dollar) : réglé par l'administrateur, relu depuis la base à chaque requête. */
export let USD_TO_HTG = DEFAULT_RATE;
export function setRate(n: number) {
  if (Number.isFinite(n) && n > 0) USD_TO_HTG = n;
}

export interface FeeSettings {
  percent: number;
  fixedHTG: number;
  passToBuyer: boolean;
  freeNoFee: boolean;
}
export const DEFAULT_FEES: FeeSettings = { percent: 5, fixedHTG: 25, passToBuyer: true, freeNoFee: true };

export function convert(amount: number, from: Currency, to: Currency) {
  if (from === to) return amount;
  return from === 'USD' ? amount * USD_TO_HTG : amount / USD_TO_HTG;
}

const round = (v: number, currency: Currency) => (currency === 'HTG' ? Math.round(v) : Math.round(v * 100) / 100);

export function computeFees(s: FeeSettings, amount: number, paidTickets: number, currency: Currency, customRate?: number) {
  const rate = customRate ?? s.percent;
  if (amount <= 0 && s.freeNoFee) return { rate, fee: 0, buyerFee: 0, total: 0, organizerNet: 0 };
  const fixed = convert(s.fixedHTG, 'HTG', currency) * paidTickets;
  const fee = round((amount * rate) / 100 + fixed, currency);
  const buyerFee = s.passToBuyer ? fee : 0;
  return {
    rate,
    fee,
    buyerFee,
    total: round(amount + buyerFee, currency),
    organizerNet: round(s.passToBuyer ? amount : amount - fee, currency),
  };
}

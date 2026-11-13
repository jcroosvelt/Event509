// Copie serveur de src/lib/fees.ts (même calcul ; un test vérifie qu'ils concordent).
// Le serveur recalcule toujours les montants : ceux envoyés par le navigateur sont ignorés.

/** Monnaie de comptabilité : les prix et les finances restent en gourdes (HTG) ou en dollars (USD). */
export type Currency = 'HTG' | 'USD';
/** Principales devises proposées à l'acheteur (copie de src/types.ts ; un test vérifie qu'elles concordent). */
export const DISPLAY_CURRENCIES = ['HTG', 'USD', 'EUR', 'GBP', 'CAD', 'CHF', 'JPY', 'CNY', 'AUD', 'MXN', 'BRL', 'DOP'] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];
export const isDisplayCurrency = (v: unknown): v is DisplayCurrency => typeof v === 'string' && (DISPLAY_CURRENCIES as readonly string[]).includes(v);

/** Taux de départ : gourdes (HTG) pour 1 unité. L'administrateur les règle, ils sont relus depuis la base. */
export const DEFAULT_RATES: Record<DisplayCurrency, number> = {
  HTG: 1, USD: 132, EUR: 145, GBP: 168, CAD: 96, CHF: 150, JPY: 0.88, CNY: 18.2, AUD: 86, MXN: 7.2, BRL: 24, DOP: 2.2,
};
export const RATES: Record<DisplayCurrency, number> = { ...DEFAULT_RATES };
/** Taux du dollar (gourdes pour 1 dollar), gardé pour les calculs de finances. */
export let USD_TO_HTG = RATES.USD;
export function setRates(next: Record<string, unknown>) {
  for (const c of DISPLAY_CURRENCIES) {
    const v = next[c];
    if (c !== 'HTG' && typeof v === 'number' && Number.isFinite(v) && v > 0) RATES[c] = v;
  }
  USD_TO_HTG = RATES.USD;
}
/** Devises sans centimes. */
export const zeroDecimal = (c: DisplayCurrency) => c === 'HTG' || c === 'JPY';

export interface FeeSettings {
  percent: number;
  fixedHTG: number;
  buyerShare: number;
  freeNoFee: boolean;
}
export const DEFAULT_FEES: FeeSettings = { percent: 5, fixedHTG: 0, buyerShare: 50, freeNoFee: true };

export function convert(amount: number, from: DisplayCurrency, to: DisplayCurrency) {
  if (from === to) return amount;
  return (amount * RATES[from]) / RATES[to];
}

export const round = (v: number, currency: DisplayCurrency) => (zeroDecimal(currency) ? Math.round(v) : Math.round(v * 100) / 100);

export function computeFees(s: FeeSettings, amount: number, paidTickets: number, currency: DisplayCurrency, customRate?: number) {
  const rate = customRate ?? s.percent;
  if (amount <= 0 && s.freeNoFee) return { rate, fee: 0, buyerFee: 0, organizerFee: 0, total: 0, organizerNet: 0 };
  const fixed = convert(s.fixedHTG, 'HTG', currency) * paidTickets;
  const fee = round((amount * rate) / 100 + fixed, currency);
  const share = Math.min(100, Math.max(0, Number.isFinite(s.buyerShare) ? s.buyerShare : 50));
  const buyerFee = round((fee * share) / 100, currency);
  const organizerFee = round(fee - buyerFee, currency);
  return {
    rate,
    fee,
    buyerFee,
    organizerFee,
    total: round(amount + buyerFee, currency),
    organizerNet: round(amount - organizerFee, currency),
  };
}

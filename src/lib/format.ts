import { DISPLAY_CURRENCIES, type DisplayCurrency, type Lang } from '@/types';

/**
 * Taux de change : gourdes (HTG) pour 1 unité de chaque devise. Les prix sont fixés en gourdes ; l'administrateur règle
 * ces taux (Administration > Commissions) et le serveur les transmet. Les valeurs ci-dessous servent de départ.
 */
export const DEFAULT_RATES: Record<DisplayCurrency, number> = {
  HTG: 1, USD: 132, EUR: 145, GBP: 168, CAD: 96, CHF: 150, JPY: 0.88, CNY: 18.2, AUD: 86, MXN: 7.2, BRL: 24, DOP: 2.2,
};
export const RATES: Record<DisplayCurrency, number> = { ...DEFAULT_RATES };
/** Taux du dollar (gourdes pour 1 dollar), gardé pour les calculs de finances. */
export let USD_TO_HTG = RATES.USD;
export function setRates(next: Partial<Record<DisplayCurrency, number>>) {
  for (const c of DISPLAY_CURRENCIES) {
    const v = next[c];
    if (c !== 'HTG' && typeof v === 'number' && Number.isFinite(v) && v > 0) RATES[c] = v;
  }
  USD_TO_HTG = RATES.USD;
}
export function setUsdToHtg(n: number) {
  setRates({ USD: n });
}
/** Devises sans centimes. */
export const zeroDecimal = (c: DisplayCurrency) => c === 'HTG' || c === 'JPY';

const locale = (lang: Lang) => (lang === 'en' ? 'en-US' : 'fr-FR');

export function convert(amount: number, from: DisplayCurrency, to: DisplayCurrency) {
  if (from === to) return amount;
  return (amount * RATES[from]) / RATES[to];
}

export function money(amount: number, currency: DisplayCurrency, lang: Lang = 'fr') {
  if (amount === 0) return lang === 'en' ? 'Free' : 'Gratuit';
  return moneyRaw(amount, currency, lang);
}

export function moneyRaw(amount: number, currency: DisplayCurrency, lang: Lang = 'fr') {
  const digits = !zeroDecimal(currency) && Math.round(amount * 100) % 100 !== 0 ? 2 : 0;
  if (currency === 'HTG') return `${new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 0 }).format(amount)} HTG`;
  if (currency === 'USD') return `$${new Intl.NumberFormat(locale(lang), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount)}`;
  return new Intl.NumberFormat(locale(lang), { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount);
}

/** Nom d'une devise dans la langue de l'interface (« euro », « Euro »…). */
export function currencyName(code: DisplayCurrency, lang: Lang = 'fr') {
  try {
    return new Intl.DisplayNames(locale(lang), { type: 'currency' }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function num(n: number, lang: Lang = 'fr') {
  return new Intl.NumberFormat(locale(lang)).format(n);
}

export function compact(n: number, lang: Lang = 'fr') {
  return new Intl.NumberFormat(locale(lang), { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export function dateLong(iso: string, lang: Lang = 'fr') {
  return new Date(iso).toLocaleDateString(locale(lang), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function dateShort(iso: string, lang: Lang = 'fr') {
  return new Date(iso).toLocaleDateString(locale(lang), { day: 'numeric', month: 'short' });
}

export function dateNumeric(iso: string, lang: Lang = 'fr') {
  return new Date(iso).toLocaleDateString(locale(lang), { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function time(iso: string, lang: Lang = 'fr') {
  return new Date(iso).toLocaleTimeString(locale(lang), { hour: '2-digit', minute: '2-digit' });
}

export function dayParts(iso: string, lang: Lang = 'fr') {
  const d = new Date(iso);
  return {
    day: d.getDate(),
    month: d.toLocaleDateString(locale(lang), { month: 'short' }).replace('.', ''),
    weekday: d.toLocaleDateString(locale(lang), { weekday: 'short' }).replace('.', ''),
  };
}

export function relative(iso: string, lang: Lang = 'fr') {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale(lang), { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
}

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Code de billet unique — en production il sera généré et signé par le backend. */
export function ticketCode() {
  const s = () => Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, 'X');
  return `E509-${s()}-${s()}`;
}

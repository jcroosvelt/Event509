import type { Currency, Lang } from '@/types';

// Taux de démonstration ; le backend fournira le taux du jour.
/** Taux du jour (gourdes pour 1 dollar) : réglé par l'administrateur, transmis par le serveur. */
export let USD_TO_HTG = 132;
export function setUsdToHtg(n: number) {
  if (Number.isFinite(n) && n > 0) USD_TO_HTG = n;
}

const locale = (lang: Lang) => (lang === 'en' ? 'en-US' : 'fr-FR');

export function convert(amount: number, from: Currency, to: Currency) {
  if (from === to) return amount;
  return from === 'USD' ? amount * USD_TO_HTG : amount / USD_TO_HTG;
}

export function money(amount: number, currency: Currency, lang: Lang = 'fr') {
  if (amount === 0) return lang === 'en' ? 'Free' : 'Gratuit';
  return moneyRaw(amount, currency, lang);
}

export function moneyRaw(amount: number, currency: Currency, lang: Lang = 'fr') {
  const digits = currency === 'USD' && Math.round(amount * 100) % 100 !== 0 ? 2 : 0;
  const n = new Intl.NumberFormat(locale(lang), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount);
  return currency === 'USD' ? `$${n}` : `${n} HTG`;
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

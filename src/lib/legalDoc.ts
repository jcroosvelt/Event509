/**
 * Documents légaux : lecture du format texte (titre, mise à jour, sections, puces) et insertion des valeurs
 * réglées par l'administrateur ({{email}}, {{commission}}…).
 */
import type { Lang } from '@/types';
import type { FeeSettings } from './fees';

export interface SiteInfo {
  address: string;
  email: string;
  sendChannel: string;
  resalePercent: string;
  payments: string;
  retention: string;
  replyDays: string;
  refundDelay: string;
  postponeDays: string;
  organizerRefundDays: string;
  errorHours: string;
  supportDays: string;
}

/** Valeurs de départ. Celles laissées vides (adresse, durée de conservation…) sont à renseigner par l'administrateur. */
export const defaultSiteInfo: SiteInfo = {
  address: '',
  email: 'privacy@event509.com',
  sendChannel: 'email',
  resalePercent: '20',
  payments: 'MonCash, NatCash, KashPaw, Visa, Mastercard',
  retention: '',
  replyDays: '30',
  refundDelay: '7-14',
  postponeDays: '7',
  organizerRefundDays: '',
  errorHours: '48',
  supportDays: '3',
};

/** Valeurs calculées à partir des réglages de commission : jamais saisies à la main, toujours à jour. */
export const AUTO_TOKENS = ['commission', 'commissionBuyer', 'commissionOrganizer', 'feeBuyer', 'feeOrganizer'];

const num = (n: number, lang: Lang) => String(Math.round(n * 100) / 100).replace('.', lang === 'en' ? '.' : ',');

/**
 * Commission en vigueur pour les documents légaux : taux total, part de l'acheteur et part de l'organisateur
 * (taux et frais fixes par billet partagés selon le réglage « part payée par l'acheteur »).
 */
export function feeTokens(f: FeeSettings, lang: Lang): Record<string, string> {
  const share = Math.min(100, Math.max(0, Number.isFinite(f.buyerShare) ? f.buyerShare : 50));
  const pct = (part: number) => (f.percent * part) / 100;
  const fixed = (part: number) => (f.fixedHTG * part) / 100;
  const text = (p: number, fx: number) => {
    const parts: string[] = [];
    if (p > 0) parts.push(lang === 'en' ? `${num(p, lang)}% of the ticket price` : `${num(p, lang)} % du prix du billet`);
    if (fx > 0) parts.push(lang === 'en' ? `${num(fx, lang)} HTG per ticket` : `${num(fx, lang)} HTG par billet`);
    return parts.length ? parts.join(' + ') : lang === 'en' ? 'no fee' : 'aucun frais';
  };
  return {
    commission: num(f.percent, lang),
    commissionBuyer: num(pct(share), lang),
    commissionOrganizer: num(pct(100 - share), lang),
    feeBuyer: text(pct(share), fixed(share)),
    feeOrganizer: text(pct(100 - share), fixed(100 - share)),
  };
}

/** Champs obligatoires pour que les documents soient complets. */
export const REQUIRED_SITE_FIELDS: (keyof SiteInfo)[] = ['address', 'email', 'retention', 'organizerRefundDays'];

export type Block = { kind: 'h' | 'p' | 'li' | 'note'; text: string };
export interface ParsedDoc {
  title: string;
  blocks: Block[];
}

/** « # » titre, « > » ligne de mise à jour, « ## » titre de section, « - » puce, le reste en paragraphes. */
export function parseDoc(text: string): ParsedDoc {
  let title = '';
  const blocks: Block[] = [];
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    if (line.startsWith('## ')) blocks.push({ kind: 'h', text: line.slice(3).trim() });
    else if (line.startsWith('# ')) title ||= line.slice(2).trim();
    else if (line.startsWith('> ')) blocks.push({ kind: 'note', text: line.slice(2).trim() });
    else if (/^[-•]\s+/.test(line)) blocks.push({ kind: 'li', text: line.replace(/^[-•]\s+/, '').trim() });
    else blocks.push({ kind: 'p', text: line.trim() });
  }
  return { title, blocks };
}

/** Remplace {{valeur}} par le réglage de l'administrateur ; s'il manque : « [à renseigner] ». */
export function fillTokens(text: string, values: Record<string, string>, lang: Lang) {
  const missing = lang === 'en' ? '[to be provided]' : '[à renseigner]';
  return text.replace(/\{\{(\w+)\}\}/g, (_, k: string) => (values[k]?.trim() ? values[k]!.trim() : missing));
}

/** Noms des valeurs utilisées dans un texte (pour avertir l'administrateur de celles qui manquent). */
export function tokensIn(text: string) {
  return [...new Set([...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]!))];
}

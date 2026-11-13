/**
 * Documents légaux : lecture du format texte (titre, mise à jour, sections, puces) et insertion des valeurs
 * réglées par l'administrateur ({{email}}, {{commission}}…).
 */
import type { Lang } from '@/types';

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

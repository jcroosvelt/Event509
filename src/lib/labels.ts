import type { Report } from '@/types';

/** Motifs de signalement d'un événement (page publique et modération). */
export const reportReason: Record<Report['reason'], string> = {
  misleading: 'Informations trompeuses',
  scam: 'Arnaque ou fausse billetterie',
  inappropriate: 'Contenu inapproprié',
  cancelled: 'Événement annulé ou inexistant',
  other: 'Autre problème',
};

/** Texte lisible de la destination d'un versement (nom et numéro MonCash/NatCash, ou email PayPal). */
export function destinationText(p: { method: string; destination?: { name?: string; phone?: string; email?: string } }) {
  const d = p.destination ?? {};
  return p.method === 'paypal' ? d.email ?? '' : [d.name, d.phone].filter(Boolean).join(' · ');
}

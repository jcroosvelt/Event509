import type { Report } from '@/types';

/** Motifs de signalement d'un événement (page publique et modération). */
export const reportReason: Record<Report['reason'], string> = {
  misleading: 'Informations trompeuses',
  scam: 'Arnaque ou fausse billetterie',
  inappropriate: 'Contenu inapproprié',
  cancelled: 'Événement annulé ou inexistant',
  other: 'Autre problème',
};

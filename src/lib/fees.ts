import { convert } from './format';
import type { Currency } from '@/types';

/** Réglages de commission de la plateforme (définis par l'administration). */
export interface FeeSettings {
  /** Pourcentage par défaut appliqué au prix après réduction. */
  percent: number;
  /** Frais fixes par billet payant, en HTG (convertis si la commande est en USD). */
  fixedHTG: number;
  /** true : l'acheteur paie les frais en plus ; false : ils sont déduits du revenu de l'organisateur. */
  passToBuyer: boolean;
  /** Aucun frais sur les commandes gratuites. */
  freeNoFee: boolean;
}

export const DEFAULT_FEES: FeeSettings = { percent: 5, fixedHTG: 25, passToBuyer: true, freeNoFee: true };

export interface FeeBreakdown {
  /** Taux appliqué (personnalisé ou par défaut). */
  rate: number;
  /** Commission totale prélevée par Event509. */
  fee: number;
  /** Part de la commission payée en plus par l'acheteur (0 si déduite de l'organisateur). */
  buyerFee: number;
  /** Montant payé par l'acheteur. */
  total: number;
  /** Montant reversé à l'organisateur. */
  organizerNet: number;
}

const round = (v: number, currency: Currency) => (currency === 'HTG' ? Math.round(v) : Math.round(v * 100) / 100);

/**
 * Calcule la commission d'une commande.
 * @param amount montant des billets après réduction, dans la devise de la commande
 * @param paidTickets nombre de billets payants (pour les frais fixes)
 * @param customRate taux négocié pour l'organisateur, s'il existe
 */
export function computeFees(s: FeeSettings, amount: number, paidTickets: number, currency: Currency, customRate?: number): FeeBreakdown {
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

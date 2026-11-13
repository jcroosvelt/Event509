import { convert, zeroDecimal } from './format';
import type { DisplayCurrency } from '@/types';

/** Réglages de commission de la plateforme (définis par l'administration). */
export interface FeeSettings {
  /** Pourcentage par défaut appliqué au prix après réduction. */
  percent: number;
  /** Frais fixes par billet payant, en HTG (convertis si la commande est en USD). */
  fixedHTG: number;
  /**
   * Part de la commission payée par l'acheteur, en % de la commission (0 à 100). Le reste est déduit du revenu de
   * l'organisateur. 50 : sur 5 % de commission, 2,5 % pour l'acheteur et 2,5 % pour l'organisateur.
   */
  buyerShare: number;
  /** Aucun frais sur les commandes gratuites. */
  freeNoFee: boolean;
}

export const DEFAULT_FEES: FeeSettings = { percent: 5, fixedHTG: 0, buyerShare: 50, freeNoFee: true };

export interface FeeBreakdown {
  /** Taux appliqué (personnalisé ou par défaut). */
  rate: number;
  /** Commission totale prélevée par Event509. */
  fee: number;
  /** Part de la commission payée en plus par l'acheteur. */
  buyerFee: number;
  /** Part de la commission déduite du revenu de l'organisateur. */
  organizerFee: number;
  /** Montant payé par l'acheteur. */
  total: number;
  /** Montant reversé à l'organisateur. */
  organizerNet: number;
}

const round = (v: number, currency: DisplayCurrency) => (zeroDecimal(currency) ? Math.round(v) : Math.round(v * 100) / 100);

/**
 * Calcule la commission d'une commande.
 * @param amount montant des billets après réduction, dans la devise de la commande
 * @param paidTickets nombre de billets payants (pour les frais fixes)
 * @param customRate taux négocié pour l'organisateur, s'il existe
 */
export function computeFees(s: FeeSettings, amount: number, paidTickets: number, currency: DisplayCurrency, customRate?: number): FeeBreakdown {
  const rate = customRate ?? s.percent;
  if (amount <= 0 && s.freeNoFee) return { rate, fee: 0, buyerFee: 0, organizerFee: 0, total: 0, organizerNet: 0 };
  const fixed = convert(s.fixedHTG, 'HTG', currency) * paidTickets;
  const fee = round((amount * rate) / 100 + fixed, currency);
  // La commission (taux + frais fixes) est partagée : l'acheteur en paie `buyerShare` %, l'organisateur le reste
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

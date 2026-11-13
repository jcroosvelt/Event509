import { DEMO, http } from './api';
import type {
  PremiumBenefit, PremiumConfig, PremiumPayment, PremiumSubscription, VerificationApplication, VerificationLogEntry, VerificationRequest,
} from '@/types';

/** Programme « Organisateur vérifié » : appels au serveur. Il n'existe pas en démonstration (aucun serveur, aucun paiement). */

export type PublicPremiumConfig = Pick<PremiumConfig, 'enabled' | 'monthlyPrice' | 'yearlyPrice' | 'validityDays' | 'requiredDocs' | 'processingDays' | 'minAge' | 'eligibility' | 'refund' | 'benefits' | 'visibilityBoost' | 'featuredPerOrganizer'> & { onlinePayment: boolean };

export interface PremiumOverview {
  config: PublicPremiumConfig;
  request: null | {
    status: VerificationRequest['status'];
    note: string | null;
    application: Partial<VerificationApplication>;
    submittedAt: string;
    approvedAt: string | null;
    appeal: { message: string; at: string } | null;
    docs: { type: VerificationRequest['docs'][number]['type']; name: string; uploadedAt: string }[];
  };
  subscription: PremiumSubscription | null;
  subscriptionActive: boolean;
  payments: PremiumPayment[];
  verified: boolean;
  verifiedSince: string | null;
  benefits: PremiumBenefit[];
  history: VerificationLogEntry[];
}

export const premiumAvailable = !DEMO;

export const getPremiumConfig = () => http<PublicPremiumConfig>('/premium/config');
export const getPremium = () => http<PremiumOverview>('/org/premium');
export const saveApplicationDraft = (application: Partial<VerificationApplication>) =>
  http<{ savedAt: string }>('/org/premium/draft', { method: 'PUT', body: JSON.stringify({ application }) });
export const submitApplication = () => http<null>('/org/premium/apply', { method: 'POST' });
export const sendAppeal = (message: string) => http<null>('/org/premium/appeal', { method: 'POST', body: JSON.stringify({ message }) });
export const subscribePremium = (plan: 'monthly' | 'yearly', method: string) =>
  http<{ paymentId: string; paid: boolean; manual?: boolean; payUrl?: string }>('/org/premium/subscribe', { method: 'POST', body: JSON.stringify({ plan, method }) });
export const cancelPremium = () => http<null>('/org/premium/cancel', { method: 'POST' });
export const resumePremium = () => http<null>('/org/premium/resume', { method: 'POST' });
export const checkPremiumPayment = (id: string) => http<{ status: 'paid' | 'pending' | 'failed' }>(`/premium/payments/${encodeURIComponent(id)}/check`, { method: 'POST' });
export const getInvoice = (id: string) => http<{ number: string; organization: string; payment: PremiumPayment }>(`/org/premium/payments/${encodeURIComponent(id)}/invoice`);

// Administration
export interface AdminVerification extends VerificationRequest {
  subscription?: PremiumSubscription | null;
  payments?: PremiumPayment[];
}
export const getAdminPremiumConfig = () => http<PremiumConfig>('/admin/premium/config');
export const saveAdminPremiumConfig = (c: PremiumConfig) => http<PremiumConfig>('/admin/premium/config', { method: 'PUT', body: JSON.stringify(c) });
export const getVerificationLog = (id: string) =>
  http<{ log: VerificationLogEntry[]; views: { id: string; at: string; admin: string; fileId: string }[] }>(`/admin/verifications/${encodeURIComponent(id)}/log`);
export const commentVerification = (id: string, note: string) => http<null>(`/admin/verifications/${encodeURIComponent(id)}/comment`, { method: 'POST', body: JSON.stringify({ note }) });
export const getPremiumAdmin = () =>
  http<{ subscriptions: (PremiumSubscription & { name: string })[]; payments: (PremiumPayment & { organizerId: string; name: string })[] }>('/admin/premium/subscriptions');
export const confirmPremiumPayment = (id: string) => http<unknown>(`/admin/premium/payments/${encodeURIComponent(id)}/confirm`, { method: 'POST' });
export const markPremiumRefunded = (id: string) => http<null>(`/admin/premium/payments/${encodeURIComponent(id)}/refunded`, { method: 'POST' });

// Statistiques avancées
export interface Analytics {
  range: { from: string; to: string };
  totals: { revenue: number; fees: number; net: number; tickets: number; orders: number; averageOrder: number };
  inventory: { capacity: number; sold: number; remaining: number };
  series: { day: string; tickets: number; revenue: number }[];
  events: { id: string; title: string; start: string; status: string; category: string; revenue: number; ticketsInPeriod: number; orders: number; views: number; quota: number; sold: number; remaining: number; conversion: number }[];
  categories: { id: string; revenue: number; tickets: number }[];
  sources: { key: 'direct' | 'promo' | 'ambassador'; orders: number; revenue: number }[];
  campaigns: { id: string; name: string; channel: string; status: string; sent: number; opened: number; clicks: number; date: string }[];
}
export const getAnalytics = (from: string, to: string) => http<Analytics>(`/org/analytics?from=${from}&to=${to}`);

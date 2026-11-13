import { DEMO, http } from './api';
import type {
  PremiumBenefit, PremiumConfig, PremiumPayment, PremiumSubscription, VerificationApplication, VerificationLogEntry, VerificationRequest,
} from '@/types';

/** Programme « Organisateur vérifié » : appels au serveur. Il n'existe pas en démonstration (aucun serveur, aucun paiement). */

export type PublicPremiumConfig = Pick<PremiumConfig, 'enabled' | 'yearlyPrice' | 'validityDays' | 'requiredDocs' | 'processingDays' | 'minAge' | 'eligibility' | 'refund' | 'benefits' | 'visibilityBoost' | 'featuredPerOrganizer'> & { onlinePayment: boolean };

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
export const subscribePremium = (method: string) =>
  http<{ paymentId: string; paid: boolean; manual?: boolean; payUrl?: string }>('/org/premium/subscribe', { method: 'POST', body: JSON.stringify({ plan: 'yearly', method }) });
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
  sources: { key: 'direct' | 'promo' | 'ambassador' | 'link'; orders: number; revenue: number }[];
  campaigns: { id: string; name: string; channel: string; status: string; sent: number; opened: number; clicks: number; date: string }[];
}
export const getAnalytics = (from: string, to: string) => http<Analytics>(`/org/analytics?from=${from}&to=${to}`);

// Gestionnaire multi-événements
export interface CalendarEvent { id: string; title: string; start: string; end: string; status: string; city: string; recurring: string | null; sold: number; quota: number }
export interface CalendarData { month: string; events: CalendarEvent[]; counts: { upcoming: number; past: number; cancelled: number; draft: number; total: number }; next: CalendarEvent[] }
export const getCalendar = (month: string) => http<CalendarData>(`/org/calendar?month=${month}`);
export interface EventTemplate { id: string; name: string; createdAt: string; event: Partial<import('@/types').EventItem> }
export const listTemplates = () => http<EventTemplate[]>('/org/templates');
export const saveTemplate = (eventId: string, name: string) => http<{ id: string; name: string }>('/org/templates', { method: 'POST', body: JSON.stringify({ eventId, name }) });
export const deleteTemplate = (id: string) => http<null>(`/org/templates/${encodeURIComponent(id)}`, { method: 'DELETE' });

// Équipes avancées : entrées par agent et journal d'activité
export interface TeamActivity {
  members: { id: string; name: string; role: string | null }[];
  agents: { id: string | null; name: string; scans: number; last: string | null; eventId: string; event: string }[];
  logs: { id: string; at: string; userId: string | null; user: string; action: string; target: string }[];
}
export const getTeamActivity = (user = '') => http<TeamActivity>(`/org/activity${user ? `?user=${encodeURIComponent(user)}` : ''}`);

// Support prioritaire
export interface SupportTicket { id: string; subject: string; category: 'technical' | 'billing' | 'event' | 'other'; priority: 'normal' | 'priority' | 'urgent'; status: 'open' | 'pending' | 'resolved'; createdAt: string; updatedAt: string; resolvedAt: string | null; organization?: string; last?: string }
export interface SupportMessage { id: string; from: 'organizer' | 'admin'; author: string; body: string; at: string }
export const getSupport = () => http<{ canCreate: boolean; tickets: SupportTicket[] }>('/org/support');
export const createSupportTicket = (i: { subject: string; body: string; category: string; eventDay: boolean }) => http<{ id: string }>('/org/support', { method: 'POST', body: JSON.stringify(i) });
export const getSupportTicket = (id: string, admin = false) => http<{ ticket: SupportTicket; messages: SupportMessage[] }>(`/${admin ? 'admin' : 'org'}/support/${encodeURIComponent(id)}`);
export const replySupport = (id: string, body: string) => http<null>(`/org/support/${encodeURIComponent(id)}/reply`, { method: 'POST', body: JSON.stringify({ body }) });
export const resolveSupport = (id: string) => http<null>(`/org/support/${encodeURIComponent(id)}/resolve`, { method: 'POST' });
export const getSupportInbox = (status = '') => http<SupportTicket[]>(`/admin/support${status ? `?status=${status}` : ''}`);
export const adminReplySupport = (id: string, body: string, resolve: boolean) => http<null>(`/admin/support/${encodeURIComponent(id)}/reply`, { method: 'POST', body: JSON.stringify({ body, resolve }) });
export const adminSupportStatus = (id: string, status: string) => http<null>(`/admin/support/${encodeURIComponent(id)}/status`, { method: 'POST', body: JSON.stringify({ status }) });

// Outils marketing
export interface TrackingLink { id: string; code: string; label: string; eventId: string | null; event: string | null; clicks: number; orders: number; revenue: number; conversion: number; createdAt: string }
export const listLinks = () => http<TrackingLink[]>('/org/links');
export const createLink = (label: string, eventId: string) => http<{ id: string; code: string }>('/org/links', { method: 'POST', body: JSON.stringify({ label, eventId }) });
export const deleteLink = (id: string) => http<null>(`/org/links/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const getAudience = (eventId: string) => http<{ consenting: number; buyers: number; mailConfigured: boolean; pushConfigured: boolean }>(`/org/audience?eventId=${encodeURIComponent(eventId)}`);
export const sendCampaign = (i: { name: string; subject: string; body: string; eventId: string; channels: string[] }) =>
  http<{ recipients: number; sentEmail: number; sentPush: number }>('/org/campaigns/send', { method: 'POST', body: JSON.stringify(i) });
export const unsubscribeMarketing = (o: string, e: string, token: string) => http<{ organization: string }>('/unsubscribe', { method: 'POST', body: JSON.stringify({ o, e, t: token }) });

// Gestion financière avancée
export interface FinanceData {
  range: { from: string; to: string };
  summary: { gross: number; fees: number; buyerFees: number; organizerFees: number; refunds: number; net: number; pendingAmount: number; pendingOrders: number; orders: number };
  balance: { HTG: number; USD: number; buyerShare: number };
  payoutTotals: Record<string, number>;
  monthly: { month: string; gross: number; fees: number; orders: number }[];
  transactions: { id: string; date: string; event: string; method: string; status: string; currency: 'HTG' | 'USD'; amount: number; fee: number; total: number; tickets: number }[];
  payouts: { id: string; reference: string; date: string; amount: number; currency: 'HTG' | 'USD'; method: string; status: string; priority: boolean }[];
}
export const getFinance = (from: string, to: string) => http<FinanceData>(`/org/finance?from=${from}&to=${to}`);

// Boost par événement
export interface BoostConfig { enabled: boolean; packages: { days: number; price: number }[]; maxActive: number }
export interface BoostPublicConfig extends BoostConfig { slotsLeft: number; onlinePayment: boolean }
export interface OrgBoost { id: string; eventId: string; event: string; days: number; amount: number; state: 'pending' | 'active' | 'ended' | 'canceled' | 'failed'; method: 'online' | 'transfer'; createdAt: string; startsAt: string | null; endsAt: string | null; views: number; orders: number; tickets: number }
export const getBoostConfig = () => http<BoostPublicConfig>('/boost/config');
export const listBoosts = () => http<OrgBoost[]>('/org/boosts');
export const createBoost = (eventId: string, days: number, method: string) =>
  http<{ id: string; paid: boolean; manual?: boolean; payUrl?: string }>('/org/boosts', { method: 'POST', body: JSON.stringify({ eventId, days, method }) });
export const checkBoostPayment = (id: string) => http<{ status: 'paid' | 'pending' | 'failed' }>(`/boost/payments/${encodeURIComponent(id)}/check`, { method: 'POST' });
export interface AdminBoost { id: string; event: string; organization: string; days: number; amount: number; state: OrgBoost['state']; method: 'online' | 'transfer'; createdAt: string; endsAt: string | null }
export const getAdminBoosts = () => http<{ config: BoostConfig; items: AdminBoost[] }>('/admin/boosts');
export const saveBoostConfig = (c: BoostConfig) => http<BoostConfig>('/admin/boost/config', { method: 'PUT', body: JSON.stringify(c) });
export const confirmBoost = (id: string) => http<null>(`/admin/boosts/${encodeURIComponent(id)}/confirm`, { method: 'POST' });
export const cancelBoost = (id: string) => http<null>(`/admin/boosts/${encodeURIComponent(id)}/cancel`, { method: 'POST' });

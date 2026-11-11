import type {
  Ambassador, AppUser, AuditEntry, Attendee, Campaign, Dispute, EventItem, IssuedTicket, NotificationItem, Order, Organizer, Payout,
  PlatformTarget, PromoCode, RefundRequest, Report, TeamMember, VerificationRequest,
} from '@/types';
import { DEFAULT_FEES } from '@/lib/fees';

export { categories, cities } from './catalog';

// Copie locale des données de l'application. Elle est vide au départ : en mode serveur elle est remplie
// par le serveur (voir `hydrate` dans src/services/api.ts) ; seule la version de démonstration la remplit
// avec des données fictives (src/data/demo.ts). Les composants ne la modifient jamais directement.
export const events: EventItem[] = [];
export const organizers: Organizer[] = [];
export const myTickets: IssuedTicket[] = [];
export const myOrders: Order[] = [];
export const attendees: Attendee[] = [];
export const resaleListings: IssuedTicket[] = [];
export const customCommissions: { organizerId: string; rate: number; reason: string }[] = [];
export const promoCodes: PromoCode[] = [];
export const team: TeamMember[] = [];
export const refunds: RefundRequest[] = [];
export const payouts: Payout[] = [];
export const campaigns: Campaign[] = [];
export const ambassadors: Ambassador[] = [];
export const users: AppUser[] = [];
export const disputes: Dispute[] = [];
export const reports: Report[] = [];
export const verificationRequests: VerificationRequest[] = [];
export const auditLog: AuditEntry[] = [];
export const platformTargets: PlatformTarget[] = [];
export const platformOrders: Order[] = [];
export const notifications: NotificationItem[] = [];

/** Paramètres de commission de la plateforme (valeurs par défaut ; le serveur fournit les réglages réels). */
export const platformSettings = { fees: { ...DEFAULT_FEES } };

// Modèles de données partagés. Ils reflètent le contrat attendu du futur backend.

export type Currency = 'HTG' | 'USD';
export type Lang = 'fr' | 'en';

export type CategoryId =
  | 'music' | 'party' | 'conference' | 'sport' | 'culture'
  | 'food' | 'business' | 'religion' | 'education' | 'online';

export interface Category {
  id: CategoryId;
  label: string;
}

export type TicketKind = 'free' | 'paid' | 'vip' | 'early_bird' | 'group';

export interface TicketType {
  id: string;
  name: string;
  kind: TicketKind;
  price: number; // en devise de l'événement
  quota: number;
  sold: number;
  salesStart: string; // ISO
  salesEnd: string; // ISO
  maxPerOrder: number;
  groupSize?: number; // pour les billets groupe
  description?: string;
}

export interface Session {
  id: string;
  label: string;
  start: string;
  end: string;
}

/** Plan de salle configurable : grille de rangs, allée, zones tarifaires. */
export interface SeatMapConfig {
  rows: number; // nombre de rangs (A, B, C…)
  cols: number; // places par rang
  aisleAfter: number; // allée après cette place (0 = aucune)
  zones: { ticketTypeId: string; fromRow: number; toRow: number }[]; // rangs 0-indexés inclus
  blocked: string[]; // places neutralisées (ex. « C-4 »)
}

export interface Venue {
  name: string;
  address: string;
  city: string;
}

export type EventStatus = 'draft' | 'pending' | 'published' | 'rejected' | 'cancelled' | 'ended';

export interface EventItem {
  id: string;
  slug: string;
  title: string;
  description: string;
  cover: string; // gradient CSS ou URL d'image (le premier visuel quand il y en a)
  /** Jusqu'à 5 visuels de l'événement ; le premier est le visuel principal. */
  images?: string[];
  categories: CategoryId[];
  start: string;
  end: string;
  sessions?: Session[];
  recurring?: 'weekly' | 'monthly' | null;
  venue: Venue | null;
  online?: { platform: string; url: string } | null;
  currency: Currency;
  tickets: TicketType[];
  organizerId: string;
  status: EventStatus;
  seated: boolean; // plan de salle (places numérotées)
  seatMap?: SeatMapConfig;
  /** Pixels de suivi propres à l'événement. */
  pixels?: { fb?: string; ga?: string };
  maxPerPerson: number;
  views: number;
  featured?: boolean;
  tags?: string[];
}

export interface Organizer {
  id: string;
  slug: string;
  name: string;
  bio?: string;
  website?: string;
  instagram?: string;
  cover?: string;
  verified: boolean;
  avatar: string;
  /** Logo envoyé par l'organisateur (adresse /api/files/…) ; sinon les initiales sont affichées. */
  logo?: string;
  followers: number;
  eventsCount: number;
  city: string;
}

export type PaymentMethod = 'card' | 'moncash' | 'natcash' | 'kashpaw' | 'paypal' | 'transfer';

export type TicketStatus = 'pending' | 'valid' | 'used' | 'transferred' | 'refunded' | 'resale';

export interface IssuedTicket {
  id: string;
  code: string; // valeur unique encodée dans le QR
  eventId: string;
  ticketTypeId: string;
  holderName: string;
  holderEmail: string;
  seat?: string;
  status: TicketStatus;
  orderId: string;
  checkedInAt?: string;
  /** Session ou date choisie (événements multi-sessions ou récurrents). */
  sessionLabel?: string;
  resalePrice?: number;
  transferredTo?: string;
}

export interface Order {
  id: string;
  eventId: string;
  createdAt: string;
  items: { ticketTypeId: string; qty: number; unitPrice: number; seats?: string[] }[];
  subtotal: number;
  discount: number;
  fees: number;
  total: number;
  currency: Currency;
  method: PaymentMethod;
  status: 'paid' | 'pending' | 'refunded' | 'partially_refunded' | 'cancelled';
  buyerName: string;
  buyerEmail: string;
  buyerPhone?: string;
  promoCode?: string;
  referral?: string;
  sessionLabel?: string;
  refundRequest?: { reason: string; at: string; status: 'pending' | 'approved' | 'declined' };
}

export interface PromoCode {
  id: string;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  used: number;
  limit: number;
  expiresAt: string;
  eventId: string | 'all';
  active: boolean;
}

export type TeamRole = 'admin' | 'staff' | 'accountant';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  status: 'active' | 'invited';
  lastActive?: string;
}

export interface Attendee {
  id: string;
  eventId: string;
  name: string;
  email: string;
  phone: string;
  ticketType: string;
  orderId: string;
  checkedIn: boolean;
  checkedInAt?: string;
  purchasedAt: string;
  amount: number;
  code: string;
  /** Place numérotée et session, pour les vérifier à l'entrée. */
  seat?: string;
  sessionLabel?: string;
}

export interface RefundRequest {
  id: string;
  orderId: string;
  buyer: string;
  eventTitle: string;
  amount: number;
  currency: Currency;
  reason: string;
  createdAt: string;
  status: 'pending' | 'approved' | 'declined';
}

export interface Payout {
  id: string;
  organizerId: string;
  amount: number;
  currency: Currency;
  method: 'moncash' | 'natcash' | 'paypal';
  /** Où envoyer l'argent : MonCash et NatCash = numéro + nom complet du titulaire ; PayPal = adresse email PayPal. */
  destination: { name?: string; phone?: string; email?: string };
  /** requested : demandé par l'organisateur, en attente de validation par l'administration. */
  status: 'requested' | 'processing' | 'scheduled' | 'paid' | 'rejected';
  date: string;
  reference: string;
}

export interface Campaign {
  id: string;
  body?: string;
  name: string;
  channel: 'email' | 'sms' | 'whatsapp';
  audience: string;
  status: 'draft' | 'scheduled' | 'sent';
  sent: number;
  opened: number;
  clicks: number;
  date: string;
}

export interface Ambassador {
  id: string;
  name: string;
  code: string;
  clicks: number;
  sales: number;
  revenue: number;
  commission: number; // %
}

export interface AppUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatar: string;
  role: 'participant' | 'organizer' | 'admin';
  city: string;
  status: 'active' | 'suspended';
  joinedAt: string;
  verified?: boolean;
  /** Rôle dans l'équipe d'un organisateur (organisateurs uniquement). */
  teamRole?: TeamRole;
  /** Organisation dont l'utilisateur fait partie (fournie par le serveur). */
  organizerId?: string;
}

export interface Dispute {
  id: string;
  orderId: string;
  opener: string;
  against: string;
  subject: string;
  amount: number;
  currency: Currency;
  status: 'open' | 'investigating' | 'resolved';
  createdAt: string;
  decision?: 'refund_full' | 'refund_half' | 'reject';
  note?: string;
  refunded?: number;
  messages: { from: 'opener' | 'against' | 'admin'; author: string; body: string; at: string }[];
}

/** Signalement d'un événement par un participant. */
export interface Report {
  id: string;
  eventId: string;
  reason: 'misleading' | 'scam' | 'inappropriate' | 'cancelled' | 'other';
  details: string;
  reporter: string;
  status: 'open' | 'dismissed' | 'actioned';
  createdAt: string;
}

/** Demande de vérification d'un organisateur et ses pièces justificatives. */
export interface VerificationRequest {
  id: string;
  organizerId?: string;
  name: string;
  owner: string;
  email: string;
  city: string;
  docs: { type: 'id' | 'license' | 'bank'; file: string; uploadedAt: string; /** Fichier envoyé (mode serveur). */ fileId?: string }[];
  status: 'pending' | 'approved' | 'rejected' | 'docs_requested';
  submittedAt: string;
  note?: string;
}

/** Entrée du journal des actions de l'administration. */
export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
}

/** Objectif de la plateforme suivi sur le tableau de bord admin. */
export interface PlatformTarget {
  id: string;
  title: string;
  metric: 'gmv' | 'tickets' | 'organizers' | 'users';
  target: number;
  deadline: string;
  tone: 'brand' | 'navy';
  description?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  date: string;
  read: boolean;
  kind: 'reminder' | 'update' | 'sale' | 'system';
}

/** Avis laissé par un acheteur après l'événement (un seul par commande). */
export interface Review {
  id: string;
  eventId: string;
  rating: number; // 1 à 5
  comment: string;
  author: string; // prénom et initiale du nom
  createdAt: string;
  reply?: { body: string; at: string };
}

// Modèles de données partagés. Ils reflètent le contrat attendu du futur backend.

/** Monnaie de comptabilité : les prix et les finances restent en gourdes (HTG) ou en dollars (USD). */
export type Currency = 'HTG' | 'USD';
/** Principales devises du monde proposées à l'acheteur (affichage et conversion) ; les prix sont fixés en gourdes. */
export const DISPLAY_CURRENCIES = ['HTG', 'USD', 'EUR', 'GBP', 'CAD', 'CHF', 'JPY', 'CNY', 'AUD', 'MXN', 'BRL', 'DOP'] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];
export const isDisplayCurrency = (v: unknown): v is DisplayCurrency => typeof v === 'string' && (DISPLAY_CURRENCIES as readonly string[]).includes(v);
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
  /** Pays du lieu (code à 2 lettres, ex. HT, US). Sans valeur : déduit de la ville, sinon Haïti. */
  country?: string;
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
  /** Fin du boost payant (fixée par le serveur) : tant qu'elle n'est pas passée, l'événement est « Sponsorisé ». */
  boostedUntil?: string;
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
  /** Pays et nature de l'organisation (renseignés à l'inscription). */
  country?: string;
  kind?: string;
  /** Réservés aux organisateurs vérifiés (avantage « page professionnelle ») : fixés par le serveur. */
  brandColor?: string;
  socials?: { facebook?: string; tiktok?: string; youtube?: string; linkedin?: string; x?: string };
  /** Date de certification (calculée par le serveur) ; ancien(s) lien(s) de la page, qui redirigent encore. */
  verifiedSince?: string;
  oldSlugs?: string[];
  /** Coup de pouce de visibilité en % (tri « Populaires »), fixé par le serveur pour un organisateur vérifié ; absent sinon. */
  priority?: number;
  /** Avantages premium actuellement actifs (fixés par le serveur, jamais par l'organisateur). */
  perks?: PremiumBenefit[];
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
  /** Devise choisie par l'acheteur quand ce n'est pas la devise de comptabilité (gourdes ou dollars), à titre indicatif. */
  displayCurrency?: DisplayCurrency;
  displayTotal?: number;
  method: PaymentMethod;
  status: 'paid' | 'pending' | 'refunded' | 'partially_refunded' | 'cancelled';
  buyerName: string;
  buyerEmail: string;
  buyerPhone?: string;
  promoCode?: string;
  referral?: string;
  /** Code d'un lien de suivi (outils marketing) et consentement à recevoir les actualités de l'organisateur. */
  src?: string;
  marketingOptIn?: boolean;
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
  /** Options avancées (avantage « outils marketing ») : début de validité, billets minimum, un seul type de billet, usages par email. */
  startsAt?: string;
  minQty?: number;
  ticketTypeId?: string;
  perEmailLimit?: number;
}

export type TeamRole = 'admin' | 'manager' | 'lead' | 'staff' | 'accountant';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  status: 'active' | 'invited';
  lastActive?: string;
  /** Permissions personnalisées (remplacent celles du rôle) ; absent = permissions du rôle. */
  perms?: string[];
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
  /** Demande prioritaire (avantage « finance ») : traitée en premier, mais soumise aux mêmes contrôles financiers. */
  priority?: boolean;
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
  /** Faux tant que l'adresse email n'est pas confirmée (seulement quand l'envoi d'emails est configuré). */
  emailVerified?: boolean;
  /** Rôle dans l'équipe d'un organisateur (organisateurs uniquement). */
  teamRole?: TeamRole;
  /** Organisation dont l'utilisateur fait partie (fournie par le serveur). */
  organizerId?: string;
  /** Permissions personnalisées du membre (fournies par le serveur). */
  teamPerms?: string[];
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
export type VerificationStatus = 'draft' | 'pending' | 'in_review' | 'docs_requested' | 'approved' | 'rejected' | 'suspended' | 'expired';
export type VerificationDocType = 'id' | 'license' | 'bank' | 'selfie' | 'registration' | 'representation';

/** Formulaire de demande « Organisateur vérifié » (enregistré automatiquement au fil de la saisie). */
export interface VerificationApplication {
  fullName: string;
  birthDate: string; // AAAA-MM-JJ
  email: string;
  phone: string;
  country: string;
  orgName: string;
  orgType: 'company' | 'association' | 'institution' | 'agency' | 'independent' | '';
  activity: string;
  address?: string;
  website?: string;
  socials?: string;
  /** Mineur représenté légalement : le justificatif de représentation est alors obligatoire. */
  legalRep?: boolean;
  acceptedTerms?: boolean;
  confirmedAccurate?: boolean;
}

/** Demande de vérification d'un organisateur et ses pièces justificatives. */
export interface VerificationRequest {
  id: string;
  organizerId?: string;
  name: string;
  owner: string;
  email: string;
  city: string;
  docs: { type: VerificationDocType; file: string; uploadedAt: string; /** Fichier envoyé (mode serveur). */ fileId?: string }[];
  status: VerificationStatus;
  submittedAt: string;
  note?: string;
  application?: Partial<VerificationApplication>;
  approvedAt?: string;
  /** Recours de l'organisateur après un refus. */
  appeal?: { message: string; at: string };
  /** Contrôles faits par l'administration au moment de la décision. */
  checklist?: { identity?: boolean; email?: boolean; phone?: boolean; presence?: boolean };
}

export type PremiumBenefit = 'profile' | 'visibility' | 'analytics' | 'multiEvents' | 'team' | 'support' | 'marketing' | 'page' | 'finance' | 'api';

/** Réglages du programme, modifiables par l'administration (aucun prix n'est fixé dans le code). */
export interface PremiumConfig {
  enabled: boolean;
  /** Prix unique du programme, payé en une seule fois pour une année (HTG). */
  yearlyPrice: number;
  validityDays: number; // durée de validité de la certification
  requiredDocs: VerificationDocType[];
  processingDays: number;
  minAge: number;
  eligibility: string[];
  refund: { onRejection: 'full' | 'partial' | 'none'; percent: number };
  renewal: { remindDays: number[]; graceDays: number };
  benefits: Record<PremiumBenefit, boolean>;
  notify: { onDecision: boolean; onExpiry: boolean };
  apiLimits: { perMinute: number; maxKeys: number };
  /** Visibilité : coup de pouce (%) dans le tri « Populaires » et nombre d'événements pouvant être mis en vedette. */
  visibilityBoost: number;
  featuredPerOrganizer: number;
}

export interface PremiumPayment {
  id: string;
  plan: 'monthly' | 'yearly';
  amount: number;
  status: 'pending' | 'paid' | 'failed' | 'refund_due' | 'refunded';
  method: 'online' | 'transfer';
  createdAt: string;
  paidAt?: string;
  refundAmount?: number;
}

export interface PremiumSubscription {
  id: string;
  organizerId: string;
  plan: 'monthly' | 'yearly';
  status: 'pending_payment' | 'active' | 'canceled' | 'expired' | 'suspended';
  startedAt?: string;
  expiresAt?: string;
  cancelAtPeriodEnd?: boolean;
}

export interface VerificationLogEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  note?: string;
  internal?: boolean;
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

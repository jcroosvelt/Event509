// Modèles de données partagés. Ils reflètent le contrat attendu du futur backend.

export type Currency = 'HTG' | 'USD';
export type Lang = 'fr' | 'en';

export type CategoryId =
  | 'music' | 'party' | 'conference' | 'sport' | 'culture'
  | 'food' | 'business' | 'religion' | 'education' | 'online';

export interface Category {
  id: CategoryId;
  label: string;
  emoji: string;
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
  cover: string; // gradient CSS ou URL d'image
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
  maxPerPerson: number;
  views: number;
  featured?: boolean;
  tags?: string[];
}

export interface Organizer {
  id: string;
  name: string;
  verified: boolean;
  avatar: string;
  followers: number;
  eventsCount: number;
  city: string;
}

export type PaymentMethod = 'card' | 'moncash' | 'natcash' | 'paypal' | 'transfer';

export type TicketStatus = 'valid' | 'used' | 'transferred' | 'refunded' | 'resale';

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
  amount: number;
  currency: Currency;
  method: 'moncash' | 'bank' | 'paypal';
  status: 'paid' | 'processing' | 'scheduled';
  date: string;
  reference: string;
}

export interface Campaign {
  id: string;
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
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  date: string;
  read: boolean;
  kind: 'reminder' | 'update' | 'sale' | 'system';
}

import type {
  Ambassador, AppUser, AuditEntry, Attendee, Campaign, Category, Dispute, EventItem, IssuedTicket,
  NotificationItem, Order, Organizer, Payout, PlatformTarget, PromoCode, RefundRequest, Report, TeamMember, VerificationRequest,
} from '@/types';

// Données de démonstration. Toute cette couche sera remplacée par le backend
// via src/services/api.ts — les composants ne lisent jamais ce fichier directement.

export const categories: Category[] = [
  { id: 'music', label: 'Musique', emoji: '🎵' },
  { id: 'party', label: 'Soirées', emoji: '🎉' },
  { id: 'conference', label: 'Conférences', emoji: '🎤' },
  { id: 'sport', label: 'Sport', emoji: '⚽' },
  { id: 'culture', label: 'Culture', emoji: '🎭' },
  { id: 'food', label: 'Gastronomie', emoji: '🍽️' },
  { id: 'business', label: 'Business', emoji: '💼' },
  { id: 'education', label: 'Formation', emoji: '📚' },
  { id: 'religion', label: 'Spirituel', emoji: '🕊️' },
  { id: 'online', label: 'En ligne', emoji: '💻' },
];

export const cities = ['Port-au-Prince', 'Pétion-Ville', 'Cap-Haïtien', 'Jacmel', 'Les Cayes', 'Gonaïves', 'Miami', 'Montréal'];

export const organizers: Organizer[] = [
  { id: 'org1', slug: 'lakay-productions', bio: 'Concerts, festivals et soirées depuis 2012. Les plus grandes scènes kompa du pays.', website: 'https://lakay.ht', instagram: '@lakayprod', cover: 'linear-gradient(135deg, #1F5EFF 0%, #0B1533 100%)', name: 'Lakay Productions', verified: true, avatar: 'LP', followers: 12400, eventsCount: 38, city: 'Pétion-Ville' },
  { id: 'org2', slug: 'tech-ayiti', bio: 'La communauté tech haïtienne : conférences, ateliers et formations.', website: 'https://techayiti.org', cover: 'linear-gradient(135deg, #7C5CFF 0%, #1F5EFF 100%)', name: 'Tech Ayiti', verified: true, avatar: 'TA', followers: 5300, eventsCount: 14, city: 'Port-au-Prince' },
  { id: 'org3', slug: 'jakmel-arts', bio: 'Artisans du papier mâché et organisateurs culturels de Jacmel.', cover: 'linear-gradient(135deg, #FF8A3D 0%, #E5487A 100%)', name: 'Jakmèl Arts Collectif', verified: false, avatar: 'JA', followers: 2100, eventsCount: 9, city: 'Jacmel' },
  { id: 'org4', slug: 'saveurs-du-nord', bio: 'Dîners de chefs et festivals gastronomiques au Cap-Haïtien.', cover: 'linear-gradient(135deg, #0FA37F 0%, #0B1533 100%)', name: 'Saveurs du Nord', verified: true, avatar: 'SN', followers: 3900, eventsCount: 21, city: 'Cap-Haïtien' },
];

const g = (a: string, b: string, c?: string) =>
  `linear-gradient(135deg, ${a} 0%, ${b} ${c ? '55%' : '100%'}${c ? `, ${c} 100%` : ''})`;

const T = (
  id: string, name: string, kind: EventItem['tickets'][number]['kind'], price: number,
  quota: number, sold: number, extra: Partial<EventItem['tickets'][number]> = {},
) => ({
  id, name, kind, price, quota, sold,
  salesStart: '2026-10-01T00:00:00', salesEnd: '2026-12-31T23:59:00', maxPerOrder: 6, ...extra,
});

export const events: EventItem[] = [
  {
    id: 'e1', slug: 'festival-kompa-live-2026', title: 'Festival Kompa Live 2026',
    description:
      "Trois scènes, douze groupes et une nuit entière de kompa sous les étoiles. Le rendez-vous musical de fin d'année avec les meilleurs groupes du pays et de la diaspora. Restauration sur place, parking sécurisé et zone VIP avec vue sur la grande scène.",
    cover: g('#1F5EFF', '#0B1533', '#0A0F24'), categories: ['music', 'party'],
    start: '2026-12-19T19:00:00', end: '2026-12-20T04:00:00',
    venue: { name: 'Parc Historique de la Canne à Sucre', address: 'Route de Tabarre', city: 'Port-au-Prince' },
    currency: 'HTG', organizerId: 'org1', status: 'published', seated: false, maxPerPerson: 8,
    views: 18420, featured: true, tags: ['Plein air', 'Live'],
    tickets: [
      T('t1a', 'Early Bird', 'early_bird', 1500, 500, 500, { salesEnd: '2026-11-01T00:00:00', description: 'Tarif lancement, quantité limitée' }),
      T('t1b', 'Standard', 'paid', 2500, 3000, 2140),
      T('t1c', 'VIP', 'vip', 7500, 300, 212, { description: 'Accès zone VIP, open bar, entrée rapide', maxPerOrder: 4 }),
      T('t1d', 'Pack Groupe x5', 'group', 10000, 120, 64, { groupSize: 5, maxPerOrder: 2, description: '5 entrées standard' }),
    ],
  },
  {
    id: 'e2', slug: 'ayiti-tech-summit', title: 'Ayiti Tech Summit',
    description:
      "La conférence annuelle de l'écosystème tech haïtien : startups, investisseurs, développeurs et étudiants. Keynotes, ateliers pratiques, salon de l'emploi et concours de pitch avec 500 000 HTG à gagner.",
    cover: g('#5B8CFF', '#1F5EFF', '#123AA8'), categories: ['conference', 'business', 'education'],
    start: '2026-11-27T08:30:00', end: '2026-11-28T18:00:00',
    sessions: [
      { id: 's1', label: 'Jour 1 — Keynotes & panels', start: '2026-11-27T08:30:00', end: '2026-11-27T18:00:00' },
      { id: 's2', label: 'Jour 2 — Ateliers & pitch', start: '2026-11-28T09:00:00', end: '2026-11-28T18:00:00' },
    ],
    venue: { name: 'Hôtel Marriott', address: '147 Avenue Jean Paul II', city: 'Port-au-Prince' },
    online: { platform: 'YouTube Live', url: 'https://youtube.com' },
    currency: 'HTG', organizerId: 'org2', status: 'published', seated: true, maxPerPerson: 4,
    seatMap: { rows: 10, cols: 16, aisleAfter: 8, zones: [{ ticketTypeId: 't2c', fromRow: 0, toRow: 1 }, { ticketTypeId: 't2b', fromRow: 2, toRow: 7 }, { ticketTypeId: 't2a', fromRow: 8, toRow: 9 }], blocked: [] },
    views: 9310, featured: true, tags: ['Hybride', '2 jours'],
    tickets: [
      T('t2a', 'Étudiant', 'paid', 1000, 400, 288, { description: "Carte d'étudiant exigée à l'entrée" }),
      T('t2b', 'Pass 2 jours', 'paid', 3500, 600, 341),
      T('t2c', 'Pass VIP + dîner', 'vip', 9000, 80, 51, { maxPerOrder: 2 }),
      T('t2d', 'Accès en ligne', 'free', 0, 5000, 1820, { description: 'Lien de streaming envoyé par email' }),
    ],
  },
  {
    id: 'e3', slug: 'carnaval-jacmel-parade', title: 'Grande Parade des Masques',
    description:
      "Les ateliers de papier mâché de Jacmel défilent dans les rues de la vieille ville. Tribunes réservées, visite guidée des ateliers et rencontre avec les artisans.",
    cover: g('#FF8A3D', '#E5487A', '#5B2BC9'), categories: ['culture'],
    start: '2027-02-14T13:00:00', end: '2027-02-14T20:00:00',
    venue: { name: 'Place Toussaint Louverture', address: 'Centre-ville', city: 'Jacmel' },
    currency: 'HTG', organizerId: 'org3', status: 'published', seated: true, maxPerPerson: 6,
    seatMap: { rows: 8, cols: 14, aisleAfter: 7, zones: [{ ticketTypeId: 't3b', fromRow: 0, toRow: 1 }, { ticketTypeId: 't3a', fromRow: 2, toRow: 7 }], blocked: [] },
    views: 4250, tags: ['Famille'],
    tickets: [
      T('t3a', 'Tribune', 'paid', 1200, 800, 190),
      T('t3b', 'Tribune + visite atelier', 'vip', 3000, 120, 36),
    ],
  },
  {
    id: 'e4', slug: 'nuit-gastronomique-cap', title: 'Nuit Gastronomique du Cap',
    description: "Six chefs, six plats, une soirée. Menu dégustation autour des produits du Nord, accords rhum et live jazz créole.",
    cover: g('#0FA37F', '#0B6B60', '#0B1533'), categories: ['food'],
    start: '2026-12-05T19:30:00', end: '2026-12-05T23:30:00',
    venue: { name: 'Hôtel Roi Christophe', address: 'Rue 24-B', city: 'Cap-Haïtien' },
    currency: 'USD', organizerId: 'org4', status: 'published', seated: true, maxPerPerson: 4,
    seatMap: { rows: 6, cols: 10, aisleAfter: 5, zones: [{ ticketTypeId: 't4b', fromRow: 0, toRow: 0 }, { ticketTypeId: 't4a', fromRow: 1, toRow: 5 }], blocked: ['A-5', 'A-6'] },
    views: 2890, tags: ['Places limitées'],
    tickets: [T('t4a', 'Menu dégustation', 'paid', 85, 120, 97), T('t4b', 'Table chef (x4)', 'group', 300, 6, 4, { groupSize: 4, maxPerOrder: 1 })],
  },
  {
    id: 'e5', slug: 'tournoi-foot-quartiers', title: 'Tournoi des Quartiers — Finale',
    description: "La finale du tournoi inter-quartiers. Animations, DJ à la mi-temps et remise des trophées.",
    cover: g('#22C55E', '#15803D', '#0B1533'), categories: ['sport'],
    start: '2026-11-22T15:00:00', end: '2026-11-22T19:00:00',
    venue: { name: 'Stade Sylvio Cator', address: 'Rue Oswald Durand', city: 'Port-au-Prince' },
    currency: 'HTG', organizerId: 'org1', status: 'published', seated: false, maxPerPerson: 10,
    views: 6120, tags: ['Gratuit -12 ans'],
    tickets: [T('t5a', 'Gradins', 'paid', 300, 8000, 3900), T('t5b', 'Enfant -12 ans', 'free', 0, 1500, 640)],
  },
  {
    id: 'e6', slug: 'masterclass-marketing-digital', title: 'Masterclass Marketing Digital',
    description: "Quatre semaines pour maîtriser la publicité sur les réseaux sociaux et WhatsApp Business. Sessions en ligne chaque mardi soir.",
    cover: g('#7C5CFF', '#1F5EFF'), categories: ['education', 'online', 'business'],
    start: '2026-11-17T19:00:00', end: '2026-12-08T21:00:00', recurring: 'weekly',
    venue: null, online: { platform: 'Zoom', url: 'https://zoom.us' },
    currency: 'USD', organizerId: 'org2', status: 'published', seated: false, maxPerPerson: 1,
    views: 1730, tags: ['Récurrent', 'Certificat'],
    tickets: [T('t6a', 'Programme complet', 'paid', 49, 200, 118), T('t6b', 'Première session', 'free', 0, 500, 260)],
  },
  {
    id: 'e7', slug: 'concert-gospel-noel', title: 'Concert Gospel de Noël',
    description: "Chorales réunies pour un concert de Noël exceptionnel. Places numérotées.",
    cover: g('#F4B740', '#E07A1F', '#7A2E0E'), categories: ['religion', 'music'],
    start: '2026-12-24T18:00:00', end: '2026-12-24T21:00:00',
    venue: { name: 'Cathédrale Sainte-Trinité', address: 'Avenue Mgr Guilloux', city: 'Port-au-Prince' },
    currency: 'HTG', organizerId: 'org1', status: 'published', seated: true, maxPerPerson: 6,
    seatMap: { rows: 12, cols: 18, aisleAfter: 9, zones: [{ ticketTypeId: 't7a', fromRow: 0, toRow: 4 }, { ticketTypeId: 't7b', fromRow: 5, toRow: 11 }], blocked: [] },
    views: 3010,
    tickets: [T('t7a', 'Catégorie 1', 'paid', 1500, 300, 210), T('t7b', 'Catégorie 2', 'paid', 800, 500, 260)],
  },
  {
    id: 'e8', slug: 'rooftop-sunset-session', title: 'Rooftop Sunset Session',
    description: "Afro house et kompa au coucher du soleil sur le toit le plus haut de Pétion-Ville.",
    cover: g('#FF5E7E', '#7C3AED', '#0B1533'), categories: ['party', 'music'],
    start: '2026-11-14T17:00:00', end: '2026-11-15T01:00:00',
    venue: { name: 'Sky Lounge', address: 'Rue Lamarre', city: 'Pétion-Ville' },
    currency: 'USD', organizerId: 'org1', status: 'published', seated: false, maxPerPerson: 6,
    views: 5480, tags: ['21+'],
    tickets: [T('t8a', 'Entrée', 'paid', 25, 350, 301), T('t8b', 'Table VIP (x6)', 'group', 400, 12, 11, { groupSize: 6, maxPerOrder: 1 })],
  },
  {
    id: 'e9', slug: 'salon-entrepreneuriat-femmes', title: "Salon de l'Entrepreneuriat Féminin",
    description: "Exposantes, mentorat et tables rondes. Événement en attente de validation.",
    cover: g('#EC4899', '#BE185D'), categories: ['business'],
    start: '2027-01-23T09:00:00', end: '2027-01-23T17:00:00',
    venue: { name: 'Centre de Convention', address: 'Delmas 33', city: 'Port-au-Prince' },
    currency: 'HTG', organizerId: 'org3', status: 'pending', seated: false, maxPerPerson: 4,
    views: 0, tickets: [T('t9a', 'Visiteur', 'free', 0, 600, 0), T('t9b', 'Exposante', 'paid', 5000, 40, 0)],
  },
];

export const myTickets: IssuedTicket[] = [
  { id: 'it1', code: 'E509-K7Q2-91XA', eventId: 'e1', ticketTypeId: 't1c', holderName: 'Marie Joseph', holderEmail: 'marie@example.com', status: 'valid', orderId: 'o1001' },
  { id: 'it2', code: 'E509-K7Q2-91XB', eventId: 'e1', ticketTypeId: 't1c', holderName: 'Marie Joseph', holderEmail: 'marie@example.com', status: 'valid', orderId: 'o1001' },
  { id: 'it3', code: 'E509-TS26-4471', eventId: 'e2', ticketTypeId: 't2b', holderName: 'Marie Joseph', holderEmail: 'marie@example.com', seat: 'B-14', status: 'valid', orderId: 'o1002' },
  { id: 'it4', code: 'E509-FT22-0815', eventId: 'e5', ticketTypeId: 't5a', holderName: 'Marie Joseph', holderEmail: 'marie@example.com', status: 'used', orderId: 'o0990', checkedInAt: '2026-10-11T15:12:00' },
];

export const myOrders: Order[] = [
  { id: 'o1001', eventId: 'e1', createdAt: '2026-10-28T14:22:00', items: [{ ticketTypeId: 't1c', qty: 2, unitPrice: 7500 }], subtotal: 15000, discount: 1500, fees: 675, total: 14175, currency: 'HTG', method: 'moncash', status: 'paid', buyerName: 'Marie Joseph', buyerEmail: 'marie@example.com', promoCode: 'KOMPA10' },
  { id: 'o1002', eventId: 'e2', createdAt: '2026-11-02T09:05:00', items: [{ ticketTypeId: 't2b', qty: 1, unitPrice: 3500, seats: ['B-14'] }], subtotal: 3500, discount: 0, fees: 175, total: 3675, currency: 'HTG', method: 'card', status: 'paid', buyerName: 'Marie Joseph', buyerEmail: 'marie@example.com' },
  { id: 'o0990', eventId: 'e5', createdAt: '2026-10-03T18:40:00', items: [{ ticketTypeId: 't5a', qty: 1, unitPrice: 300 }], subtotal: 300, discount: 0, fees: 15, total: 315, currency: 'HTG', method: 'natcash', status: 'paid', buyerName: 'Marie Joseph', buyerEmail: 'marie@example.com' },
  { id: 'o0950', eventId: 'e8', createdAt: '2026-09-12T11:00:00', items: [{ ticketTypeId: 't8a', qty: 2, unitPrice: 25 }], subtotal: 50, discount: 0, fees: 3, total: 53, currency: 'USD', method: 'paypal', status: 'refunded', buyerName: 'Marie Joseph', buyerEmail: 'marie@example.com' },
];

const firstNames = ['Jean', 'Marie', 'Stéphanie', 'Wilson', 'Nadège', 'Ricardo', 'Fabiola', 'Kervens', 'Darline', 'Junior', 'Mirlande', 'Peterson', 'Rose-Carline', 'Jameson', 'Woodline', 'Carl-Henry', 'Edwine', 'Ralph'];
const lastNames = ['Pierre', 'Joseph', 'Jean-Baptiste', 'Louis', 'Charles', 'Saint-Fleur', 'Desir', 'Augustin', 'Michel', 'Etienne', 'Celestin', 'Noel', 'Alexis', 'Dorval'];

const attendeePlan: { eventId: string; count: number }[] = [
  { eventId: 'e1', count: 48 },
  { eventId: 'e5', count: 16 },
  { eventId: 'e7', count: 12 },
  { eventId: 'e8', count: 10 },
];

let attendeeIndex = 0;
export const attendees: Attendee[] = attendeePlan.flatMap(({ eventId, count }) => {
  const ev = events.find((e) => e.id === eventId)!;
  return Array.from({ length: count }, (_, k) => {
    const i = attendeeIndex++;
    const fn = firstNames[(i * 7) % firstNames.length];
    const ln = lastNames[(i * 5) % lastNames.length];
    // Répartition : surtout le billet standard, quelques VIP / groupes
    const tt = ev.tickets[[1, 1, 1, 2, 0, 3][k % 6] % ev.tickets.length];
    const day = 1 + (i % 28);
    return {
      id: `a${i + 1}`,
      eventId,
      name: `${fn} ${ln}`,
      email: `${fn.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}.${ln.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}@example.com`,
      phone: `+509 3${(i * 13) % 10}${(i * 7) % 10} ${String(1000 + i * 37).slice(-4)} ${String(2000 + i * 91).slice(-4)}`,
      ticketType: tt.name,
      orderId: `o${2000 + i}`,
      checkedIn: i % 3 === 0,
      checkedInAt: i % 3 === 0 ? `${ev.start.slice(0, 11)}${String(19 + (i % 3)).padStart(2, '0')}:1${i % 10}:00` : undefined,
      purchasedAt: `2026-10-${String(day).padStart(2, '0')}T1${i % 10}:2${i % 6}:00`,
      amount: tt.price,
      code: `E509-${(1000 + i * 17).toString(36).toUpperCase().padStart(4, 'X')}-${(5000 + i * 131).toString(16).toUpperCase()}`,
    };
  });
});

/** Billets mis en revente par d'autres participants (marketplace). */
export const resaleListings: IssuedTicket[] = [
  { id: 'rs1', code: 'E509-RS01-AAAA', eventId: 'e1', ticketTypeId: 't1b', holderName: 'Fabiola Desir', holderEmail: 'fabiola@example.com', status: 'resale', resalePrice: 2200, orderId: 'o2101' },
  { id: 'rs2', code: 'E509-RS02-BBBB', eventId: 'e1', ticketTypeId: 't1c', holderName: 'Ralph Dorval', holderEmail: 'ralph@example.com', status: 'resale', resalePrice: 7000, orderId: 'o2102' },
  { id: 'rs3', code: 'E509-RS03-CCCC', eventId: 'e8', ticketTypeId: 't8a', holderName: 'Edwine Alexis', holderEmail: 'edwine@example.com', status: 'resale', resalePrice: 25, orderId: 'o2103' },
  { id: 'rs4', code: 'E509-RS04-DDDD', eventId: 'e2', ticketTypeId: 't2b', holderName: 'Jean Pierre', holderEmail: 'jean@example.com', seat: 'E-7', status: 'resale', resalePrice: 3000, orderId: 'o2104' },
];

/** Taux de commission négociés par organisateur (administration). */
export const customCommissions: { organizerId: string; rate: number; reason: string }[] = [
  { organizerId: 'org2', rate: 3, reason: 'Association / éducation' },
  { organizerId: 'org1', rate: 4.5, reason: 'Volume > 10 000 billets / an' },
];

export const promoCodes: PromoCode[] = [
  { id: 'p1', code: 'KOMPA10', type: 'percent', value: 10, used: 182, limit: 500, expiresAt: '2026-12-15T23:59:00', eventId: 'e1', active: true },
  { id: 'p2', code: 'ETUDIANT', type: 'percent', value: 25, used: 64, limit: 100, expiresAt: '2026-11-26T23:59:00', eventId: 'e2', active: true },
  { id: 'p3', code: 'VIP500', type: 'fixed', value: 500, used: 20, limit: 20, expiresAt: '2026-11-30T23:59:00', eventId: 'e1', active: false },
  { id: 'p4', code: 'NOEL2026', type: 'percent', value: 15, used: 0, limit: 300, expiresAt: '2026-12-24T12:00:00', eventId: 'all', active: true },
];

export const team: TeamMember[] = [
  { id: 'm1', name: 'Ricardo Pierre', email: 'ricardo@lakay.ht', role: 'admin', status: 'active', lastActive: '2026-11-08T09:12:00' },
  { id: 'm2', name: 'Nadège Louis', email: 'nadege@lakay.ht', role: 'accountant', status: 'active', lastActive: '2026-11-07T16:40:00' },
  { id: 'm3', name: 'Kervens Michel', email: 'kervens@lakay.ht', role: 'staff', status: 'active', lastActive: '2026-11-06T21:03:00' },
  { id: 'm4', name: 'Darline Etienne', email: 'darline@lakay.ht', role: 'staff', status: 'invited' },
];

export const refunds: RefundRequest[] = [
  { id: 'r1', orderId: 'o2041', buyer: 'Wilson Charles', eventTitle: 'Festival Kompa Live 2026', amount: 2500, currency: 'HTG', reason: 'Empêchement médical', createdAt: '2026-11-06T10:00:00', status: 'pending' },
  { id: 'r2', orderId: 'o2055', buyer: 'Fabiola Desir', eventTitle: 'Festival Kompa Live 2026', amount: 7500, currency: 'HTG', reason: 'Achat en double', createdAt: '2026-11-05T18:21:00', status: 'pending' },
  { id: 'r3', orderId: 'o1988', buyer: 'Jameson Noel', eventTitle: 'Rooftop Sunset Session', amount: 25, currency: 'USD', reason: 'Date incompatible', createdAt: '2026-11-01T08:47:00', status: 'approved' },
  { id: 'r4', orderId: 'o1950', buyer: 'Edwine Alexis', eventTitle: 'Tournoi des Quartiers — Finale', amount: 300, currency: 'HTG', reason: 'Changement d’avis', createdAt: '2026-10-29T13:10:00', status: 'declined' },
];

export const payouts: Payout[] = [
  { id: 'py1', organizerId: 'org1', amount: 485000, currency: 'HTG', method: 'bank', status: 'scheduled', date: '2026-11-15', reference: 'VRS-2026-1115' },
  { id: 'py2', organizerId: 'org1', amount: 312400, currency: 'HTG', method: 'moncash', status: 'processing', date: '2026-11-08', reference: 'VRS-2026-1108' },
  { id: 'py3', organizerId: 'org1', amount: 2180, currency: 'USD', method: 'paypal', status: 'paid', date: '2026-11-01', reference: 'VRS-2026-1101' },
  { id: 'py4', organizerId: 'org1', amount: 528900, currency: 'HTG', method: 'bank', status: 'paid', date: '2026-10-25', reference: 'VRS-2026-1025' },
  { id: 'py5', organizerId: 'org2', amount: 186500, currency: 'HTG', method: 'bank', status: 'requested', date: '2026-11-07', reference: 'VRS-2026-1107-TA' },
  { id: 'py6', organizerId: 'org4', amount: 3120, currency: 'USD', method: 'paypal', status: 'requested', date: '2026-11-06', reference: 'VRS-2026-1106-SN' },
  { id: 'py7', organizerId: 'org3', amount: 54200, currency: 'HTG', method: 'moncash', status: 'requested', date: '2026-11-08', reference: 'VRS-2026-1108-JA' },
  { id: 'py8', organizerId: 'org2', amount: 142800, currency: 'HTG', method: 'bank', status: 'paid', date: '2026-10-18', reference: 'VRS-2026-1018-TA' },
];

export const campaigns: Campaign[] = [
  { id: 'c1', name: 'Lancement billets VIP', channel: 'whatsapp', audience: 'Abonnés Lakay (8 420)', status: 'sent', sent: 8420, opened: 7130, clicks: 1904, date: '2026-10-20T12:00:00' },
  { id: 'c2', name: 'Rappel J-30 Festival', channel: 'email', audience: 'Acheteurs 2025 (12 300)', status: 'sent', sent: 12300, opened: 5412, clicks: 1180, date: '2026-11-19T09:00:00' },
  { id: 'c3', name: 'Dernières places Early Bird', channel: 'sms', audience: 'Port-au-Prince (5 100)', status: 'scheduled', sent: 0, opened: 0, clicks: 0, date: '2026-11-12T17:00:00' },
  { id: 'c4', name: 'Newsletter décembre', channel: 'email', audience: 'Tous les abonnés', status: 'draft', sent: 0, opened: 0, clicks: 0, date: '2026-12-01T09:00:00' },
];

export const ambassadors: Ambassador[] = [
  { id: 'am1', name: 'Junior Augustin', code: 'JUNIOR509', clicks: 4210, sales: 312, revenue: 780000, commission: 5 },
  { id: 'am2', name: 'Mirlande Saint-Fleur', code: 'MIRLANDE', clicks: 2890, sales: 198, revenue: 495000, commission: 5 },
  { id: 'am3', name: 'Peterson Dorval', code: 'PDORVAL', clicks: 1340, sales: 77, revenue: 192500, commission: 4 },
  { id: 'am4', name: 'Woodline Celestin', code: 'WOODY', clicks: 980, sales: 41, revenue: 102500, commission: 4 },
];

export const users: AppUser[] = [
  { id: 'u1', name: 'Marie Joseph', email: 'marie@example.com', phone: '+509 3712 4455', avatar: 'MJ', role: 'participant', city: 'Port-au-Prince', status: 'active', joinedAt: '2025-03-12' },
  { id: 'u2', name: 'Ricardo Pierre', email: 'ricardo@lakay.ht', avatar: 'RP', role: 'organizer', teamRole: 'admin', city: 'Pétion-Ville', status: 'active', joinedAt: '2024-11-02', verified: true },
  { id: 'u8', name: 'Kervens Michel', email: 'kervens@lakay.ht', avatar: 'KM', role: 'organizer', teamRole: 'staff', city: 'Pétion-Ville', status: 'active', joinedAt: '2025-09-01' },
  { id: 'u9', name: 'Nadège Louis', email: 'nadege@lakay.ht', avatar: 'NL', role: 'organizer', teamRole: 'accountant', city: 'Pétion-Ville', status: 'active', joinedAt: '2025-04-12' },
  { id: 'u3', name: 'Stéphanie Louis', email: 'steph@techayiti.org', avatar: 'SL', role: 'organizer', city: 'Port-au-Prince', status: 'active', joinedAt: '2025-01-20', verified: true },
  { id: 'u4', name: 'Carl-Henry Michel', email: 'carl@jakmel.art', avatar: 'CM', role: 'organizer', city: 'Jacmel', status: 'active', joinedAt: '2025-08-30', verified: false },
  { id: 'u5', name: 'Kervens Etienne', email: 'kervens.e@example.com', avatar: 'KE', role: 'participant', city: 'Cap-Haïtien', status: 'suspended', joinedAt: '2025-06-18' },
  { id: 'u6', name: 'Rose-Carline Noel', email: 'rose@example.com', avatar: 'RN', role: 'participant', city: 'Miami', status: 'active', joinedAt: '2026-02-04' },
  { id: 'u10', name: 'Stéphanie Pierre', email: 'stephanie@example.com', avatar: 'SP', role: 'participant', city: 'Pétion-Ville', status: 'active', joinedAt: '2026-10-28' },
  { id: 'u11', name: 'Wilson Charles', email: 'wilson.charles@example.com', avatar: 'WC', role: 'participant', city: 'Port-au-Prince', status: 'active', joinedAt: '2026-05-14' },
  { id: 'u12', name: 'Fabiola Desir', email: 'fabiola@example.com', avatar: 'FD', role: 'participant', city: 'Gonaïves', status: 'active', joinedAt: '2026-11-06' },
  { id: 'u13', name: 'Jameson Noel', email: 'jameson@saveursdunord.ht', avatar: 'JN', role: 'organizer', teamRole: 'admin', city: 'Cap-Haïtien', status: 'active', joinedAt: '2025-02-10', verified: true },
  { id: 'u14', name: 'Darline Etienne', email: 'darline@konbit.ht', avatar: 'DE', role: 'organizer', teamRole: 'admin', city: 'Les Cayes', status: 'active', joinedAt: '2026-11-07' },
  { id: 'u7', name: 'Admin Event509', email: 'admin@event509.com', avatar: 'AE', role: 'admin', city: 'Port-au-Prince', status: 'active', joinedAt: '2024-06-01' },
];

export const disputes: Dispute[] = [
  {
    id: 'd1', orderId: 'o2088', opener: 'Wilson Charles', against: 'Lakay Productions', subject: 'Billet refusé à l’entrée', amount: 2500, currency: 'HTG', status: 'open', createdAt: '2026-11-07T08:00:00',
    messages: [
      { from: 'opener', author: 'Wilson Charles', body: 'Mon QR code a été refusé à l’entrée alors que je l’avais acheté la veille. J’ai dû repartir.', at: '2026-11-07T08:00:00' },
      { from: 'against', author: 'Lakay Productions', body: 'Le scanner indique que ce billet avait déjà été utilisé à 19h12. Nous vérifions avec l’équipe d’entrée.', at: '2026-11-07T14:30:00' },
    ],
  },
  {
    id: 'd2', orderId: 'o1720', opener: 'Rose-Carline Noel', against: 'Saveurs du Nord', subject: 'Événement reporté sans remboursement', amount: 170, currency: 'USD', status: 'investigating', createdAt: '2026-11-03T15:00:00',
    messages: [
      { from: 'opener', author: 'Rose-Carline Noel', body: 'Le dîner a été reporté au mois prochain et je ne peux pas venir. J’ai contacté l’organisateur sans réponse depuis 5 jours.', at: '2026-11-03T15:00:00' },
      { from: 'admin', author: 'Équipe Event509', body: 'Nous avons relancé l’organisateur et lui laissons 48 h pour répondre.', at: '2026-11-04T10:00:00' },
    ],
  },
  {
    id: 'd3', orderId: 'o1544', opener: 'Ralph Dorval', against: 'Jakmèl Arts Collectif', subject: 'Paiement débité deux fois', amount: 1200, currency: 'HTG', status: 'resolved', createdAt: '2026-10-21T10:00:00',
    decision: 'refund_full', refunded: 1200, note: 'Double débit MonCash confirmé par le relevé.',
    messages: [{ from: 'opener', author: 'Ralph Dorval', body: 'J’ai été débité deux fois pour la même commande.', at: '2026-10-21T10:00:00' }],
  },
];

export const reports: Report[] = [
  { id: 'rp1', eventId: 'e8', reason: 'misleading', details: 'Le prix affiché ne comprend pas l’entrée obligatoire au bar.', reporter: 'Darline Etienne', status: 'open', createdAt: '2026-11-07T21:10:00' },
  { id: 'rp2', eventId: 'e3', reason: 'other', details: 'Les horaires de la parade ont changé sur Instagram mais pas ici.', reporter: 'Junior Augustin', status: 'open', createdAt: '2026-11-06T09:40:00' },
  { id: 'rp3', eventId: 'e5', reason: 'scam', details: 'Quelqu’un revend des billets à 3 fois le prix sur WhatsApp en se faisant passer pour l’organisateur.', reporter: 'Peterson Dorval', status: 'actioned', createdAt: '2026-10-30T18:00:00' },
];

export const verificationRequests: VerificationRequest[] = [
  {
    id: 'v1', organizerId: 'org3', name: 'Jakmèl Arts Collectif', owner: 'Carl-Henry Michel', email: 'carl@jakmel.art', city: 'Jacmel', status: 'pending', submittedAt: '2026-11-05T11:00:00',
    docs: [
      { type: 'id', file: 'piece-identite-cmichel.jpg', uploadedAt: '2026-11-05T11:00:00' },
      { type: 'license', file: 'patente-jakmel-arts.pdf', uploadedAt: '2026-11-05T11:02:00' },
      { type: 'bank', file: 'releve-bnc-octobre.pdf', uploadedAt: '2026-11-05T11:03:00' },
    ],
  },
  {
    id: 'v2', name: 'Konbit Events', owner: 'Darline Etienne', email: 'darline@konbit.ht', city: 'Les Cayes', status: 'pending', submittedAt: '2026-11-07T16:20:00',
    docs: [{ type: 'id', file: 'cin-detienne.jpg', uploadedAt: '2026-11-07T16:20:00' }],
  },
  {
    id: 'v3', organizerId: 'org4', name: 'Saveurs du Nord', owner: 'Jameson Noel', email: 'jameson@saveursdunord.ht', city: 'Cap-Haïtien', status: 'approved', submittedAt: '2026-09-12T09:00:00',
    docs: [
      { type: 'id', file: 'passeport-jnoel.jpg', uploadedAt: '2026-09-12T09:00:00' },
      { type: 'license', file: 'patente-saveurs.pdf', uploadedAt: '2026-09-12T09:01:00' },
      { type: 'bank', file: 'rib-unibank.pdf', uploadedAt: '2026-09-12T09:02:00' },
    ],
  },
];

export const auditLog: AuditEntry[] = [
  { id: 'al1', at: '2026-11-07T17:45:00', actor: 'Admin Event509', action: 'Événement approuvé', target: 'Tournoi des Quartiers — Finale' },
  { id: 'al2', at: '2026-11-07T11:20:00', actor: 'Admin Event509', action: 'Versement payé', target: 'Tech Ayiti — 142 800 HTG' },
  { id: 'al3', at: '2026-11-06T09:05:00', actor: 'Admin Event509', action: 'Utilisateur suspendu', target: 'Kervens Etienne' },
  { id: 'al4', at: '2026-11-04T10:00:00', actor: 'Admin Event509', action: 'Litige passé en enquête', target: 'o1720' },
];

export const platformTargets: PlatformTarget[] = [
  { id: 'tg1', title: 'Volume de ventes du trimestre', metric: 'gmv', target: 25_000_000, deadline: '2026-12-31', tone: 'brand', description: 'Atteindre 25 M HTG de ventes cumulées sur 6 mois.' },
  { id: 'tg2', title: '100 organisateurs vérifiés', metric: 'organizers', target: 100, deadline: '2027-03-31', tone: 'navy', description: 'Accélérer la vérification des nouveaux organisateurs.' },
  { id: 'tg3', title: '500 billets cette semaine', metric: 'tickets', target: 500, deadline: '2026-11-15', tone: 'brand' },
];

/** Paramètres de commission de la plateforme (voir src/lib/fees.ts). */
export const platformSettings = { fees: { percent: 5, fixedHTG: 25, passToBuyer: true, freeNoFee: true } };

// --- Commandes de toute la plateforme (6 mois), générées de façon déterministe ---
function prng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const platformOrders: Order[] = (() => {
  const rnd = prng(509);
  const pub = events.filter((e) => e.status === 'published');
  const methods: Order['method'][] = ['moncash', 'moncash', 'moncash', 'moncash', 'moncash', 'card', 'card', 'natcash', 'natcash', 'paypal'];
  const out: Order[] = [];
  const ref = new Date(2026, 10, 8, 12);
  for (let i = 0; i < 420; i++) {
    // Plus de commandes récentes (croissance de la plateforme)
    const daysAgo = Math.floor(Math.pow(rnd(), 1.6) * 180);
    const d = new Date(ref);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(8 + Math.floor(rnd() * 14), Math.floor(rnd() * 60));
    const ev = pub[Math.floor(rnd() * pub.length)];
    const paid = ev.tickets.filter((x) => x.price > 0);
    const tt = (paid.length ? paid : ev.tickets)[Math.floor(rnd() * (paid.length || ev.tickets.length))];
    const qty = 1 + Math.floor(rnd() * 3);
    const subtotal = tt.price * qty;
    const fees = Math.round(subtotal * 0.05 * 100) / 100;
    const fn = firstNames[Math.floor(rnd() * firstNames.length)];
    const ln = lastNames[Math.floor(rnd() * lastNames.length)];
    const p = (n: number) => String(n).padStart(2, '0');
    out.push({
      id: `o${10000 + i}`,
      eventId: ev.id,
      createdAt: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`,
      items: [{ ticketTypeId: tt.id, qty, unitPrice: tt.price }],
      subtotal, discount: 0, fees, total: subtotal + fees,
      currency: ev.currency,
      method: rnd() < 0.04 ? 'transfer' : methods[Math.floor(rnd() * methods.length)],
      status: rnd() < 0.04 ? 'refunded' : 'paid',
      buyerName: `${fn} ${ln}`,
      buyerEmail: `${fn.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}@example.com`,
    });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
})();

export const notifications: NotificationItem[] = [
  { id: 'n1', title: 'Rappel : Ayiti Tech Summit', body: 'Votre événement commence dans 19 jours. Votre place : B-14.', date: '2026-11-08T08:00:00', read: false, kind: 'reminder' },
  { id: 'n2', title: 'Mise à jour : Festival Kompa Live', body: 'Ouverture des portes avancée à 18h30.', date: '2026-11-06T14:00:00', read: false, kind: 'update' },
  { id: 'n3', title: 'Paiement confirmé', body: 'Commande o1002 payée par carte — 3 675 HTG.', date: '2026-11-02T09:06:00', read: true, kind: 'sale' },
];

// Ventes par jour (7 derniers jours) pour le tableau de bord organisateur
export const weeklySales = [
  { day: 'Lun', tickets: 142, revenue: 355000, target: 320 },
  { day: 'Mar', tickets: 98, revenue: 245000, target: 290 },
  { day: 'Mer', tickets: 351, revenue: 877500, target: 320 },
  { day: 'Jeu', tickets: 150, revenue: 375000, target: 320 },
  { day: 'Ven', tickets: 103, revenue: 257500, target: 320 },
  { day: 'Sam', tickets: 253, revenue: 632500, target: 320 },
  { day: 'Dim', tickets: 77, revenue: 192500, target: 320 },
];

export const platformMonthly = [
  { month: 'Juin', gmv: 3.1, fees: 0.16 }, { month: 'Juil', gmv: 4.4, fees: 0.22 },
  { month: 'Août', gmv: 3.8, fees: 0.19 }, { month: 'Sept', gmv: 5.2, fees: 0.26 },
  { month: 'Oct', gmv: 6.9, fees: 0.35 }, { month: 'Nov', gmv: 8.4, fees: 0.42 },
];

// ---------------------------------------------------------------------------
// Les dates de démo sont écrites par rapport au 8 novembre 2026. On les décale
// d'autant de jours qu'il s'en est écoulé, pour que la démo reste « à venir ».
const REFERENCE_DAY = new Date(2026, 10, 8);
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/;

function shiftIso(v: string, days: number) {
  const m = ISO_RE.exec(v);
  if (!m) return v;
  const d = new Date(+m[1], +m[2] - 1, +m[3] + days, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  const p = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  if (!m[4]) return date;
  return `${date}T${p(d.getHours())}:${p(d.getMinutes())}${m[6] !== undefined ? `:${p(d.getSeconds())}` : ''}`;
}

function shiftDeep(o: unknown, days: number): void {
  if (Array.isArray(o)) o.forEach((x, i) => (typeof x === 'string' ? (o[i] = shiftIso(x, days)) : shiftDeep(x, days)));
  else if (o && typeof o === 'object')
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'string') (o as Record<string, unknown>)[k] = shiftIso(v, days);
      else shiftDeep(v, days);
    }
}

const today = new Date();
export const DEMO_OFFSET_DAYS = Math.max(
  0,
  Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() - REFERENCE_DAY.getTime()) / 86400000),
);
if (DEMO_OFFSET_DAYS > 0) {
  [events, myTickets, myOrders, attendees, resaleListings, reports, verificationRequests, auditLog, platformTargets, platformOrders, promoCodes, team, refunds, payouts, campaigns, users, disputes, notifications].forEach((x) =>
    shiftDeep(x, DEMO_OFFSET_DAYS),
  );
}

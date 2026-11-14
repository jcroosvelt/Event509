import type {
  PremiumBenefit, PremiumConfig, PremiumPayment, PremiumSubscription, VerificationApplication, VerificationLogEntry, VerificationRequest, VerificationStatus,
} from '../../src/types.js';
import { all, db, docs, one, tx, upsert, type Q } from './db.js';
import { newId } from './auth.js';
import { createPayment, MIN_HTG, ONLINE_METHODS, payConfigured, verifyPayment, type OnlineMethod, type PayStatus } from './pay.js';
import { claimOnce, notifyUsers, organizerUserIds } from './push.js';
import { sendNoticeEmail } from './mail.js';
import type { Ctx, UserRow } from './routes.js';

/**
 * Programme « Organisateur vérifié » : demande, paiement de l'abonnement, décision de l'administration, badge.
 * Règles :
 *   - le paiement et la vérification sont deux étapes séparées ;
 *   - le badge (organizers.verified) est toujours calculé ici (recompute) : demande approuvée ET abonnement actif ET
 *     certification encore valable. Aucun champ envoyé par un organisateur ne peut le modifier ;
 *   - une expiration masque le badge mais ne supprime jamais les données ni les événements.
 */

type Handler = (c: Ctx) => Promise<unknown>;
export interface PremiumDeps {
  fail: (status: number, message: string) => never;
  str: (v: unknown, max?: number) => string;
  auth: (c: Ctx) => UserRow;
  admin: (c: Ctx) => UserRow;
  org: (c: Ctx, perm: string) => string;
  audit: (c: Ctx, action: string, target: string) => Promise<void>;
}

export const DEFAULT_PREMIUM: PremiumConfig = {
  enabled: true,
  yearlyPrice: 15000,
  validityDays: 365,
  requiredDocs: ['id'],
  processingDays: 3,
  minAge: 18,
  eligibility: [
    'Avoir au moins 18 ans, ou être représenté légalement',
    'Posséder une identité vérifiable',
    'Avoir une adresse email et un numéro de téléphone valides',
    'Fournir des informations professionnelles exactes',
    'Présenter une présence vérifiable : site web, réseaux sociaux ou documents justificatifs',
    'Accepter les conditions d’utilisation et la politique de vérification',
    'Ne pas avoir de suspension grave non résolue sur la plateforme',
    'Payer les frais de souscription et réussir le contrôle administratif',
  ],
  refund: { onRejection: 'full', percent: 100 },
  renewal: { remindDays: [7, 1], graceDays: 0 },
  benefits: { profile: true, visibility: true, analytics: true, multiEvents: true, team: true, support: true, marketing: true, page: true, finance: true, api: true },
  notify: { onDecision: true, onExpiry: true },
  apiLimits: { perMinute: 60, maxKeys: 5 },
  visibilityBoost: 25,
  featuredPerOrganizer: 2,
};

export async function getConfig(q: Q = db()): Promise<PremiumConfig> {
  const r = await one<{ value: Partial<PremiumConfig> }>(`select value from settings where key = 'premium'`, [], q);
  const v = r?.value ?? {};
  return {
    ...DEFAULT_PREMIUM, ...v,
    refund: { ...DEFAULT_PREMIUM.refund, ...v.refund },
    renewal: { ...DEFAULT_PREMIUM.renewal, ...v.renewal },
    benefits: { ...DEFAULT_PREMIUM.benefits, ...v.benefits },
    notify: { ...DEFAULT_PREMIUM.notify, ...v.notify },
    apiLimits: { ...DEFAULT_PREMIUM.apiLimits, ...v.apiLimits },
  };
}

const DOC_TYPES_OK = ['id', 'license', 'bank', 'selfie', 'registration', 'representation'];
const ORG_TYPES = ['company', 'association', 'institution', 'agency', 'independent'];
const ADMIN_STATUSES = ['in_review', 'docs_requested', 'approved', 'rejected', 'suspended', 'revoked', 'reinstated'] as const;

interface SubRow {
  id: string; organizer_id: string; plan: 'monthly' | 'yearly'; status: PremiumSubscription['status'];
  started_at: Date | null; expires_at: Date | null; cancel_at_period_end: boolean;
}
const subOut = (s: SubRow | null): PremiumSubscription | null => s && ({
  id: s.id, organizerId: s.organizer_id, plan: s.plan, status: s.status, cancelAtPeriodEnd: s.cancel_at_period_end,
  startedAt: s.started_at?.toISOString(), expiresAt: s.expires_at?.toISOString(),
});
interface PayRow { id: string; plan: 'monthly' | 'yearly'; amount: string; status: PremiumPayment['status']; method: string; created_at: Date; paid_at: Date | null; data: { refundAmount?: number } }
const payOut = (p: PayRow): PremiumPayment => ({
  id: p.id, plan: p.plan, amount: Number(p.amount), status: p.status, method: p.method === 'transfer' ? 'transfer' : 'online',
  createdAt: p.created_at.toISOString(), paidAt: p.paid_at?.toISOString(), refundAmount: p.data?.refundAmount,
});

const getSub = (orgId: string, q: Q = db()) => one<SubRow>(`select * from premium_subscriptions where organizer_id = $1`, [orgId], q);
const getReq = (orgId: string, q: Q = db()) => one<{ id: string; status: VerificationStatus; data: VerificationRequest }>(
  `select id, status, data from verification_requests where organizer_id = $1 order by id limit 1`, [orgId], q);
const subActive = (s: SubRow | null) => !!s && s.status === 'active' && !!s.expires_at && s.expires_at.getTime() > Date.now();

/**
 * Crée la demande de l'organisation si elle n'existe pas, puis y fusionne `patch`. L'identifiant est fixe (une seule
 * demande par organisation) et la fusion se fait en SQL : la sauvegarde automatique du formulaire et l'envoi d'un
 * document peuvent arriver en même temps sans créer de doublon ni s'écraser.
 */
export async function patchRequest(orgId: string, patch: Partial<VerificationRequest>, base: { name: string; owner: string; email: string; city: string }, q: Q = db()) {
  const existing = await getReq(orgId, q);
  const id = existing?.id ?? `vr_${orgId}`;
  const init: VerificationRequest = { id, organizerId: orgId, ...base, docs: [], status: 'draft', submittedAt: '' };
  await q.query(
    `insert into verification_requests (id, organizer_id, status, data) values ($1, $2, 'draft', $3::jsonb || $4::jsonb)
     on conflict (id) do update set data = verification_requests.data || $4::jsonb`,
    [id, orgId, JSON.stringify(init), JSON.stringify(patch)]);
}

async function logEntry(orgId: string, actor: string, action: string, note?: string, internal = false, q: Q = db()) {
  await q.query(`insert into verification_log (id, organizer_id, actor, action, note, internal) values ($1,$2,$3,$4,$5,$6)`, [newId('vl'), orgId, actor, action, note ?? null, internal]);
}

/** Recalcule le badge d'une organisation à partir de l'état réel (demande, abonnement, validité). Seule source de vérité. */
export async function recompute(orgId: string, q: Q = db()) {
  const cfg = await getConfig(q);
  const req = await getReq(orgId, q);
  const sub = await getSub(orgId, q);
  const approvedAt = req?.data.approvedAt ? Date.parse(req.data.approvedAt) : 0;
  const certValid = approvedAt > 0 && approvedAt + cfg.validityDays * 86_400_000 > Date.now();
  const active = subActive(sub);
  // Un organisateur approuvé dont l'abonnement ou la certification a pris fin passe « Expiré » ; il redevient « Vérifié » à la reprise
  if (req && req.status === 'approved' && (!active || !certValid) && sub) {
    await q.query(`update verification_requests set status = 'expired', data = data || '{"status":"expired"}'::jsonb where id = $1`, [req.id]);
    req.status = 'expired';
  } else if (req && req.status === 'expired' && active && certValid) {
    await q.query(`update verification_requests set status = 'approved', data = data || '{"status":"approved"}'::jsonb where id = $1`, [req.id]);
    req.status = 'approved';
  }
  const verified = req?.status === 'approved' && active && certValid;
  await q.query(`update organizers set data = data || jsonb_build_object('verified', $2::boolean) where id = $1`, [orgId, verified]);
  if (verified && req?.data.approvedAt) await q.query(`update organizers set data = data || jsonb_build_object('verifiedSince', $2::text) where id = $1`, [orgId, req.data.approvedAt]);
  else if (!verified) await q.query(`update organizers set data = data - 'verifiedSince' where id = $1`, [orgId]);
  // Visibilité : un coup de pouce transparent, seulement tant que le badge est actif et que l'avantage est offert
  if (verified && cfg.benefits.visibility && cfg.visibilityBoost > 0) await q.query(`update organizers set data = data || jsonb_build_object('priority', $2::int) where id = $1`, [orgId, cfg.visibilityBoost]);
  else await q.query(`update organizers set data = data - 'priority' where id = $1`, [orgId]);
  // Avantages actifs, exposés au site pour n'afficher que les outils auxquels l'organisateur a droit (le serveur les contrôle de toute façon)
  const perks = verified ? (Object.keys(cfg.benefits) as PremiumBenefit[]).filter((k) => cfg.benefits[k]) : [];
  await q.query(`update organizers set data = data || jsonb_build_object('perks', $2::jsonb) where id = $1`, [orgId, JSON.stringify(perks)]);
  return verified;
}

/** Informe l'organisation (notification et email) d'un changement de statut ou d'abonnement. */
async function tell(orgId: string, title: string, body: string, url = '/organisateur/verification') {
  try {
    const ids = await organizerUserIds(orgId);
    await notifyUsers(ids, { title, body, url, channel: 'sales' });
    const owners = await all<{ email: string }>(`select email from users where organizer_id = $1 and team_role = 'admin'`, [orgId]);
    await Promise.all(owners.map((o) => sendNoticeEmail(o.email, title, title, [body])));
  } catch (e) {
    console.error('[premium] notification', e);
  }
}

const monthsFor = (plan: 'monthly' | 'yearly') => (plan === 'yearly' ? '1 year' : '1 month');

/** Paiement confirmé (webhook, vérification serveur ou confirmation de l'administration) : l'abonnement est prolongé. */
export async function applyPaid(paymentId: string, by?: string): Promise<boolean> {
  const out = await tx(async (q) => {
    const p = await one<PayRow & { organizer_id: string }>(
      `update premium_payments set status = 'paid', paid_at = now() where id = $1 and status = 'pending' returning *`, [paymentId], q);
    if (!p) return null;
    await q.query(
      `insert into premium_subscriptions (id, organizer_id, plan, status, started_at, expires_at)
       values ($1, $2, $3, 'active', now(), now() + $4::interval)
       on conflict (organizer_id) do update set
         plan = excluded.plan, status = 'active', started_at = coalesce(premium_subscriptions.started_at, now()),
         expires_at = greatest(coalesce(premium_subscriptions.expires_at, now()), now()) + $4::interval, cancel_at_period_end = false`,
      [newId('sub'), p.organizer_id, p.plan, monthsFor(p.plan)]);
    await logEntry(p.organizer_id, by ?? 'Système', 'Abonnement payé', `${p.plan === 'yearly' ? 'Annuel' : 'Mensuel'} — ${Number(p.amount)} HTG`, false, q);
    await recompute(p.organizer_id, q);
    return p;
  });
  if (!out) return false;
  const req = await getReq(out.organizer_id);
  await tell(out.organizer_id, 'Abonnement activé',
    req?.status === 'approved' ? 'Votre abonnement est actif : votre badge vérifié est visible.' : 'Paiement reçu. Votre badge sera activé dès que l’administration aura approuvé votre demande.',
    '/organisateur/abonnement');
  return true;
}

/** Relit l'état du paiement auprès de la plateforme (jamais cru sur parole) et l'applique. */
export async function checkPremiumPayment(paymentId: string): Promise<PayStatus> {
  const p = await one<{ status: string; method: string }>(`select status, method from premium_payments where id = $1`, [paymentId]);
  if (!p) return 'failed';
  if (p.status === 'paid') return 'paid';
  if (p.status !== 'pending' || p.method === 'transfer' || !payConfigured()) return p.status === 'failed' ? 'failed' : 'pending';
  let st: PayStatus;
  try {
    st = await verifyPayment(paymentId);
  } catch (e) {
    console.error('[premium] vérification du paiement', e);
    return 'pending';
  }
  if (st === 'paid') await applyPaid(paymentId);
  else if (st === 'failed') await db().query(`update premium_payments set status = 'failed' where id = $1 and status = 'pending'`, [paymentId]);
  return st;
}

/** Expirations et rappels (appelé chaque jour par le cron des rappels). */
export async function premiumMaintenance() {
  const cfg = await getConfig();
  const grace = `${Math.max(0, Math.floor(cfg.renewal.graceDays))} days`;
  const expired = await all<{ organizer_id: string }>(
    `update premium_subscriptions set status = 'expired' where status = 'active' and expires_at < now() - $1::interval returning organizer_id`, [grace]);
  for (const e of expired) {
    await recompute(e.organizer_id);
    await logEntry(e.organizer_id, 'Système', 'Abonnement expiré', 'Le badge est masqué ; vos données et événements sont conservés.');
    if (cfg.notify.onExpiry) await tell(e.organizer_id, 'Abonnement expiré', 'Votre badge vérifié est masqué. Renouvelez votre abonnement pour le retrouver : vos événements et vos données sont conservés.', '/organisateur/abonnement');
  }
  let reminded = 0;
  if (cfg.notify.onExpiry) {
    const active = await all<SubRow>(`select * from premium_subscriptions where status = 'active' and expires_at > now() and not cancel_at_period_end`);
    for (const s of active) {
      const days = Math.ceil((s.expires_at!.getTime() - Date.now()) / 86_400_000);
      for (const d of cfg.renewal.remindDays) {
        if (days <= d && (await claimOnce(`premium-expiry:${s.id}:${d}:${s.expires_at!.toISOString().slice(0, 10)}`))) {
          await tell(s.organizer_id, 'Votre abonnement expire bientôt', `Il se termine dans ${days} jour(s). Renouvelez-le pour garder votre badge vérifié.`, '/organisateur/abonnement');
          reminded++;
        }
      }
    }
  }
  return { expired: expired.length, reminded };
}

/** Fonctions premium accessibles ? (organisation vérifiée, avantage activé par l'administration). Utilisé côté serveur partout. */
export async function benefitsFor(orgId: string): Promise<PremiumBenefit[]> {
  const o = await one<{ v: boolean }>(`select (data->>'verified')::boolean as v from organizers where id = $1`, [orgId]);
  if (!o?.v) return [];
  const cfg = await getConfig();
  return (Object.keys(cfg.benefits) as PremiumBenefit[]).filter((k) => cfg.benefits[k]);
}

export function premiumRoutes(h: PremiumDeps): [string, string, Handler][] {
  const { fail, str, admin, org, audit } = h;
  const actorName = (c: Ctx) => (c.user?.data.name as string) ?? c.user?.email ?? 'Admin';

  const publicConfig: Handler = async () => {
    const c = await getConfig();
    return {
      enabled: c.enabled, yearlyPrice: c.yearlyPrice, validityDays: c.validityDays, requiredDocs: c.requiredDocs,
      processingDays: c.processingDays, minAge: c.minAge, eligibility: c.eligibility, refund: c.refund, benefits: c.benefits,
      visibilityBoost: c.visibilityBoost, featuredPerOrganizer: c.featuredPerOrganizer,
      onlinePayment: payConfigured(),
    };
  };

  /** Vue complète pour l'organisateur : demande, abonnement, paiements, avantages actifs, historique visible. */
  const overview: Handler = async (c) => {
    const orgId = org(c, 'settings');
    const cfg = await getConfig();
    const req = await getReq(orgId);
    const sub = await getSub(orgId);
    const pays = await all<PayRow>(`select * from premium_payments where organizer_id = $1 order by created_at desc limit 50`, [orgId]);
    const files = await all<{ doc_type: string; name: string; created_at: Date }>(`select doc_type, name, created_at from files where organizer_id = $1 and kind = 'verification'`, [orgId]);
    const history = await all<{ id: string; at: Date; actor: string; action: string; note: string | null }>(
      `select id, at, actor, action, note from verification_log where organizer_id = $1 and not internal order by at desc limit 50`, [orgId]);
    const o = await one<{ v: boolean; since: string | null }>(`select (data->>'verified')::boolean as v, data->>'verifiedSince' as since from organizers where id = $1`, [orgId]);
    return {
      config: { ...(await publicConfig(c) as object) },
      request: req && {
        status: req.status, note: req.data.note ?? null, application: req.data.application ?? {}, submittedAt: req.data.submittedAt,
        approvedAt: req.data.approvedAt ?? null, appeal: req.data.appeal ?? null,
        docs: files.map((f) => ({ type: f.doc_type, name: f.name, uploadedAt: f.created_at.toISOString() })),
      },
      subscription: subOut(sub),
      subscriptionActive: subActive(sub),
      payments: pays.map(payOut),
      verified: !!o?.v,
      verifiedSince: o?.since ?? null,
      benefits: o?.v ? (Object.keys(cfg.benefits) as PremiumBenefit[]).filter((k) => cfg.benefits[k]) : [],
      history: history.map((x): VerificationLogEntry => ({ id: x.id, at: x.at.toISOString(), actor: x.actor, action: x.action, note: x.note ?? undefined })),
    };
  };

  /** Normalise le formulaire reçu : seuls les champs connus sont gardés, tous bornés. */
  const cleanApplication = (b: Record<string, unknown>): Partial<VerificationApplication> => ({
    fullName: str(b.fullName, 120), birthDate: /^\d{4}-\d{2}-\d{2}$/.test(str(b.birthDate, 10)) ? str(b.birthDate, 10) : '',
    email: str(b.email, 160), phone: str(b.phone, 40), country: str(b.country, 80), orgName: str(b.orgName, 120),
    orgType: (ORG_TYPES.includes(str(b.orgType, 20)) ? str(b.orgType, 20) : '') as VerificationApplication['orgType'],
    activity: str(b.activity, 1500), address: str(b.address, 200), website: str(b.website, 200), socials: str(b.socials, 600),
    legalRep: b.legalRep === true, acceptedTerms: b.acceptedTerms === true, confirmedAccurate: b.confirmedAccurate === true,
  });

  const saveDraft: Handler = async (c) => {
    const orgId = org(c, 'settings');
    const app = cleanApplication((c.body.application ?? {}) as Record<string, unknown>);
    const req = await getReq(orgId);
    // Une demande déjà examinée ne se modifie plus (sauf quand des documents sont demandés)
    if (req && !['draft', 'docs_requested', 'rejected', 'expired'].includes(req.status)) fail(409, 'Votre demande est en cours d’examen : elle ne peut plus être modifiée');
    const o = (await one<{ data: { name?: string; city?: string } }>(`select data from organizers where id = $1`, [orgId]))?.data;
    await patchRequest(orgId, { application: app }, { name: o?.name ?? orgId, owner: c.user!.email, email: c.user!.email, city: o?.city ?? '' });
    return { savedAt: new Date().toISOString() };
  };

  const age = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    const n = new Date();
    let a = n.getUTCFullYear() - d.getUTCFullYear();
    if (n.getUTCMonth() < d.getUTCMonth() || (n.getUTCMonth() === d.getUTCMonth() && n.getUTCDate() < d.getUTCDate())) a--;
    return a;
  };

  const apply: Handler = async (c) => {
    const orgId = org(c, 'settings');
    const cfg = await getConfig();
    if (!cfg.enabled) fail(403, 'Le programme n’est pas ouvert pour le moment');
    const req = await getReq(orgId);
    if (!req) fail(422, 'Remplissez d’abord le formulaire');
    if (!['draft', 'docs_requested', 'rejected', 'expired'].includes(req!.status)) fail(409, 'Une demande est déjà en cours');
    const a = req!.data.application ?? {};
    const miss = (k: keyof VerificationApplication) => !String(a[k] ?? '').trim();
    if (['fullName', 'birthDate', 'email', 'phone', 'country', 'orgName', 'orgType', 'activity'].some((k) => miss(k as keyof VerificationApplication))) fail(422, 'Complétez les informations personnelles et professionnelles');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email!)) fail(422, 'Adresse email invalide');
    if (!a.website?.trim() && !a.socials?.trim() && !(await one(`select 1 from files where organizer_id = $1 and kind = 'verification' and doc_type in ('registration', 'license', 'bank') limit 1`, [orgId])))
      fail(422, 'Indiquez un site web, un réseau social ou envoyez un document justificatif');
    if (!a.acceptedTerms || !a.confirmedAccurate) fail(422, 'Acceptez les conditions et confirmez l’exactitude des informations');
    const files = await all<{ doc_type: string }>(`select doc_type from files where organizer_id = $1 and kind = 'verification'`, [orgId]);
    const have = new Set(files.map((f) => f.doc_type));
    const need = [...cfg.requiredDocs, ...(age(a.birthDate!) < cfg.minAge ? ['representation' as const] : [])];
    const missing = need.filter((d) => !have.has(d));
    if (missing.length) fail(422, `Documents manquants : ${missing.join(', ')}`);
    if (age(a.birthDate!) < cfg.minAge && !a.legalRep) fail(422, `Il faut avoir ${cfg.minAge} ans ou être représenté légalement`);
    // Pas de suspension grave non résolue sur un compte de l'organisation
    if (await one(`select 1 from users where organizer_id = $1 and status = 'suspended' limit 1`, [orgId])) fail(403, 'Un compte de votre organisation est suspendu : contactez le support');
    const now = new Date().toISOString();
    await tx(async (q) => {
      await q.query(`update verification_requests set status = 'pending', data = data || $2::jsonb where id = $1`,
        [req!.id, JSON.stringify({ status: 'pending', submittedAt: now, note: null, name: a.orgName, owner: a.fullName, email: a.email })]);
      await logEntry(orgId, actorName(c), 'Demande soumise', undefined, false, q);
    });
    await safelyAdmins(`Nouvelle demande de vérification : ${a.orgName}`);
    return null;
  };

  /** Prévient les administrateurs (notification push) qu'il y a une demande à traiter. */
  async function safelyAdmins(body: string) {
    try {
      const ids = (await all<{ id: string }>(`select id from users where role = 'admin'`)).map((x) => x.id);
      await notifyUsers(ids, { title: 'Vérification d’organisateur', body, url: '/admin/verification', channel: 'sales' });
    } catch (e) {
      console.error('[premium] notification admin', e);
    }
  }

  const appeal: Handler = async (c) => {
    const orgId = org(c, 'settings');
    const req = await getReq(orgId);
    if (!req || req.status !== 'rejected') fail(409, 'Aucun refus à contester');
    const message = str(c.body.message, 1500);
    if (message.length < 10) fail(422, 'Expliquez votre recours en quelques phrases');
    const at = new Date().toISOString();
    await tx(async (q) => {
      await q.query(`update verification_requests set status = 'pending', data = data || $2::jsonb where id = $1`,
        [req!.id, JSON.stringify({ status: 'pending', appeal: { message, at }, submittedAt: at })]);
      await logEntry(orgId, actorName(c), 'Recours déposé', message, false, q);
    });
    await safelyAdmins(`Recours : ${req!.data.name}`);
    return null;
  };

  const subscribe: Handler = async (c) => {
    const orgId = org(c, 'settings');
    const cfg = await getConfig();
    if (!cfg.enabled) fail(403, 'Le programme n’est pas ouvert pour le moment');
    // Une seule formule : un paiement unique couvre une année (la formule mensuelle n'existe plus)
    const plan = 'yearly';
    const amount = cfg.yearlyPrice;
    const method = str(c.body.method, 20) || 'moncash';
    const online = payConfigured() && amount >= MIN_HTG;
    if (online && !ONLINE_METHODS.includes(method)) fail(422, 'Moyen de paiement invalide');
    const id = `sp_${newId('p').slice(2)}`;
    await tx(async (q) => {
      // Une seule demande de paiement en attente à la fois : la précédente est remplacée
      await q.query(`update premium_payments set status = 'failed' where organizer_id = $1 and status = 'pending'`, [orgId]);
      await q.query(`insert into premium_payments (id, organizer_id, plan, amount, status, method) values ($1,$2,$3,$4,'pending',$5)`, [id, orgId, plan, amount, online ? method : 'transfer']);
      await logEntry(orgId, actorName(c), 'Paiement demandé', `${plan === 'yearly' ? 'Annuel' : 'Mensuel'} — ${amount} HTG`, false, q);
    });
    if (amount <= 0) {
      await applyPaid(id, 'Gratuit');
      return { paymentId: id, paid: true };
    }
    if (!online) return { paymentId: id, paid: false, manual: true };
    try {
      const p = await createPayment({ reference: id, amountHtg: Math.round(amount), method: method as OnlineMethod });
      return { paymentId: id, paid: false, payUrl: p.url };
    } catch (e) {
      console.error('[premium] paiement', e);
      await db().query(`update premium_payments set status = 'failed' where id = $1`, [id]);
      fail(502, 'Le paiement en ligne est momentanément indisponible. Réessayez dans un instant.');
    }
    return null;
  };

  /** Met un événement en vedette (page d'accueil), dans la limite fixée par l'administration. */
  const feature: Handler = async (c) => {
    const orgId = org(c, 'events');
    if (!(await benefitsFor(orgId)).includes('visibility')) fail(403, 'La mise en vedette est réservée aux organisateurs vérifiés');
    const on = c.body.on === true;
    const ev = await one<{ id: string; data: { status: string; end: string; featured?: boolean } }>(`select id, data from events where id = $1 and organizer_id = $2`, [c.params.id, orgId]);
    if (!ev) fail(404, 'Événement introuvable');
    if (on) {
      if (ev!.data.status !== 'published') fail(409, 'Seul un événement publié peut être mis en vedette');
      const cfg = await getConfig();
      const n = Number((await one<{ n: string }>(`select count(*) as n from events where organizer_id = $1 and id <> $2 and (data->>'featured')::boolean and data->>'status' = 'published'`, [orgId, ev!.id]))?.n ?? 0);
      if (n >= cfg.featuredPerOrganizer) fail(409, `Vous pouvez mettre ${cfg.featuredPerOrganizer} événement(s) en vedette à la fois`);
    }
    await db().query(`update events set data = data || jsonb_build_object('featured', $2::boolean) where id = $1`, [ev!.id, on]);
    return null;
  };

  const checkPay: Handler = async (c) => ({ status: await checkPremiumPayment(c.params.id) });

  const setCancel = (value: boolean): Handler => async (c) => {
    const orgId = org(c, 'settings');
    const s = await getSub(orgId);
    if (!s || s.status !== 'active') fail(409, 'Aucun abonnement actif');
    await db().query(`update premium_subscriptions set cancel_at_period_end = $2 where organizer_id = $1`, [orgId, value]);
    await logEntry(orgId, actorName(c), value ? 'Résiliation demandée' : 'Résiliation annulée', value ? 'L’abonnement se terminera à la date d’expiration.' : undefined);
    return null;
  };

  const invoice: Handler = async (c) => {
    const orgId = org(c, 'settings');
    const p = await one<PayRow>(`select * from premium_payments where id = $1 and organizer_id = $2 and status in ('paid', 'refund_due', 'refunded')`, [c.params.id, orgId]);
    if (!p) fail(404, 'Facture introuvable');
    const o = await one<{ name: string }>(`select data->>'name' as name from organizers where id = $1`, [orgId]);
    return { number: `E509-${p!.id.slice(3, 11).toUpperCase()}`, organization: o?.name ?? '', payment: payOut(p!) };
  };

  // ---------- Administration ----------

  const adminList: Handler = async (c) => {
    admin(c);
    const rows = await docs<VerificationRequest>(`select data from verification_requests where status <> 'draft' order by data->>'submittedAt' desc`);
    const subs = await all<SubRow>(`select * from premium_subscriptions`);
    const pays = await all<PayRow & { organizer_id: string }>(`select * from premium_payments where status in ('pending', 'paid', 'refund_due') order by created_at desc`);
    return rows.map((r) => ({
      ...r,
      subscription: subOut(subs.find((s) => s.organizer_id === r.organizerId) ?? null),
      payments: pays.filter((p) => p.organizer_id === r.organizerId).slice(0, 5).map(payOut),
    }));
  };

  const decide: Handler = async (c) => {
    const a = admin(c);
    const action = str(c.body.status, 20) as (typeof ADMIN_STATUSES)[number];
    if (!ADMIN_STATUSES.includes(action)) fail(422, 'Statut invalide');
    const note = str(c.body.note, 1000);
    if (['docs_requested', 'rejected', 'suspended', 'revoked'].includes(action) && note.length < 5) fail(422, 'Expliquez la décision (elle est communiquée à l’organisateur)');
    const cl = (c.body.checklist ?? {}) as Record<string, unknown>;
    const checklist = { identity: cl.identity === true, email: cl.email === true, phone: cl.phone === true, presence: cl.presence === true };
    const row = await one<{ organizer_id: string | null; status: VerificationStatus; data: VerificationRequest }>(`select organizer_id, status, data from verification_requests where id = $1`, [c.params.id]);
    if (!row?.organizer_id) fail(404, 'Demande introuvable');
    const orgId = row!.organizer_id!;
    if (row!.status === 'draft') fail(409, 'Cette demande n’a pas encore été soumise');
    const newStatus: VerificationStatus = action === 'revoked' ? 'rejected' : action === 'reinstated' ? 'approved' : action;
    if (action === 'reinstated' && row!.status !== 'suspended') fail(409, 'Seule une vérification suspendue peut être rétablie');
    if (action === 'approved' && Object.values(checklist).some((v) => !v)) fail(422, 'Cochez les quatre contrôles (identité, email, téléphone, présence) avant d’approuver');
    const labels: Record<string, string> = {
      in_review: 'Passée en cours de vérification', docs_requested: 'Documents supplémentaires demandés', approved: 'Demande approuvée',
      rejected: 'Demande refusée', suspended: 'Vérification suspendue', revoked: 'Certification révoquée', reinstated: 'Vérification rétablie',
    };
    const patch: Partial<VerificationRequest> = { status: newStatus, note: note || undefined };
    if (action === 'approved') { patch.approvedAt = new Date().toISOString(); patch.checklist = checklist; }
    if (action === 'reinstated') patch.note = undefined;
    const refund = await tx(async (q) => {
      await q.query(`update verification_requests set status = $2, data = data || $3::jsonb where id = $1`, [c.params.id, newStatus, JSON.stringify(patch)]);
      await logEntry(orgId, actorName(c), labels[action]!, note || undefined, false, q);
      let refundDue: number | null = null;
      // Refus ou révocation : l'abonnement prend fin ; le remboursement suit la politique configurée (seulement pour un refus)
      if (action === 'rejected' || action === 'revoked') {
        await q.query(`update premium_subscriptions set status = 'canceled', expires_at = now() where organizer_id = $1 and status = 'active'`, [orgId]);
        if (action === 'rejected') {
          const cfg = await getConfig(q);
          const pct = cfg.refund.onRejection === 'full' ? 100 : cfg.refund.onRejection === 'partial' ? Math.min(100, Math.max(0, cfg.refund.percent)) : 0;
          const p = pct > 0 ? await one<PayRow>(`select * from premium_payments where organizer_id = $1 and status = 'paid' order by paid_at desc limit 1`, [orgId], q) : null;
          if (p) {
            refundDue = Math.round((Number(p.amount) * pct) / 100);
            await q.query(`update premium_payments set status = 'refund_due', data = data || $2::jsonb where id = $1`, [p.id, JSON.stringify({ refundAmount: refundDue })]);
            await logEntry(orgId, 'Système', 'Remboursement à effectuer', `${refundDue} HTG (${pct} %)`, true, q);
          }
        }
      }
      await recompute(orgId, q);
      return refundDue;
    });
    await audit(c, labels[action]!, row!.data.name);
    const cfg = await getConfig();
    if (cfg.notify.onDecision) {
      const msg: Record<string, string> = {
        in_review: 'Votre demande est en cours de vérification.', docs_requested: `Des documents supplémentaires sont demandés : ${note}`,
        approved: 'Votre demande est approuvée. Votre badge est visible dès que votre abonnement est actif.', rejected: `Votre demande a été refusée : ${note}. Vous pouvez déposer un recours.`,
        suspended: `Votre vérification est suspendue : ${note}`, revoked: `Votre certification a été révoquée : ${note}`, reinstated: 'Votre vérification est rétablie.',
      };
      await tell(orgId, labels[action]!, msg[action]!);
    }
    return { refundDue: refund, by: a.id };
  };

  /**
   * L'administrateur vérifie (ou retire la vérification d') une organisation directement, sans demande ni paiement :
   * la demande est créée déjà approuvée et un abonnement offert est ouvert pour la durée de validité du programme.
   * Le badge reste calculé par recompute() ; retirer la vérification passe par le même chemin qu'une révocation.
   */
  const adminSetVerified: Handler = async (c) => {
    admin(c);
    const orgId = c.params.id!;
    const want = c.body.verified === true;
    const note = str(c.body.note, 500);
    const o = await one<{ data: { name?: string; city?: string } }>(`select data from organizers where id = $1`, [orgId]);
    if (!o) fail(404, 'Organisation introuvable');
    const owner = await one<{ email: string; data: { name?: string } }>(`select email, data from users where organizer_id = $1 order by (team_role = 'admin') desc, created_at limit 1`, [orgId]);
    const base = { name: o!.data.name ?? '', owner: owner?.data.name ?? '', email: owner?.email ?? '', city: o!.data.city ?? '' };
    const cfg = await getConfig();
    await tx(async (q) => {
      if (want) {
        const now = new Date().toISOString();
        await patchRequest(orgId, { status: 'approved', approvedAt: now, submittedAt: now, note: undefined, directByAdmin: true, checklist: { identity: true, email: true, phone: true, presence: true } }, base, q);
        await q.query(`update verification_requests set status = 'approved' where organizer_id = $1`, [orgId]);
        await q.query(
          `insert into premium_subscriptions (id, organizer_id, plan, status, started_at, expires_at)
           values ($1, $2, 'yearly', 'active', now(), now() + ($3 || ' days')::interval)
           on conflict (organizer_id) do update set plan = 'yearly', status = 'active', started_at = now(), expires_at = now() + ($3 || ' days')::interval, cancel_at_period_end = false`,
          [newId('sub'), orgId, String(cfg.validityDays)]);
        await logEntry(orgId, actorName(c), 'Vérifié directement par l’administration', note || 'Sans demande ni paiement', false, q);
      } else {
        const req = await getReq(orgId, q);
        if (req) await q.query(`update verification_requests set status = 'rejected', data = data || $2::jsonb where id = $1`, [req.id, JSON.stringify({ status: 'rejected', note: note || undefined })]);
        await q.query(`update premium_subscriptions set status = 'canceled', expires_at = now() where organizer_id = $1 and status = 'active'`, [orgId]);
        await logEntry(orgId, actorName(c), 'Vérification retirée par l’administration', note || undefined, false, q);
      }
      await recompute(orgId, q);
    });
    await audit(c, want ? 'Organisateur vérifié directement' : 'Vérification retirée', base.name);
    if (cfg.notify.onDecision) await tell(orgId, want ? 'Organisateur vérifié' : 'Vérification retirée', want ? 'Votre organisation est vérifiée par l’administration : votre badge est visible.' : 'La vérification de votre organisation a été retirée.');
    return { verified: want };
  };

  const adminLog: Handler = async (c) => {
    admin(c);
    const row = await one<{ organizer_id: string }>(`select organizer_id from verification_requests where id = $1`, [c.params.id]);
    if (!row) fail(404, 'Demande introuvable');
    const log = await all<{ id: string; at: Date; actor: string; action: string; note: string | null; internal: boolean }>(
      `select id, at, actor, action, note, internal from verification_log where organizer_id = $1 order by at desc limit 200`, [row!.organizer_id]);
    const views = await all<{ id: string; at: Date; admin_name: string; file_id: string }>(
      `select id, at, admin_name, file_id from document_access_log where organizer_id = $1 order by at desc limit 100`, [row!.organizer_id]);
    return {
      log: log.map((x) => ({ id: x.id, at: x.at.toISOString(), actor: x.actor, action: x.action, note: x.note ?? undefined, internal: x.internal })),
      views: views.map((x) => ({ id: x.id, at: x.at.toISOString(), admin: x.admin_name, fileId: x.file_id })),
    };
  };

  const adminComment: Handler = async (c) => {
    admin(c);
    const note = str(c.body.note, 1000);
    if (!note) fail(422, 'Écrivez un commentaire');
    const row = await one<{ organizer_id: string }>(`select organizer_id from verification_requests where id = $1`, [c.params.id]);
    if (!row) fail(404, 'Demande introuvable');
    await logEntry(row!.organizer_id, actorName(c), 'Commentaire interne', note, true);
    return null;
  };

  const getAdminConfig: Handler = async (c) => {
    admin(c);
    return getConfig();
  };
  const putAdminConfig: Handler = async (c) => {
    admin(c);
    const b = c.body as Partial<PremiumConfig>;
    const n = (v: unknown, min: number, max: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
    const cur = await getConfig();
    const docsOk = Array.isArray(b.requiredDocs) ? (b.requiredDocs.filter((x) => DOC_TYPES_OK.includes(x)) as PremiumConfig['requiredDocs']) : cur.requiredDocs;
    const next: PremiumConfig = {
      enabled: b.enabled !== false,
      yearlyPrice: n(b.yearlyPrice, 0, 100_000_000, cur.yearlyPrice),
      validityDays: Math.round(n(b.validityDays, 30, 3650, cur.validityDays)), requiredDocs: docsOk,
      processingDays: Math.round(n(b.processingDays, 1, 60, cur.processingDays)), minAge: Math.round(n(b.minAge, 13, 25, cur.minAge)),
      eligibility: Array.isArray(b.eligibility) ? b.eligibility.map((x) => str(x, 200)).filter(Boolean).slice(0, 20) : cur.eligibility,
      refund: {
        onRejection: (['full', 'partial', 'none'] as const).includes(b.refund?.onRejection as 'full') ? b.refund!.onRejection : cur.refund.onRejection,
        percent: Math.round(n(b.refund?.percent, 0, 100, cur.refund.percent)),
      },
      renewal: {
        remindDays: Array.isArray(b.renewal?.remindDays) ? b.renewal!.remindDays.map((x) => Math.round(n(x, 1, 90, 7))).slice(0, 5) : cur.renewal.remindDays,
        graceDays: Math.round(n(b.renewal?.graceDays, 0, 60, cur.renewal.graceDays)),
      },
      benefits: Object.fromEntries((Object.keys(DEFAULT_PREMIUM.benefits) as PremiumBenefit[]).map((k) => [k, b.benefits?.[k] ?? cur.benefits[k]])) as PremiumConfig['benefits'],
      notify: { onDecision: b.notify?.onDecision !== false, onExpiry: b.notify?.onExpiry !== false },
      apiLimits: { perMinute: Math.round(n(b.apiLimits?.perMinute, 1, 10_000, cur.apiLimits.perMinute)), maxKeys: Math.round(n(b.apiLimits?.maxKeys, 1, 50, cur.apiLimits.maxKeys)) },
      visibilityBoost: Math.round(n(b.visibilityBoost, 0, 100, cur.visibilityBoost)), featuredPerOrganizer: Math.round(n(b.featuredPerOrganizer, 0, 10, cur.featuredPerOrganizer)),
    };
    await upsert('settings', { key: 'premium', value: next });
    await audit(c, 'Réglages du programme vérifié modifiés', `${next.yearlyPrice} HTG par an`);
    // Un changement de durée de validité ou d'avantages s'applique tout de suite aux badges
    const orgs = await all<{ organizer_id: string }>(`select organizer_id from verification_requests where status in ('approved', 'expired')`);
    for (const o of orgs) await recompute(o.organizer_id);
    return next;
  };

  const adminSubs: Handler = async (c) => {
    admin(c);
    const rows = await all<SubRow & { name: string }>(
      `select s.*, o.data->>'name' as name from premium_subscriptions s join organizers o on o.id = s.organizer_id order by s.created_at desc`);
    const pending = await all<PayRow & { organizer_id: string; name: string }>(
      `select p.*, o.data->>'name' as name from premium_payments p join organizers o on o.id = p.organizer_id where p.status in ('pending', 'refund_due') order by p.created_at desc`);
    return {
      subscriptions: rows.map((r) => ({ ...subOut(r)!, name: r.name })),
      payments: pending.map((p) => ({ ...payOut(p), organizerId: p.organizer_id, name: p.name })),
    };
  };
  const adminConfirmPayment: Handler = async (c) => {
    const a = admin(c);
    const p = await one<{ method: string; status: string }>(`select method, status from premium_payments where id = $1`, [c.params.id]);
    if (!p) fail(404, 'Paiement introuvable');
    if (p!.status !== 'pending') fail(409, 'Ce paiement n’est plus en attente');
    await applyPaid(c.params.id, actorName(c));
    await audit(c, 'Paiement d’abonnement confirmé', c.params.id);
    return { by: a.id };
  };
  const adminRefunded: Handler = async (c) => {
    admin(c);
    const p = await one<{ organizer_id: string }>(`update premium_payments set status = 'refunded' where id = $1 and status = 'refund_due' returning organizer_id`, [c.params.id]);
    if (!p) fail(404, 'Aucun remboursement à effectuer');
    await logEntry(p!.organizer_id, actorName(c), 'Remboursement effectué', undefined, false);
    await audit(c, 'Remboursement d’abonnement effectué', c.params.id);
    return null;
  };

  return [
    ['GET', '/premium/config', publicConfig],
    ['POST', '/premium/payments/:id/check', checkPay],
    ['POST', '/org/events/:id/feature', feature],
    ['GET', '/org/premium', overview],
    ['PUT', '/org/premium/draft', saveDraft],
    ['POST', '/org/premium/apply', apply],
    ['POST', '/org/premium/appeal', appeal],
    ['POST', '/org/premium/subscribe', subscribe],
    ['POST', '/org/premium/cancel', setCancel(true)],
    ['POST', '/org/premium/resume', setCancel(false)],
    ['GET', '/org/premium/payments/:id/invoice', invoice],
    ['POST', '/admin/organizers/:id/verification', adminSetVerified],
    ['GET', '/admin/verifications', adminList],
    ['POST', '/admin/verifications/:id', decide],
    ['GET', '/admin/verifications/:id/log', adminLog],
    ['POST', '/admin/verifications/:id/comment', adminComment],
    ['GET', '/admin/premium/config', getAdminConfig],
    ['PUT', '/admin/premium/config', putAdminConfig],
    ['GET', '/admin/premium/subscriptions', adminSubs],
    ['POST', '/admin/premium/payments/:id/confirm', adminConfirmPayment],
    ['POST', '/admin/premium/payments/:id/refunded', adminRefunded],
  ];
}

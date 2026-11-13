import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Check, Download, Lock, RefreshCw } from 'lucide-react';
import { useApp } from '@/store/app';
import { useAsync, useTitle } from '@/lib/hooks';
import { dateShort, moneyRaw } from '@/lib/format';
import { getInvoice, getPremium, premiumAvailable, subscribePremium, type PremiumOverview } from '@/services/premium';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { Badge, Button, Card, EmptyState, Field, Loading, PageHeader, Select, Table, Td, type Tone } from '@/components/ui';
import type { PremiumBenefit, PremiumPayment } from '@/types';

const benefitLabels: Record<PremiumBenefit, string> = {
  profile: 'Profil officiel certifié', visibility: 'Visibilité renforcée', analytics: 'Statistiques avancées', multiEvents: 'Gestion multi-événements',
  team: 'Équipes avancées', support: 'Support prioritaire', marketing: 'Outils marketing', page: 'Page professionnelle', finance: 'Finances avancées', api: 'API et intégrations',
};
const SUB_STATUS: Record<string, { l: string; tone: Tone }> = {
  pending_payment: { l: 'Paiement en attente', tone: 'amber' }, active: { l: 'Actif', tone: 'green' }, canceled: { l: 'Résilié', tone: 'gray' },
  expired: { l: 'Expiré', tone: 'red' }, suspended: { l: 'Suspendu', tone: 'amber' },
};
const PAY_STATUS: Record<PremiumPayment['status'], { l: string; tone: Tone }> = {
  pending: { l: 'En attente', tone: 'amber' }, paid: { l: 'Payé', tone: 'green' }, failed: { l: 'Échoué', tone: 'red' },
  refund_due: { l: 'Remboursement en cours', tone: 'violet' }, refunded: { l: 'Remboursé', tone: 'gray' },
};
const METHODS: { v: string; l: string }[] = [{ v: 'moncash', l: 'MonCash' }, { v: 'natcash', l: 'NatCash' }, { v: 'kashpaw', l: 'KashPaw' }, { v: 'card', l: 'Carte bancaire' }];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Ouvre la facture dans une fenêtre prête à imprimer ou à enregistrer en PDF. */
async function openInvoice(id: string, lang: 'fr' | 'en', t: (s: string) => string) {
  const inv = await getInvoice(id);
  const p = inv.payment;
  const date = dateShort(p.paidAt ?? p.createdAt, lang);
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${esc(inv.number)}</title>
<style>body{font-family:system-ui,Arial,sans-serif;max-width:640px;margin:40px auto;padding:0 20px;color:#0B1533}h1{font-size:22px}table{width:100%;border-collapse:collapse;margin-top:24px}td,th{padding:10px 8px;border-bottom:1px solid #dde1ea;text-align:left}.r{text-align:right}.muted{color:#6E7689;font-size:13px}</style></head><body>
<h1>Event509 — ${esc(t('Facture'))} ${esc(inv.number)}</h1>
<p class="muted">${esc(t('Date'))} : ${esc(date)}<br>${esc(t('Client'))} : ${esc(inv.organization)}</p>
<table><tr><th>${esc(t('Description'))}</th><th class="r">${esc(t('Montant'))}</th></tr>
<tr><td>${esc(t('Abonnement Organisateur vérifié'))} — ${esc(p.plan === 'yearly' ? t('annuel') : t('mensuel'))}</td><td class="r">${esc(String(p.amount))} HTG</td></tr>
<tr><th>${esc(t('Total'))}</th><th class="r">${esc(String(p.amount))} HTG</th></tr></table>
<p class="muted">${esc(t('Statut'))} : ${esc(t(PAY_STATUS[p.status].l))}</p>
<script>window.onload=function(){window.print()}</script></body></html>`;
  const w = window.open(URL.createObjectURL(new Blob([html], { type: 'text/html' })), '_blank');
  if (!w) throw new Error('popup');
}

/** « Mon abonnement professionnel » : statut, échéances, paiement, factures, résiliation. */
export default function Subscription() {
  const { t } = useApp();
  useTitle(t('Mon abonnement professionnel'));
  const ov = useAsync(() => (premiumAvailable ? getPremium() : Promise.resolve(null)), [], { throwOnError: true });
  if (!premiumAvailable)
    return <EmptyState icon={<Lock className="h-5 w-5" />} title={t('Programme disponible sur le site en ligne')} body={t('L’abonnement nécessite le serveur : il n’est pas disponible dans la démonstration.')} />;
  if (!ov.data) return <Loading />;
  return <Content ov={ov.data} reload={ov.reload} />;
}

function Content({ ov, reload }: { ov: PremiumOverview; reload: () => void }) {
  const { t, lang, toast } = useApp();
  const [method, setMethod] = useState('moncash');
  const [busy, setBusy] = useState(false);
  const sub = ov.subscription;
  const c = ov.config;
  const pendingManual = ov.payments.find((p) => p.status === 'pending');
  const approved = ov.request?.status === 'approved' || ov.request?.status === 'expired';

  const pay = async () => {
    setBusy(true);
    try {
      const r = await subscribePremium(method);
      if (r.payUrl) { window.location.assign(r.payUrl); return; }
      toast(r.paid ? t('Abonnement activé') : t('Paiement enregistré : il sera confirmé par l’administration dès réception de votre virement.'));
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Le paiement a échoué. Réessayez.'), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t('Mon abonnement professionnel')} subtitle={t('Votre formule, vos paiements et vos avantages.')} />

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          {ov.verified && <VerifiedBadge size={28} />}
          <div className="min-w-0 flex-1">
            <h2 className="font-bold">{ov.verified ? t('Organisateur vérifié') : t('Badge non actif')}</h2>
            <p className="text-sm text-ink-soft">
              {ov.verified ? t('Votre badge est visible sur votre profil et vos événements.')
                : !approved ? t('Le badge s’active après l’approbation de votre demande et le paiement de l’abonnement.')
                : t('Votre demande est approuvée : activez l’abonnement pour afficher le badge.')}
            </p>
          </div>
          {!approved && <Link to="/organisateur/verification" className="text-sm font-semibold text-brand-ink">{t('Voir ma demande')}</Link>}
        </div>
      </Card>

      {sub && (
        <Card>
          <div className="flex flex-wrap items-center gap-2"><h2 className="font-bold">{t('Abonnement actuel')}</h2><Badge tone={SUB_STATUS[sub.status]!.tone}>{t(SUB_STATUS[sub.status]!.l)}</Badge></div>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs font-semibold text-ink-muted">{t('Formule')}</dt><dd>{sub.plan === 'yearly' ? t('Annuelle') : t('Mensuelle (ancienne formule)')}</dd></div>
            {sub.startedAt && <div><dt className="text-xs font-semibold text-ink-muted">{t('Activé le')}</dt><dd>{dateShort(sub.startedAt, lang)}</dd></div>}
            {sub.expiresAt && <div><dt className="text-xs font-semibold text-ink-muted">{t('Expire le')}</dt><dd>{dateShort(sub.expiresAt, lang)}</dd></div>}
          </dl>
          <p className="mt-3 text-xs text-ink-muted">{t('Si l’abonnement prend fin, seul le badge est masqué : vos événements et vos données sont conservés.')}</p>
        </Card>
      )}

      {c.enabled && (
        <Card>
          <h2 className="font-bold">{ov.subscriptionActive ? t('Renouveler pour une année de plus') : t('Souscrire pour l’année')}</h2>
          <p className="mt-3 text-3xl font-extrabold">{moneyRaw(c.yearlyPrice, 'HTG', lang)}<span className="text-sm font-semibold text-ink-muted"> / {t('an')}</span></p>
          <p className="mt-1 text-sm text-ink-soft">{ov.subscriptionActive ? t('Un paiement prolonge votre abonnement d’une année à partir de sa date d’expiration.') : t('Un seul paiement pour toute l’année, sans prélèvement automatique.')}</p>
          {c.onlinePayment && (
            <div className="mt-4 max-w-xs">
              <Field label={t('Moyen de paiement')}>
                <Select value={method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map((m) => <option key={m.v} value={m.v}>{t(m.l)}</option>)}</Select>
              </Field>
            </div>
          )}
          {!c.onlinePayment && <p className="mt-3 rounded-2xl bg-canvas p-3 text-sm text-ink-soft">{t('Le paiement en ligne n’est pas encore disponible : votre demande de paiement est enregistrée et l’administration la confirme dès réception de votre virement.')}</p>}
          {pendingManual && <p role="status" className="mt-3 text-sm font-semibold text-amber-700">{t('Un paiement de {amount} est en attente de confirmation.', { amount: moneyRaw(pendingManual.amount, 'HTG', lang) })}</p>}
          <Button className="mt-4" loading={busy} onClick={pay}><RefreshCw className="h-4 w-4" aria-hidden /> {ov.subscriptionActive ? t('Renouveler') : t('Payer l’abonnement')}</Button>
          <p className="mt-3 text-xs text-ink-muted">{t('Le paiement ne suffit pas : le badge est activé seulement après l’approbation de votre demande par un administrateur.')}</p>
        </Card>
      )}

      {ov.benefits.length > 0 && (
        <Card>
          <h2 className="font-bold">{t('Avantages actifs')}</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {ov.benefits.map((b) => <li key={b} className="flex items-center gap-2 text-sm"><Check className="h-4 w-4 text-emerald-600" aria-hidden />{t(benefitLabels[b])}</li>)}
          </ul>
        </Card>
      )}

      <section aria-labelledby="h-pay">
        <h2 id="h-pay" className="mb-3 flex items-center gap-2 text-lg font-extrabold"><CalendarClock className="h-5 w-5" aria-hidden /> {t('Historique des paiements')}</h2>
        {!ov.payments.length ? <p className="text-sm text-ink-muted">{t('Aucun paiement pour le moment.')}</p> : (
          <Card className="!p-0 overflow-hidden">
            <Table caption={t('Historique des paiements')} head={[t('Date'), t('Formule'), t('Montant'), t('Statut'), '']}>
              {ov.payments.map((p) => (
                <tr key={p.id}>
                  <Td>{dateShort(p.paidAt ?? p.createdAt, lang)}</Td>
                  <Td>{p.plan === 'yearly' ? t('Annuel') : t('Mensuel')}</Td>
                  <Td className="font-bold">{moneyRaw(p.amount, 'HTG', lang)}</Td>
                  <Td><Badge tone={PAY_STATUS[p.status].tone}>{t(PAY_STATUS[p.status].l)}</Badge></Td>
                  <Td>{['paid', 'refund_due', 'refunded'].includes(p.status) && (
                    <Button size="sm" variant="ghost" aria-label={t('Facture du {date}', { date: dateShort(p.paidAt ?? p.createdAt, lang) })}
                      onClick={() => openInvoice(p.id, lang, t).catch(() => toast(t('La facture n’a pas pu s’ouvrir. Autorisez les fenêtres pop-up.'), 'error'))}>
                      <Download className="h-4 w-4" aria-hidden />
                    </Button>
                  )}</Td>
                </tr>
              ))}
            </Table>
          </Card>
        )}
      </section>
    </div>
  );
}

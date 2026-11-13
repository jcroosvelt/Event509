import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { useApp } from '@/store/app';
import { useAsync, useTitle } from '@/lib/hooks';
import { dateShort, moneyRaw } from '@/lib/format';
import {
  confirmPremiumPayment, getAdminPremiumConfig, getPremiumAdmin, markPremiumRefunded, premiumAvailable, saveAdminPremiumConfig,
} from '@/services/premium';
import { Badge, Button, Card, EmptyState, Field, Input, Loading, PageHeader, Select, Table, Td, Textarea, Toggle } from '@/components/ui';
import type { PremiumBenefit, PremiumConfig, VerificationDocType } from '@/types';

const BENEFITS: { k: PremiumBenefit; l: string }[] = [
  { k: 'profile', l: 'Profil officiel certifié' }, { k: 'visibility', l: 'Visibilité renforcée' }, { k: 'analytics', l: 'Statistiques avancées' }, { k: 'multiEvents', l: 'Gestion multi-événements' },
  { k: 'team', l: 'Équipes avancées' }, { k: 'support', l: 'Support prioritaire' }, { k: 'marketing', l: 'Outils marketing' }, { k: 'page', l: 'Page professionnelle' }, { k: 'finance', l: 'Finances avancées' }, { k: 'api', l: 'API et intégrations' },
];
const DOCS: { k: VerificationDocType; l: string }[] = [
  { k: 'id', l: 'Pièce d’identité' }, { k: 'selfie', l: 'Selfie de vérification' }, { k: 'registration', l: 'Document d’enregistrement' }, { k: 'representation', l: 'Représentation légale' }, { k: 'license', l: 'Patente / NIF' }, { k: 'bank', l: 'Justificatif bancaire' },
];

/** Réglages du programme « Organisateur vérifié », abonnements et paiements à confirmer. Aucun prix n'est fixé dans le code. */
export default function PremiumSettings() {
  const { t } = useApp();
  useTitle(t('Programme vérifié'));
  if (!premiumAvailable)
    return <EmptyState icon={<Lock className="h-5 w-5" />} title={t('Programme disponible sur le site en ligne')} body={t('Les réglages du programme nécessitent le serveur.')} />;
  return <Content />;
}

function Content() {
  const { t, toast, lang } = useApp();
  const cfg = useAsync(() => getAdminPremiumConfig(), [], { throwOnError: true });
  const subs = useAsync(() => getPremiumAdmin(), [], { throwOnError: true });
  const [c, setC] = useState<PremiumConfig | null>(null);
  const [elig, setElig] = useState('');
  const [remind, setRemind] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (cfg.data && !c) {
      setC(cfg.data);
      setElig(cfg.data.eligibility.join('\n'));
      setRemind(cfg.data.renewal.remindDays.join(', '));
    }
  }, [cfg.data, c]);
  if (!c) return <Loading />;
  const up = (p: Partial<PremiumConfig>) => setC({ ...c, ...p });

  const save = async () => {
    setBusy(true);
    try {
      const days = remind.split(/[,\s]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0);
      const saved = await saveAdminPremiumConfig({ ...c, eligibility: elig.split('\n').map((x) => x.trim()).filter(Boolean), renewal: { ...c.renewal, remindDays: days } });
      setC(saved);
      toast(t('Réglages enregistrés : ils s’appliquent immédiatement'));
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Enregistrement impossible'), 'error');
    } finally {
      setBusy(false);
    }
  };
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast(ok);
      subs.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Action impossible'), 'error');
    }
  };
  const num = (v: string) => (v === '' ? 0 : Number(v));

  return (
    <div className="space-y-6">
      <PageHeader title={t('Programme vérifié')} subtitle={t('Tarifs, conditions, avantages et politiques du programme « Organisateur vérifié ».')} actions={<Button loading={busy} onClick={save}>{t('Enregistrer')}</Button>} />

      <Card>
        <h2 className="mb-3 font-bold">{t('Général et tarifs')}</h2>
        <Toggle checked={c.enabled} onChange={(v) => up({ enabled: v })} label={t('Programme ouvert aux nouvelles demandes')} description={t('Désactivé : plus de demande ni de souscription ; les organisateurs déjà certifiés gardent leur badge.')} />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t('Prix mensuel (HTG)')}><Input type="number" inputMode="numeric" min={0} value={String(c.monthlyPrice)} onChange={(e) => up({ monthlyPrice: num(e.target.value) })} /></Field>
          <Field label={t('Prix annuel (HTG)')}><Input type="number" inputMode="numeric" min={0} value={String(c.yearlyPrice)} onChange={(e) => up({ yearlyPrice: num(e.target.value) })} /></Field>
          <Field label={t('Validité de la certification (jours)')}><Input type="number" inputMode="numeric" min={30} value={String(c.validityDays)} onChange={(e) => up({ validityDays: num(e.target.value) })} /></Field>
          <Field label={t('Délai de traitement (jours)')}><Input type="number" inputMode="numeric" min={1} value={String(c.processingDays)} onChange={(e) => up({ processingDays: num(e.target.value) })} /></Field>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 font-bold">{t('Éligibilité et documents')}</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label={t('Conditions affichées (une par ligne)')}><Textarea rows={8} value={elig} onChange={(e) => setElig(e.target.value)} /></Field>
          <div>
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-semibold">{t('Documents obligatoires')}</legend>
              {DOCS.map((d) => (
                <Toggle key={d.k} checked={c.requiredDocs.includes(d.k)} onChange={(v) => up({ requiredDocs: v ? [...c.requiredDocs, d.k] : c.requiredDocs.filter((x) => x !== d.k) })} label={t(d.l)} />
              ))}
            </fieldset>
            <div className="mt-4 max-w-[12rem]"><Field label={t('Âge minimum')}><Input type="number" inputMode="numeric" min={13} value={String(c.minAge)} onChange={(e) => up({ minAge: num(e.target.value) })} /></Field></div>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 font-bold">{t('Remboursement, renouvellement et notifications')}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t('Remboursement en cas de refus')}>
            <Select value={c.refund.onRejection} onChange={(e) => up({ refund: { ...c.refund, onRejection: e.target.value as PremiumConfig['refund']['onRejection'] } })}>
              <option value="full">{t('Total')}</option><option value="partial">{t('Partiel')}</option><option value="none">{t('Aucun')}</option>
            </Select>
          </Field>
          {c.refund.onRejection === 'partial' && <Field label={t('Pourcentage remboursé')}><Input type="number" inputMode="numeric" min={0} max={100} value={String(c.refund.percent)} onChange={(e) => up({ refund: { ...c.refund, percent: num(e.target.value) } })} /></Field>}
          <Field label={t('Rappels avant expiration (jours)')} hint={t('Séparés par des virgules')}><Input value={remind} onChange={(e) => setRemind(e.target.value)} /></Field>
          <Field label={t('Délai de grâce après expiration (jours)')}><Input type="number" inputMode="numeric" min={0} value={String(c.renewal.graceDays)} onChange={(e) => up({ renewal: { ...c.renewal, graceDays: num(e.target.value) } })} /></Field>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Toggle checked={c.notify.onDecision} onChange={(v) => up({ notify: { ...c.notify, onDecision: v } })} label={t('Notifier chaque décision de vérification')} />
          <Toggle checked={c.notify.onExpiry} onChange={(v) => up({ notify: { ...c.notify, onExpiry: v } })} label={t('Notifier les rappels et l’expiration')} />
        </div>
        <p className="mt-3 text-xs text-ink-muted">{t('À l’expiration, seul le badge est masqué : les données et événements de l’organisateur ne sont jamais supprimés.')}</p>
      </Card>

      <Card>
        <h2 className="mb-3 font-bold">{t('Avantages inclus')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {BENEFITS.map((b) => <Toggle key={b.k} checked={c.benefits[b.k]} onChange={(v) => up({ benefits: { ...c.benefits, [b.k]: v } })} label={t(b.l)} />)}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:max-w-lg">
          <Field label={t('Visibilité : coup de pouce dans « Populaires » (%)')} hint={t('Les tris par date et par prix ne sont jamais modifiés')}><Input type="number" inputMode="numeric" min={0} max={100} value={String(c.visibilityBoost)} onChange={(e) => up({ visibilityBoost: num(e.target.value) })} /></Field>
          <Field label={t('Événements en vedette par organisateur')}><Input type="number" inputMode="numeric" min={0} max={10} value={String(c.featuredPerOrganizer)} onChange={(e) => up({ featuredPerOrganizer: num(e.target.value) })} /></Field>
          <Field label={t('API : requêtes par minute')}><Input type="number" inputMode="numeric" min={1} value={String(c.apiLimits.perMinute)} onChange={(e) => up({ apiLimits: { ...c.apiLimits, perMinute: num(e.target.value) } })} /></Field>
          <Field label={t('API : clés par organisation')}><Input type="number" inputMode="numeric" min={1} value={String(c.apiLimits.maxKeys)} onChange={(e) => up({ apiLimits: { ...c.apiLimits, maxKeys: num(e.target.value) } })} /></Field>
        </div>
      </Card>

      <section aria-labelledby="h-subs">
        <h2 id="h-subs" className="mb-3 text-lg font-extrabold">{t('Paiements à traiter')}</h2>
        {!subs.data ? <Loading /> : !subs.data.payments.length ? <p className="text-sm text-ink-muted">{t('Aucun paiement en attente ni remboursement à effectuer.')}</p> : (
          <Card className="!p-0 overflow-hidden">
            <Table caption={t('Paiements à traiter')} head={[t('Organisation'), t('Date'), t('Montant'), t('Statut'), '']}>
              {subs.data.payments.map((p) => (
                <tr key={p.id}>
                  <Td className="font-semibold">{p.name}</Td>
                  <Td>{dateShort(p.createdAt, lang)}</Td>
                  <Td>{moneyRaw(p.status === 'refund_due' ? p.refundAmount ?? p.amount : p.amount, 'HTG', lang)}</Td>
                  <Td><Badge tone={p.status === 'pending' ? 'amber' : 'violet'}>{p.status === 'pending' ? t('Paiement à confirmer') : t('Remboursement à effectuer')}</Badge></Td>
                  <Td>
                    {p.status === 'pending'
                      ? <Button size="sm" variant="soft" onClick={() => act(() => confirmPremiumPayment(p.id), t('Paiement confirmé'))}>{t('Confirmer la réception')}</Button>
                      : <Button size="sm" variant="soft" onClick={() => act(() => markPremiumRefunded(p.id), t('Remboursement marqué effectué'))}>{t('Marquer remboursé')}</Button>}
                  </Td>
                </tr>
              ))}
            </Table>
          </Card>
        )}
        <h2 className="mb-3 mt-8 text-lg font-extrabold">{t('Abonnements')}</h2>
        {!subs.data?.subscriptions.length ? <p className="text-sm text-ink-muted">{t('Aucun abonnement pour le moment.')}</p> : (
          <Card className="!p-0 overflow-hidden">
            <Table caption={t('Abonnements')} head={[t('Organisation'), t('Formule'), t('Statut'), t('Expire le')]}>
              {subs.data.subscriptions.map((s) => (
                <tr key={s.id}>
                  <Td className="font-semibold">{s.name}</Td>
                  <Td>{s.plan === 'yearly' ? t('Annuel') : t('Mensuel')}</Td>
                  <Td><Badge tone={s.status === 'active' ? 'green' : s.status === 'pending_payment' ? 'amber' : 'gray'}>{t(s.status === 'active' ? 'Actif' : s.status === 'pending_payment' ? 'Paiement en attente' : s.status === 'canceled' ? 'Résilié' : s.status === 'expired' ? 'Expiré' : 'Suspendu')}</Badge></Td>
                  <Td>{s.expiresAt ? dateShort(s.expiresAt, lang) : '—'}</Td>
                </tr>
              ))}
            </Table>
          </Card>
        )}
      </section>
    </div>
  );
}

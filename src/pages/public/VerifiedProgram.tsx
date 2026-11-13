import {
  BarChart3, CalendarClock, Check, CreditCard, FileCheck2, Headphones, Megaphone, Palette, PlugZap, Search, ShieldCheck, Sparkles, Users, Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useApp } from '@/store/app';
import { useAsync, useTitle } from '@/lib/hooks';
import { moneyRaw } from '@/lib/format';
import { getPremiumConfig, premiumAvailable } from '@/services/premium';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { ButtonLink, Card, Loading, SectionHeader } from '@/components/ui';
import type { PremiumBenefit } from '@/types';

const BENEFITS: { key: PremiumBenefit; icon: LucideIcon; l: string; d: string }[] = [
  { key: 'profile', icon: ShieldCheck, l: 'Profil officiel certifié', d: 'Coche bleue à côté de votre nom et sur tous vos événements, avec la date de certification.' },
  { key: 'visibility', icon: Search, l: 'Visibilité renforcée', d: 'Une section dédiée et un coup de pouce transparent dans les résultats, sans jamais masquer les autres organisateurs.' },
  { key: 'analytics', icon: BarChart3, l: 'Statistiques avancées', d: 'Ventes, conversion, provenance, comparaison d’événements, exportation PDF et Excel.' },
  { key: 'multiEvents', icon: CalendarClock, l: 'Gestion multi-événements', d: 'Événements récurrents, modèles enregistrés, calendrier professionnel et vue globale.' },
  { key: 'team', icon: Users, l: 'Équipes avancées', d: 'Plusieurs collaborateurs, rôles et permissions, suivi des entrées de chaque agent de contrôle.' },
  { key: 'support', icon: Headphones, l: 'Support prioritaire', d: 'Un canal d’assistance réservé, avec suivi de résolution, y compris pendant vos événements.' },
  { key: 'marketing', icon: Megaphone, l: 'Outils marketing', d: 'Campagnes, codes promo avancés, liens de suivi et programme d’ambassadeurs, dans le respect du consentement.' },
  { key: 'page', icon: Palette, l: 'Page professionnelle', d: 'Adresse personnalisée, logo, bannière, couleurs de marque et galerie de vos événements.' },
  { key: 'finance', icon: Wallet, l: 'Finances avancées', d: 'Revenus, commissions, retraits et rapports exportables. Les contrôles financiers restent appliqués.' },
  { key: 'api', icon: PlugZap, l: 'API et intégrations', d: 'Clés sécurisées, widgets de billetterie et webhooks pour vos propres outils.' },
];

const STEPS = [
  { icon: FileCheck2, l: 'Vous déposez votre demande', d: 'Un formulaire en quatre étapes, enregistré automatiquement : vous pouvez le reprendre plus tard.' },
  { icon: CreditCard, l: 'Vous réglez l’abonnement', d: 'Le paiement est une étape distincte : il n’active jamais le badge à lui seul.' },
  { icon: ShieldCheck, l: 'Notre équipe vérifie', d: 'Identité, informations professionnelles et présence en ligne sont contrôlées par un administrateur.' },
  { icon: Sparkles, l: 'Votre badge s’active', d: 'Dès l’approbation et l’abonnement actifs, la coche bleue apparaît automatiquement.' },
];

/** Présentation du programme. Tarifs, conditions et avantages viennent des réglages de l'administration. */
export default function VerifiedProgram() {
  const { t, lang } = useApp();
  useTitle(t('Devenez un organisateur vérifié'));
  const cfg = useAsync(() => (premiumAvailable ? getPremiumConfig() : Promise.resolve(null)), []);
  if (cfg.loading) return <Loading />;
  const c = cfg.data;
  const yearlySaving = c && c.monthlyPrice > 0 ? Math.max(0, Math.round((1 - c.yearlyPrice / (c.monthlyPrice * 12)) * 100)) : 0;
  const benefits = BENEFITS.filter((b) => !c || c.benefits[b.key]);

  return (
    <div className="mx-auto max-w-5xl space-y-14 px-4 py-10 sm:px-6">
      <header className="text-center">
        <div className="mx-auto mb-5 grid h-24 w-24 place-items-center rounded-full bg-brand-100 dark:bg-brand/20"><VerifiedBadge size={64} /></div>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t('Devenez un organisateur vérifié')}</h1>
        <p className="mx-auto mt-3 max-w-2xl text-ink-soft">{t('Une coche bleue officielle et des outils professionnels pour les organisateurs dont l’identité et les informations ont été vérifiées par notre équipe.')}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <ButtonLink to="/organisateur/verification" size="lg">{t('Demander la vérification')}</ButtonLink>
        </div>
      </header>

      <section aria-labelledby="h-adv">
        <SectionHeader id="h-adv" title={t('Les avantages du programme')} />
        <ul className="grid gap-4 sm:grid-cols-2">
          {benefits.map((b) => (
            <li key={b.key}>
              <Card className="flex h-full gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-100 text-brand-ink dark:bg-brand/20"><b.icon className="h-5 w-5" aria-hidden /></span>
                <div>
                  <h3 className="font-bold">{t(b.l)}</h3>
                  <p className="mt-1 text-sm text-ink-soft">{t(b.d)}</p>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="h-proc">
        <SectionHeader id="h-proc" title={t('Comment ça marche')} />
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.l}>
              <Card className="h-full">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-contrast text-sm font-extrabold text-on-contrast">{i + 1}</span>
                <h3 className="mt-3 font-bold">{t(s.l)}</h3>
                <p className="mt-1 text-sm text-ink-soft">{t(s.d)}</p>
              </Card>
            </li>
          ))}
        </ol>
        {c && <p className="mt-3 text-sm text-ink-muted">{t('Délai de traitement habituel : {n} jour(s) ouvrés après le dépôt de la demande complète.', { n: c.processingDays })}</p>}
      </section>

      {c && (
        <section aria-labelledby="h-elig">
          <SectionHeader id="h-elig" title={t('Conditions d’éligibilité')} />
          <Card>
            <ul className="space-y-2.5">
              {c.eligibility.map((e) => (
                <li key={e} className="flex gap-3 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden /><span>{t(e)}</span></li>
              ))}
            </ul>
            <p className="mt-4 rounded-2xl bg-canvas p-3 text-sm text-ink-soft">{t('Les organisateurs indépendants sont les bienvenus : une entreprise officiellement enregistrée n’est pas obligatoire.')}</p>
          </Card>
        </section>
      )}

      <section id="tarifs" aria-labelledby="h-prix">
        <SectionHeader id="h-prix" title={t('Tarifs')} />
        {c && c.enabled ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <h3 className="font-bold">{t('Mensuel')}</h3>
              <p className="mt-2 text-3xl font-extrabold">{moneyRaw(c.monthlyPrice, 'HTG', lang)}<span className="text-base font-semibold text-ink-muted"> / {t('mois')}</span></p>
              <p className="mt-2 text-sm text-ink-soft">{t('Sans engagement : résiliable à tout moment.')}</p>
            </Card>
            <Card className="ring-2 ring-brand">
              <h3 className="font-bold">{t('Annuel')}{yearlySaving > 0 && <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-white">−{yearlySaving} %</span>}</h3>
              <p className="mt-2 text-3xl font-extrabold">{moneyRaw(c.yearlyPrice, 'HTG', lang)}<span className="text-base font-semibold text-ink-muted"> / {t('an')}</span></p>
              <p className="mt-2 text-sm text-ink-soft">{t('La formule la plus avantageuse pour un organisateur régulier.')}</p>
            </Card>
          </div>
        ) : (
          <Card><p className="text-sm text-ink-soft">{premiumAvailable ? t('Le programme n’est pas ouvert aux nouvelles demandes pour le moment.') : t('Les tarifs sont affichés sur le site en ligne.')}</p></Card>
        )}
        <p className="mt-3 text-sm text-ink-muted">
          {t('La coche bleue certifie l’identité de l’organisateur. Elle ne garantit pas la réussite de ses événements.')}
          {c && c.refund.onRejection !== 'none' && ` ${c.refund.onRejection === 'full' ? t('En cas de refus de la vérification, l’abonnement est remboursé.') : t('En cas de refus de la vérification, l’abonnement est remboursé à {n} %.', { n: c.refund.percent })}`}
        </p>
        <div className="mt-6 text-center"><ButtonLink to="/organisateur/verification" size="lg">{t('Demander la vérification')}</ButtonLink></div>
      </section>
    </div>
  );
}

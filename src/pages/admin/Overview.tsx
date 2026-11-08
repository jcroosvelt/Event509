import { useMemo, useState } from 'react';
import { CalendarDays, Gavel, Ticket, TrendingUp, Users, Wallet } from 'lucide-react';
import { cities, platformMonthly } from '@/data/mock';
import { useApp } from '@/store/app';
import { useTitle } from '@/lib/hooks';
import { num } from '@/lib/format';
import { BarChart, Card, PageHeader, ProgressBar, Segmented, SparkLine, StatCard } from '@/components/ui';

export default function Overview() {
  const { lang, feePercent, t } = useApp();
  useTitle(t('Vue d’ensemble'));
  const [m, setM] = useState<'gmv' | 'fees'>('gmv');
  const [active, setActive] = useState(5);
  // Libellés des 6 derniers mois dans la langue de l'interface
  const months = useMemo(
    () =>
      platformMonthly.map((_, i) => {
        const d = new Date();
        d.setMonth(d.getMonth() - (platformMonthly.length - 1 - i));
        return d.toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR', { month: 'short' }).replace('.', '');
      }),
    [lang],
  );
  const data = platformMonthly.map((x, i) => ({ label: months[i], value: x[m], max: m === 'gmv' ? 9 : 0.45 }));
  const cur = platformMonthly[active];
  const loc = lang === 'en' ? 'en-US' : 'fr-FR';

  return (
    <div className="space-y-6">
      <PageHeader title={t('Vue d’ensemble')} subtitle={t('Statistiques globales de la plateforme Event509.')} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('Utilisateurs')} value={(48200).toLocaleString(loc, { notation: 'compact' })} icon={<Users className="h-[18px] w-[18px]" />} hint={t('+{n} ce mois', { n: num(1240, lang) })} />
        <StatCard label={t('Événements actifs')} value="312" icon={<CalendarDays className="h-[18px] w-[18px]" />} tone="orange" hint={t('{n} en validation', { n: 18 })} />
        <StatCard label={t('Billets vendus (mois)')} value={num(64210, lang)} icon={<Ticket className="h-[18px] w-[18px]" />} tone="green" />
        <StatCard label={t('Litiges ouverts')} value="2" icon={<Gavel className="h-[18px] w-[18px]" />} tone="red" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-ink-soft">{m === 'gmv' ? t('Volume de ventes') : t('Commissions')} · <span className="first-letter:uppercase">{months[active]}</span></h2>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-4xl font-extrabold tracking-tight sm:text-5xl">{cur[m].toLocaleString(loc)}</span>
                <span className="text-lg text-ink-muted">{t('M HTG')}</span>
              </div>
            </div>
            <Segmented label={t('Indicateur')} size="sm" value={m} onChange={setM} options={[{ value: 'gmv', label: t('Volume') }, { value: 'fees', label: t('Commissions') }]} />
          </div>
          <div className="mt-6">
            <BarChart label={t('Évolution mensuelle')} data={data} activeIndex={active} onSelect={setActive} format={(_, v) => v.toLocaleString(loc)} height={180} />
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">{t('Croissance')}</h2><TrendingUp className="h-4 w-4 text-emerald-600" aria-hidden /></div>
            <SparkLine values={platformMonthly.map((x) => x.gmv)} />
            <div className="mt-2 text-2xl font-extrabold">+171 %</div>
            <div className="text-xs text-ink-muted">{t('sur 6 mois')}</div>
          </Card>
          <Card>
            <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">{t('Commission par défaut')}</h2><Wallet className="h-4 w-4 text-brand" aria-hidden /></div>
            <div className="text-2xl font-extrabold">{feePercent} %</div>
            <div className="text-xs text-ink-muted">{t('Modifiable dans Commissions')}</div>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-bold">{t('Ventes par ville')}</h2>
          <ul className="space-y-3">
            {cities.slice(0, 6).map((c, i) => {
              const v = [0.46, 0.21, 0.11, 0.08, 0.06, 0.04][i];
              return (
                <li key={c}>
                  <div className="mb-1 flex justify-between text-sm"><span className="font-medium">{c}</span><span className="text-ink-muted">{Math.round(v * 100)} %</span></div>
                  <ProgressBar value={v / 0.46} label={c} />
                </li>
              );
            })}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-4 font-bold">{t('Moyens de paiement')}</h2>
          <ul className="space-y-3">
            {([['MonCash', 0.52, 'red'], ['Carte bancaire', 0.21, 'brand'], ['NatCash', 0.14, 'ink'], ['PayPal', 0.09, 'green'], ['Virement bancaire', 0.04, 'ink']] as const).map(([n, v, tone]) => (
              <li key={n}>
                <div className="mb-1 flex justify-between text-sm"><span className="font-medium">{t(n)}</span><span className="text-ink-muted">{Math.round(v * 100)} %</span></div>
                <ProgressBar value={v / 0.52} tone={tone} label={t(n)} />
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

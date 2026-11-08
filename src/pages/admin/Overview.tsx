import { useState } from 'react';
import { CalendarDays, Gavel, Ticket, TrendingUp, Users, Wallet } from 'lucide-react';
import { cities, platformMonthly } from '@/data/mock';
import { useApp } from '@/store/app';
import { num } from '@/lib/format';
import { BarChart, Card, PageHeader, ProgressBar, Segmented, SparkLine, StatCard } from '@/components/ui';

export default function Overview() {
  const { lang, feePercent } = useApp();
  const [m, setM] = useState<'gmv' | 'fees'>('gmv');
  const [active, setActive] = useState(5);
  const data = platformMonthly.map((x) => ({ label: x.month, value: x[m], max: m === 'gmv' ? 9 : 0.45 }));
  const cur = platformMonthly[active];

  return (
    <div className="space-y-6">
      <PageHeader title="Vue d’ensemble" subtitle="Statistiques globales de la plateforme Event509." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Utilisateurs" value="48,2k" icon={<Users className="h-[18px] w-[18px]" />} hint="+1 240 ce mois" />
        <StatCard label="Événements actifs" value="312" icon={<CalendarDays className="h-[18px] w-[18px]" />} tone="orange" hint="18 en validation" />
        <StatCard label="Billets vendus (mois)" value={num(64210, lang)} icon={<Ticket className="h-[18px] w-[18px]" />} tone="green" />
        <StatCard label="Litiges ouverts" value="2" icon={<Gavel className="h-[18px] w-[18px]" />} tone="red" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="font-semibold text-ink-soft">{m === 'gmv' ? 'Volume de ventes' : 'Commissions'} · {cur.month}</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-5xl font-extrabold tracking-tight">{cur[m].toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR')}</span>
                <span className="text-lg text-ink-muted">M HTG</span>
              </div>
            </div>
            <Segmented size="sm" value={m} onChange={setM} options={[{ value: 'gmv', label: 'Volume' }, { value: 'fees', label: 'Commissions' }]} />
          </div>
          <div className="mt-6">
            <BarChart data={data} activeIndex={active} onSelect={setActive} format={(_, v) => `${v}`} height={180} />
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <div className="mb-2 flex items-center justify-between"><span className="text-sm font-semibold">Croissance</span><TrendingUp className="h-4 w-4 text-emerald-600" /></div>
            <SparkLine values={platformMonthly.map((x) => x.gmv)} />
            <div className="mt-2 text-2xl font-extrabold">+171%</div>
            <div className="text-xs text-ink-muted">sur 6 mois</div>
          </Card>
          <Card>
            <div className="mb-2 flex items-center justify-between"><span className="text-sm font-semibold">Commission moyenne</span><Wallet className="h-4 w-4 text-brand" /></div>
            <div className="text-2xl font-extrabold">{feePercent}%</div>
            <div className="text-xs text-ink-muted">Configurable dans Commissions</div>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-bold">Ventes par ville</h2>
          <div className="space-y-3">
            {cities.slice(0, 6).map((c, i) => {
              const v = [0.46, 0.21, 0.11, 0.08, 0.06, 0.04][i];
              return (
                <div key={c}>
                  <div className="mb-1 flex justify-between text-sm"><span className="font-medium">{c}</span><span className="text-ink-muted">{Math.round(v * 100)}%</span></div>
                  <ProgressBar value={v / 0.46} />
                </div>
              );
            })}
          </div>
        </Card>
        <Card>
          <h2 className="mb-4 font-bold">Moyens de paiement</h2>
          <div className="space-y-3">
            {[['MonCash', 0.52, 'red'], ['Carte bancaire', 0.21, 'brand'], ['NatCash', 0.14, 'ink'], ['PayPal', 0.09, 'green'], ['Virement', 0.04, 'ink']].map(([n, v, t]) => (
              <div key={n as string}>
                <div className="mb-1 flex justify-between text-sm"><span className="font-medium">{n}</span><span className="text-ink-muted">{Math.round((v as number) * 100)}%</span></div>
                <ProgressBar value={(v as number) / 0.52} tone={t as 'brand'} />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

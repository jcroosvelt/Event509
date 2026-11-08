import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Eye, Pencil, ScanLine, Ticket, Users, Wallet } from 'lucide-react';
import { eventStats } from '@/services/api';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { compact, dateShort, moneyRaw, num } from '@/lib/format';
import { exportCSV } from '@/lib/export';
import { BarChart, Button, ButtonLink, Card, Loading, PageHeader, ProgressBar, ProgressRing, StatCard, Table, Td } from '@/components/ui';
import NotFound from '../public/NotFound';

export default function EventStats() {
  const { id = '' } = useParams();
  const { t, lang } = useApp();
  const { data, loading } = useAsync(() => eventStats(id), [id]);
  const [active, setActive] = useState(13);
  useTitle(data ? t('Statistiques — {event}', { event: data.event.title }) : t('Statistiques'));

  if (loading) return <Loading />;
  if (!data) return <NotFound />;
  const { event: e, byType, daily, sources, checkins } = data;
  const sold = byType.reduce((a, x) => a + x.sold, 0);
  const quota = byType.reduce((a, x) => a + x.quota, 0);
  const revenue = byType.reduce((a, x) => a + x.revenue, 0);
  const peak = Math.max(...daily.map((d) => d.tickets), 1);

  return (
    <div className="space-y-6">
      <Link to="/organisateur/evenements" className="inline-flex items-center gap-2 text-sm font-semibold text-ink-soft"><ArrowLeft className="h-4 w-4" aria-hidden /> {t('Événements')}</Link>
      <PageHeader
        title={e.title}
        subtitle={`${dateShort(e.start, lang)} · ${e.venue?.name ?? e.online?.platform ?? ''}`}
        actions={
          <>
            <ButtonLink to={`/organisateur/evenements/${e.id}`} variant="outline"><Pencil className="h-4 w-4" aria-hidden /> {t('Modifier')}</ButtonLink>
            <ButtonLink to={`/organisateur/participants?e=${e.id}`} variant="dark"><Users className="h-4 w-4" aria-hidden /> {t('Participants')}</ButtonLink>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('Billets vendus')} value={num(sold, lang)} unit={`/ ${compact(quota, lang)}`} icon={<Ticket className="h-[18px] w-[18px]" />} tone="green" />
        <StatCard label={t('Revenus bruts')} value={compact(revenue, lang)} unit={e.currency} icon={<Wallet className="h-[18px] w-[18px]" />} tone="red" />
        <StatCard label={t('Visites de la page')} value={compact(data.views, lang)} hint={t('Conversion {n} %', { n: data.views ? ((sold / data.views) * 100).toFixed(1) : 0 })} icon={<Eye className="h-[18px] w-[18px]" />} />
        <StatCard label={t('Entrées scannées')} value={`${checkins.done}/${checkins.total}`} icon={<ScanLine className="h-[18px] w-[18px]" />} tone="orange" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <Card className="p-6">
          <h2 className="font-bold">{t('Ventes des 14 derniers jours')}</h2>
          <p className="mb-4 text-sm text-ink-muted">{t('{n} billets le {date}', { n: daily[active].tickets, date: dateShort(daily[active].date, lang) })}</p>
          <BarChart
            label={t('Ventes par jour')}
            data={daily.map((d) => ({ label: new Date(d.date).getDate().toString(), value: d.tickets, max: peak }))}
            activeIndex={active}
            onSelect={setActive}
            format={(_, v) => String(v)}
            height={160}
          />
        </Card>
        <Card>
          <h2 className="mb-4 font-bold">{t('Remplissage')}</h2>
          <div className="flex items-center gap-4">
            <ProgressRing value={quota ? sold / quota : 0} size={110} stroke={12} track="rgb(var(--canvas))">
              <span className="text-xl font-extrabold">{quota ? Math.round((sold / quota) * 100) : 0}%</span>
            </ProgressRing>
            <p className="text-sm text-ink-soft">{t('{n} places restantes', { n: num(quota - sold, lang) })}</p>
          </div>
          <h2 className="mb-3 mt-6 font-bold">{t('Provenance des acheteurs')}</h2>
          <ul className="space-y-3">
            {sources.map((s) => (
              <li key={s.label}>
                <div className="mb-1 flex justify-between text-sm"><span>{t(s.label)}</span><span className="text-ink-muted">{Math.round(s.share * 100)}%</span></div>
                <ProgressBar value={s.share / sources[0].share} label={t(s.label)} />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold">{t('Par type de billet')}</h2>
          <Button size="sm" variant="outline" onClick={() => exportCSV(byType.map((x) => ({ [t('Billet')]: x.name, [t('Vendus')]: x.sold, [t('Quota')]: x.quota, [t('Revenus')]: x.revenue })), `stats-${e.slug}`)}>
            {t('Exporter')}
          </Button>
        </div>
        <Table caption={t('Ventes par type de billet')} head={[t('Billet'), t('Vendus'), t('Remplissage'), t('Revenus')]}>
          {byType.map((x) => (
            <tr key={x.id}>
              <Td className="font-semibold">{x.name}</Td>
              <Td>{num(x.sold, lang)} / {num(x.quota, lang)}</Td>
              <Td><div className="w-40"><ProgressBar value={x.quota ? x.sold / x.quota : 0} label={x.name} /></div></Td>
              <Td className="font-bold">{moneyRaw(x.revenue, e.currency, lang)}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, Radio, ScanLine, Users } from 'lucide-react';
import { eventLive, type LiveEntries as Live } from '@/services/api';
import { useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { num, time } from '@/lib/format';
import { Card, Loading, PageHeader, ProgressBar, ProgressRing, StatCard } from '@/components/ui';
import NotFound from '../public/NotFound';

/** Relecture toutes les 5 s (pas de connexion permanente sur l'hébergeur) ; en pause quand l'onglet est caché. */
const EVERY = 5000;

/** Entrées en direct d'un événement : compteurs, rythme des 30 dernières minutes, billets, agents, dernières entrées. */
export default function LiveEntries() {
  const { id = '' } = useParams();
  const { t, lang } = useApp();
  const [data, setData] = useState<Live | null | undefined>(undefined);
  const [lost, setLost] = useState(false);
  const alive = useRef(true);
  useTitle(data ? t('En direct — {event}', { event: data.title }) : t('Entrées en direct'));

  const load = useCallback(async () => {
    const d = await eventLive(id);
    if (!alive.current) return;
    if (d) { setData(d); setLost(false); } else if (data === undefined) setData(null); else setLost(true);
  }, [id, data]);

  useEffect(() => {
    alive.current = true;
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, EVERY);
    const wake = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', wake);
    return () => { alive.current = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', wake); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (data === undefined) return <Loading />;
  if (!data) return <NotFound />;
  const pct = data.total ? data.entered / data.total : 0;
  const last30 = data.series.slice(-30);
  const peak = Math.max(1, ...last30.map((x) => x.n));

  return (
    <div className="space-y-6">
      <Link to={`/organisateur/checkin/${data.eventId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-ink-soft"><ArrowLeft className="h-4 w-4" aria-hidden /> {t('Contrôle d’entrée')}</Link>
      <PageHeader
        title={data.title}
        subtitle={
          <span className="inline-flex items-center gap-2" role="status">
            <Radio className={lost ? 'h-4 w-4 text-amber-600' : 'h-4 w-4 animate-pulse text-emerald-600'} aria-hidden />
            {lost ? t('Connexion perdue : dernier relevé à {time}', { time: time(data.at, lang) }) : t('En direct · mis à jour à {time}', { time: time(data.at, lang) })}
          </span>
        }
      />

      <Card className="flex flex-wrap items-center gap-6 p-6">
        <ProgressRing value={pct} size={120} stroke={12} track="rgb(var(--canvas))" label={t('{n} / {total} entrés', { n: data.entered, total: data.total })}>
          <span className="text-2xl font-extrabold">{Math.round(pct * 100)}%</span>
        </ProgressRing>
        <div>
          <p className="text-4xl font-extrabold tracking-tight" data-testid="live-entered">{num(data.entered, lang)} <span className="text-xl font-bold text-ink-muted">/ {num(data.total, lang)}</span></p>
          <p className="text-sm text-ink-soft">{t('personnes déjà entrées')}</p>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('5 dernières minutes')} value={num(data.last5, lang)} icon={<ScanLine className="h-[18px] w-[18px]" />} tone="green" />
        <StatCard label={t('15 dernières minutes')} value={num(data.last15, lang)} icon={<Clock className="h-[18px] w-[18px]" />} tone="orange" />
        <StatCard label={t('Pas encore entrés')} value={num(data.remaining, lang)} icon={<Users className="h-[18px] w-[18px]" />} />
        <StatCard label={t('Rythme moyen')} value={num(Math.round((data.last15 / 15) * 10) / 10, lang)} unit={t('par minute')} icon={<Radio className="h-[18px] w-[18px]" />} tone="violet" />
      </div>

      <Card className="p-6">
        <h2 className="font-bold">{t('Entrées par minute (30 dernières minutes)')}</h2>
        <div className="mt-4 flex h-32 items-end gap-0.5" role="img" aria-label={t('{n} entrées au total sur 30 minutes', { n: last30.reduce((a, x) => a + x.n, 0) })}>
          {last30.map((x) => (
            <div key={x.at} className="flex h-full flex-1 items-end" title={`${time(x.at, lang)} : ${x.n}`}>
              <div className="w-full rounded-t bg-brand transition-[height] duration-500" style={{ height: `${x.n ? Math.max(6, (x.n / peak) * 100) : 2}%`, opacity: x.n ? 1 : 0.25 }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-xs text-ink-muted"><span>{time(last30[0].at, lang)}</span><span>{time(last30[last30.length - 1].at, lang)}</span></div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-3 font-bold">{t('Par type de billet')}</h2>
          <ul className="space-y-3">
            {data.types.map((x) => (
              <li key={x.id}>
                <div className="mb-1 flex justify-between text-sm"><span className="font-semibold">{x.name}</span><span className="text-ink-soft">{x.entered} / {x.total}</span></div>
                <ProgressBar value={x.total ? x.entered / x.total : 0} label={`${x.name} : ${x.entered} / ${x.total}`} />
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-6">
          <h2 className="mb-3 font-bold">{t('Par agent de contrôle')}</h2>
          {data.agents.length ? (
            <ul className="divide-y divide-line">
              {data.agents.map((a) => (
                <li key={`${a.id}-${a.name}`} className="flex items-center justify-between gap-3 py-2 text-sm"><span className="truncate font-semibold">{a.name}</span><span className="shrink-0 text-ink-soft">{t('{n} scan(s)', { n: a.scans })}{a.last ? ` · ${time(a.last, lang)}` : ''}</span></li>
              ))}
            </ul>
          ) : <p className="text-sm text-ink-muted">{t('Aucune entrée pour l’instant.')}</p>}
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="mb-3 font-bold">{t('Dernières entrées')}</h2>
        {data.recent.length ? (
          <ul className="divide-y divide-line">
            {data.recent.map((r) => (
              <li key={`${r.at}-${r.name}`} className="flex items-center justify-between gap-3 py-2 text-sm"><span className="min-w-0 truncate"><b>{r.name}</b> <span className="text-ink-muted">· {r.type}</span></span><span className="shrink-0 text-ink-soft">{time(r.at, lang)}</span></li>
            ))}
          </ul>
        ) : <p className="text-sm text-ink-muted">{t('Aucune entrée pour l’instant.')}</p>}
      </Card>
    </div>
  );
}

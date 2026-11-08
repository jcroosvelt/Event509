import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownLeft, ArrowUpRight, BadgeCheck, Bell, Check, ChevronDown, Flag, Gavel, MoreVertical, Pencil, Plus, ShieldAlert,
  Ticket, Trash2, Undo2, Users, Wallet, X,
} from 'lucide-react';
import { events } from '@/data/mock';
import { listAudit, platformStats, removeTarget, saveTarget } from '@/services/api';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { compact, cx, dateLong, dateShort, moneyRaw, num, relative, time, uid } from '@/lib/format';
import { useForm } from '@/lib/form';
import { Button, Field, Input, Loading, Modal, Segmented, Select, Textarea } from '@/components/ui';
import type { Order, PlatformTarget } from '@/types';

/* ------------------------------------------------------------------------- *
 * Tableau de bord administrateur — style « portefeuille » : surfaces givrées,
 * cartes objectifs en dégradé avec anneau, barres jumelées, santé financière.
 * ------------------------------------------------------------------------- */

const glass = 'rounded-[1.75rem] bg-surface/85 shadow-card ring-1 ring-white/60 backdrop-blur-xl dark:ring-line';
const gradients = {
  brand: 'bg-[linear-gradient(140deg,#5B8CFF_0%,#1F5EFF_55%,#1745C9_100%)]',
  navy: 'bg-[linear-gradient(140deg,#24407F_0%,#13234F_50%,#0B1533_100%)]',
};

/** Icône portefeuille bicolore (reprend la pastille de la maquette, aux couleurs Event509). */
function WalletMark({ size = 44 }: { size?: number }) {
  return (
    <span aria-hidden className="relative grid shrink-0 place-items-center overflow-hidden rounded-2xl bg-navy" style={{ width: size, height: size }}>
      <span className="absolute -bottom-2 -left-2 h-2/3 w-2/3 rounded-full bg-brand" />
      <span className="absolute right-1.5 top-1.5 h-1/3 w-1/3 rounded-full bg-[#93B3FF]" />
    </span>
  );
}

/** Anneau de progression sur fond dégradé : piste translucide, centre blanc. */
function TargetRing({ value, size = 78, tone }: { value: number; size?: number; tone: 'brand' | 'navy' }) {
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${Math.round(v * 100)} %`}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.28)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={tone === 'brand' ? '#0B1533' : '#93B3FF'} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} className="transition-[stroke-dashoffset] duration-700" />
      </svg>
      <span aria-hidden className="absolute inset-[13px] grid place-items-center rounded-full bg-white text-sm font-extrabold text-navy">{Math.round(v * 100)}%</span>
    </div>
  );
}

type Target = PlatformTarget & { current: number };

function TargetCard({ tg, onOpen, className }: { tg: Target; onOpen: () => void; className?: string }) {
  const { t } = useApp();
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t('Objectif « {title} » : {n} % atteint', { title: tg.title, n: Math.round((tg.current / tg.target) * 100) })}
      className={cx('relative flex h-44 w-56 shrink-0 snap-start flex-col justify-between overflow-hidden rounded-[1.6rem] p-4 text-left text-white shadow-[0_18px_40px_-18px_rgba(11,21,51,.55)] transition hover:-translate-y-0.5', gradients[tg.tone], className)}
    >
      <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-white/10" />
      <span className="flex items-start justify-between gap-2">
        <span className="line-clamp-3 text-lg font-extrabold leading-tight">{tg.title}</span>
        <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/20"><MoreVertical className="h-4 w-4" /></span>
      </span>
      <span className="flex items-end justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-white/75">{dateShort(tg.deadline)}</span>
        <TargetRing value={tg.current / tg.target} tone={tg.tone} />
      </span>
    </button>
  );
}

/** Barres jumelées : ventes (bleu nuit) et remboursements (bleu clair), mois actif surligné. */
function PairedBars({ data, active, onSelect, label }: { data: { label: string; a: number; b: number }[]; active: number; onSelect: (i: number) => void; label: string }) {
  // Chaque série a sa propre échelle (les remboursements pèsent quelques % des ventes)
  const topA = Math.max(1, ...data.map((d) => d.a));
  const topB = Math.max(1, ...data.map((d) => d.b));
  const ticks = [1, 0.75, 0.5, 0.25];
  return (
    <div className="relative" role="group" aria-label={label}>
      <div aria-hidden className="absolute inset-x-0 top-0 h-48">
        {ticks.map((f) => <div key={f} className="absolute inset-x-0 border-t border-dashed border-line" style={{ top: `${(1 - f) * 100}%` }} />)}
      </div>
      <div className="relative flex h-48 items-end justify-between gap-1">
        {data.map((d, i) => (
          <button
            key={d.label}
            type="button"
            onClick={() => onSelect(i)}
            aria-pressed={i === active}
            aria-label={`${d.label}`}
            className={cx('flex h-full flex-1 items-end justify-center gap-1.5 rounded-2xl pb-1 pt-3 transition', i === active ? 'bg-brand-50' : 'hover:bg-canvas')}
          >
            <span className="w-2 origin-bottom rounded-full bg-contrast transition-transform duration-700" style={{ height: '100%', transform: `scaleY(${Math.max(0.03, d.a / topA)})` }} />
            <span className="w-2 origin-bottom rounded-full bg-brand-300 transition-transform duration-700" style={{ height: '100%', transform: `scaleY(${Math.max(0.03, d.b / topB)})` }} />
          </button>
        ))}
      </div>
      <div className="mt-2 flex justify-between gap-1">
        {data.map((d, i) => <span key={d.label} className={cx('flex-1 text-center text-xs capitalize', i === active ? 'font-bold text-ink' : 'text-ink-muted')}>{d.label}</span>)}
      </div>
    </div>
  );
}

const methodLabel: Record<Order['method'], string> = { card: 'Carte', moncash: 'MonCash', natcash: 'NatCash', paypal: 'PayPal', transfer: 'Virement' };

export default function Overview() {
  const { lang, t, toast } = useApp();
  useTitle(t('Vue d’ensemble'));
  const { data: s, loading, reload } = useAsync(() => platformStats(), []);
  const { data: activity } = useAsync(() => listAudit(), []);
  const [tab, setTab] = useState<'chart' | 'activity' | 'settings'>('chart');
  const [period, setPeriod] = useState<'6m' | 'month'>('6m');
  const [active, setActive] = useState(5);
  const [opened, setOpened] = useState<Target | null>(null);
  const [editing, setEditing] = useState<PlatformTarget | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Target | null>(null);
  const form = useForm(
    { title: '', metric: 'gmv', target: '', deadline: '', tone: 'brand', description: '' },
    {
      title: (v) => (!String(v).trim() ? t('Donnez un nom à l’objectif') : undefined),
      target: (v) => (!(Number(v) > 0) ? t('Indiquez une valeur cible supérieure à 0') : undefined),
      deadline: (v) => (!v ? t('Choisissez une échéance') : undefined),
    },
  );

  if (loading || !s) return <Loading />;
  const loc = lang === 'en' ? 'en-US' : 'fr-FR';
  const monthLabel = (m: string) => new Date(`${m}-01T12:00:00`).toLocaleDateString(loc, { month: 'short' }).replace('.', '');
  const balance = period === '6m' ? s.fees : s.feesThisMonth;
  const cur = s.monthly[active];
  const metricLabel: Record<PlatformTarget['metric'], string> = {
    gmv: t('Volume de ventes (6 mois, HTG)'), tickets: t('Billets vendus (7 jours)'), organizers: t('Organisateurs vérifiés'), users: t('Utilisateurs inscrits'),
  };
  const formatMetric = (m: PlatformTarget['metric'], v: number) => (m === 'gmv' ? moneyRaw(Math.round(v), 'HTG', lang) : num(v, lang));

  const openEditor = (tg?: PlatformTarget) => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    const base: PlatformTarget = tg ?? { id: uid('tg'), title: '', metric: 'tickets', target: 1000, deadline: d.toISOString().slice(0, 10), tone: 'brand' };
    form.reset({ title: base.title, metric: base.metric, target: String(base.target), deadline: base.deadline, tone: base.tone, description: base.description ?? '' });
    setOpened(null);
    setEditing(base);
  };
  const submitTarget = async () => {
    if (!editing || !form.validate()) return;
    const v = form.values;
    await saveTarget({ ...editing, title: v.title.trim(), metric: v.metric as PlatformTarget['metric'], target: Number(v.target), deadline: v.deadline, tone: v.tone as PlatformTarget['tone'], description: v.description.trim() || undefined });
    setEditing(null);
    toast(t('Objectif enregistré'));
    reload();
  };

  // Transactions récentes, groupées par jour
  const dayKey = (iso: string) => iso.slice(0, 10);
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86400000).toISOString());
  const groups = s.recent.reduce<Record<string, Order[]>>((acc, o) => {
    (acc[dayKey(o.createdAt)] ??= []).push(o);
    return acc;
  }, {});
  const healthCopy = {
    healthy: { title: t('Saine'), body: t('Remboursements et litiges sous les seuils d’alerte.') },
    watch: { title: t('À surveiller'), body: t('Le taux de remboursement ou le nombre de litiges augmente.') },
    critical: { title: t('Critique'), body: t('Remboursements ou litiges au-dessus des seuils : agissez rapidement.') },
  }[s.health as 'healthy' | 'watch' | 'critical'];

  const queue = [
    { to: '/admin/moderation', label: t('Événements à valider'), n: s.pendingEvents, icon: BadgeCheck },
    { to: '/admin/moderation?onglet=signalements', label: t('Signalements'), n: s.openReports, icon: Flag },
    { to: '/admin/verification', label: t('Vérifications'), n: s.pendingVerifications, icon: ShieldAlert },
    { to: '/admin/versements', label: t('Versements à valider'), n: s.pendingPayouts, icon: Wallet },
    { to: '/admin/litiges', label: t('Litiges ouverts'), n: s.openDisputes, icon: Gavel },
  ];

  return (
    // isolate + overflow-x-clip : le fond décoratif reste derrière le contenu sans élargir la page
    <div className="relative isolate overflow-x-clip">
      {/* Fond doux en dégradé, propre à ce tableau de bord */}
      <div aria-hidden className="pointer-events-none absolute -inset-x-10 -top-10 -z-10 h-[520px] bg-[radial-gradient(60%_60%_at_15%_10%,rgb(var(--brand-100))_0%,transparent_70%),radial-gradient(45%_50%_at_85%_0%,rgb(var(--brand-50))_0%,transparent_70%)]" />
      <h1 className="sr-only">{t('Vue d’ensemble')}</h1>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          {/* Portefeuille */}
          <section className={cx(glass, 'flex items-center gap-4 p-5')} aria-labelledby="wallet-label">
            <WalletMark />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 text-sm font-semibold text-ink-soft">
                <span id="wallet-label">{t('Commissions encaissées')}</span>
                <label className="relative">
                  <span className="sr-only">{t('Période')}</span>
                  <select value={period} onChange={(e) => setPeriod(e.target.value as '6m' | 'month')} className="cursor-pointer appearance-none bg-transparent pr-5 text-sm font-semibold text-ink-soft outline-none">
                    <option value="6m">{t('6 mois')}</option>
                    <option value="month">{t('ce mois')}</option>
                  </select>
                  <ChevronDown aria-hidden className="pointer-events-none absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2" />
                </label>
              </div>
              <div className="text-2xl font-extrabold tracking-tight sm:text-3xl">{moneyRaw(balance, 'HTG', lang)}</div>
            </div>
            <Link to="/admin/journal" aria-label={t('Journal d’activité')} className="relative grid h-11 w-11 place-items-center rounded-full bg-surface ring-1 ring-line">
              <Bell className="h-[18px] w-[18px]" aria-hidden />
              {activity && activity.length > 0 && <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-red-500" />}
            </Link>
          </section>

          {/* Objectifs */}
          <section aria-labelledby="h-targets">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="h-targets" className="text-lg font-bold">{t('Objectifs')}</h2>
              <button type="button" onClick={() => openEditor()} className="inline-flex h-8 items-center gap-1 rounded-full bg-navy px-3 text-xs font-bold text-white dark:ring-1 dark:ring-line">
                <Plus className="h-3.5 w-3.5" aria-hidden /> {t('Nouvel objectif')}
              </button>
            </div>
            <div className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
              {s.targets.map((tg: Target) => <TargetCard key={tg.id} tg={tg} onOpen={() => setOpened(tg)} />)}
              <button type="button" onClick={() => openEditor()} className={cx(glass, 'flex h-44 w-44 shrink-0 snap-start flex-col items-center justify-center gap-2 text-sm font-bold text-ink-soft hover:text-ink')}>
                <Plus className="h-6 w-6" aria-hidden /> {t('Ajouter un objectif')}
              </button>
            </div>
          </section>

          {/* Activité : graphique / journal / réglages */}
          <section className={cx(glass, 'p-5')} aria-labelledby="h-activity">
            <h2 id="h-activity" className="sr-only">{t('Activité de la plateforme')}</h2>
            <div role="tablist" aria-label={t('Activité de la plateforme')} className="mb-5 flex gap-6">
              {([['chart', t('Graphique')], ['activity', t('Activité')], ['settings', t('Réglages')]] as const).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={tab === k}
                  aria-controls={`panel-${k}`}
                  id={`tab-${k}`}
                  onClick={() => setTab(k)}
                  className={cx('relative pb-2 text-sm font-bold transition', tab === k ? 'text-ink' : 'text-ink-muted hover:text-ink')}
                >
                  {l}
                  {tab === k && <span aria-hidden className="absolute -bottom-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-brand" />}
                </button>
              ))}
            </div>

            {tab === 'chart' && (
              <div role="tabpanel" id="panel-chart" aria-labelledby="tab-chart">
                <div className="rounded-3xl bg-canvas/70 p-4 sm:p-5">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold">{t('Ventes et remboursements')}</h3>
                      <p className="text-sm text-ink-muted">{t('6 derniers mois')}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-semibold uppercase text-ink-muted first-letter:uppercase">{monthLabel(cur.month)}</div>
                      <div className="text-lg font-extrabold">{compact(cur.sales, lang)} <span className="text-sm font-medium text-ink-muted">HTG</span></div>
                      <div className="text-xs text-ink-muted">{t('{n} billets', { n: num(cur.tickets, lang) })} · {t('remb. {n}', { n: compact(cur.refunds, lang) })}</div>
                    </div>
                  </div>
                  <PairedBars
                    label={t('Ventes et remboursements par mois')}
                    data={s.monthly.map((m) => ({ label: monthLabel(m.month), a: m.sales, b: m.refunds }))}
                    active={active}
                    onSelect={setActive}
                  />
                  <div className="mt-4 flex justify-center gap-6 text-xs text-ink-soft">
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-contrast" /> {t('Ventes')}</span>
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand-300" /> {t('Remboursements (échelle séparée)')}</span>
                  </div>
                </div>
              </div>
            )}

            {tab === 'activity' && (
              <div role="tabpanel" id="panel-activity" aria-labelledby="tab-activity">
                <ul className="divide-y divide-line">
                  {(activity ?? []).slice(0, 8).map((a) => (
                    <li key={a.id} className="flex items-center gap-3 py-3 text-sm">
                      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-brand" />
                      <span className="min-w-0 flex-1"><b>{t(a.action)}</b> <span className="text-ink-soft">· {a.target}</span></span>
                      <span className="shrink-0 text-xs text-ink-muted">{relative(a.at, lang)}</span>
                    </li>
                  ))}
                </ul>
                <Link to="/admin/journal" className="mt-2 inline-block text-sm font-semibold text-brand-ink">{t('Voir tout le journal')}</Link>
              </div>
            )}

            {tab === 'settings' && (
              <div role="tabpanel" id="panel-settings" aria-labelledby="tab-settings" className="grid gap-3 sm:grid-cols-2">
                {[
                  { to: '/admin/commissions', l: t('Commissions et frais'), d: t('Taux par défaut, frais fixes, taux négociés') },
                  { to: '/admin/verification', l: t('Vérification des organisateurs'), d: t('Pièces justificatives et badge vérifié') },
                  { to: '/admin/utilisateurs', l: t('Utilisateurs'), d: t('Rôles, suspension, fiches détaillées') },
                  { to: '/admin/transactions', l: t('Transactions'), d: t('Toutes les commandes et exports CSV') },
                ].map((x) => (
                  <Link key={x.to} to={x.to} className="rounded-2xl bg-canvas p-4 hover:bg-brand-50">
                    <div className="font-bold">{x.l}</div>
                    <div className="text-sm text-ink-soft">{x.d}</div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Santé financière */}
          <section
            aria-label={t('Santé financière')}
            className={cx('flex items-center gap-4 rounded-[1.75rem] p-5 text-white shadow-[0_18px_40px_-18px_rgba(31,94,255,.6)]', s.health === 'critical' ? 'bg-[linear-gradient(140deg,#E5484D_0%,#B42318_100%)]' : s.health === 'watch' ? gradients.navy : gradients.brand)}
          >
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-white/75">{t('Santé financière')}</div>
              <div className="text-2xl font-extrabold">{healthCopy.title}</div>
              <p className="mt-0.5 text-sm text-white/85">
                {healthCopy.body} {t('Remboursements : {n} %', { n: (s.refundRate * 100).toFixed(1) })} · {t('Litiges ouverts : {n}', { n: s.openDisputes })}
              </p>
            </div>
            <span aria-hidden className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/90 text-navy shadow-lg">
              {s.health === 'critical' ? <X className="h-7 w-7" strokeWidth={3} /> : <Check className="h-7 w-7" strokeWidth={3} />}
            </span>
          </section>

          {/* Indicateurs */}
          <section aria-label={t('Indicateurs')} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { l: t('Volume de ventes (6 mois)'), v: compact(s.gmv, lang), u: 'HTG', i: Wallet },
              { l: t('Billets (7 jours)'), v: num(s.ticketsWeek, lang), i: Ticket },
              { l: t('Utilisateurs'), v: num(s.users, lang), u: t('+{n} ce mois', { n: s.newUsersMonth }), i: Users },
              { l: t('Événements actifs'), v: num(s.activeEvents, lang), i: BadgeCheck },
            ].map((k) => (
              <div key={k.l} className={cx(glass, 'p-4')}>
                <div className="flex items-start justify-between gap-2 text-sm font-medium text-ink-soft">
                  {k.l}
                  <k.i aria-hidden className="h-4 w-4 shrink-0 text-brand-ink" />
                </div>
                <div className="mt-3 text-2xl font-extrabold tracking-tight">{k.v}</div>
                {k.u && <div className="text-xs text-ink-muted">{k.u}</div>}
              </div>
            ))}
          </section>
          {/* Répartitions */}
          <section className="grid gap-6 md:grid-cols-2" aria-label={t('Répartition des ventes')}>
            <div className={cx(glass, 'p-5')}>
            <h2 className="mb-4 font-bold">{t('Moyens de paiement')}</h2>
            <ul className="space-y-3">
              {s.byMethod.map((m) => (
                <li key={m.label}>
                  <div className="mb-1 flex justify-between text-sm"><span className="font-medium">{t(methodLabel[m.label as Order['method']])}</span><span className="text-ink-muted">{Math.round(m.share * 100)} %</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-canvas" role="progressbar" aria-valuenow={Math.round(m.share * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={t(methodLabel[m.label as Order['method']])}>
                    <div className="h-full w-full origin-left rounded-full bg-brand transition-transform duration-700" style={{ transform: `scaleX(${m.share})` }} />
                  </div>
                </li>
              ))}
            </ul>
            </div>
            <div className={cx(glass, 'p-5')}>
            <h2 className="mb-4 font-bold">{t('Ventes par ville')}</h2>
            <ul className="space-y-3">
              {s.byCity.slice(0, 5).map((c) => (
                <li key={c.label}>
                  <div className="mb-1 flex justify-between text-sm"><span className="font-medium">{c.label === 'En ligne' ? t('En ligne') : c.label}</span><span className="text-ink-muted">{Math.round(c.share * 100)} %</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-canvas" role="progressbar" aria-valuenow={Math.round(c.share * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={c.label}>
                    <div className="h-full w-full origin-left rounded-full bg-contrast transition-transform duration-700" style={{ transform: `scaleX(${c.share})` }} />
                  </div>
                </li>
              ))}
            </ul>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          {/* À traiter */}
          <section className={cx(glass, 'p-5')} aria-labelledby="h-queue">
            <h2 id="h-queue" className="mb-3 font-bold">{t('À traiter')}</h2>
            <ul className="space-y-1">
              {queue.map((q) => (
                <li key={q.to}>
                  <Link to={q.to} className="flex items-center gap-3 rounded-2xl p-2 hover:bg-canvas">
                    <span aria-hidden className={cx('grid h-10 w-10 place-items-center rounded-xl', q.n ? 'bg-brand-100 text-brand-ink' : 'bg-canvas text-ink-muted')}><q.icon className="h-[18px] w-[18px]" /></span>
                    <span className="flex-1 text-sm font-semibold">{q.label}</span>
                    <span className={cx('min-w-[2rem] rounded-full px-2 py-0.5 text-center text-xs font-bold', q.n ? 'bg-navy text-white dark:bg-brand' : 'bg-canvas text-ink-muted')}>{q.n}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {/* Transactions récentes */}
          <section className={cx(glass, 'p-5')} aria-labelledby="h-recent">
            <div className="mb-2 flex items-center justify-between">
              <h2 id="h-recent" className="font-bold">{t('Transactions récentes')}</h2>
              <Link to="/admin/transactions" className="text-sm font-semibold text-brand-ink">{t('Tout voir')}</Link>
            </div>
            {Object.entries(groups).map(([day, list]) => (
              <div key={day} className="mt-3">
                <h3 className="mb-1 text-xs font-semibold text-ink-muted first-letter:uppercase">{day === today ? t('Aujourd’hui') : day === yesterday ? t('Hier') : dateLong(`${day}T12:00:00`, lang)}</h3>
                <ul>
                  {list.map((o) => {
                    const ev = events.find((e) => e.id === o.eventId);
                    const refund = o.status === 'refunded' || o.status === 'partially_refunded';
                    return (
                      <li key={o.id} className="flex items-center gap-3 py-2">
                        <span aria-hidden className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-xl', refund ? 'bg-rose-50 text-rose-700' : 'bg-brand-100 text-brand-ink')}>
                          {refund ? <Undo2 className="h-[18px] w-[18px]" /> : <Ticket className="h-[18px] w-[18px]" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold">{ev?.title}</div>
                          <div className="truncate text-xs text-ink-muted">{o.buyerName} · {t(methodLabel[o.method])}</div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className={cx('flex items-center justify-end gap-0.5 text-sm font-extrabold', refund ? 'text-rose-700' : 'text-emerald-700')}>
                            {refund ? <ArrowDownLeft className="h-3.5 w-3.5" aria-hidden /> : <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />}
                            <span className="sr-only">{refund ? t('Remboursement') : t('Vente')}</span>
                            {refund ? '−' : '+'} {moneyRaw(o.total, o.currency, lang)}
                          </div>
                          <div className="text-[11px] text-ink-muted">{time(o.createdAt, lang)}</div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>

        </div>
      </div>

      {/* Fiche d'un objectif (comme la carte dépliée de la maquette) */}
      <Modal open={!!opened} onClose={() => setOpened(null)} title={opened?.title ?? ''} size="sm">
        {opened && (
          <div className={cx('-mx-6 -mb-6 -mt-2 rounded-b-4xl p-6 text-white', gradients[opened.tone])}>
            <div className="mb-4 flex justify-end">
              <div className="flex items-center gap-1 rounded-full bg-white/20 p-1">
                <button type="button" aria-label={t('Modifier l’objectif')} onClick={() => openEditor(opened)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/20"><Pencil className="h-4 w-4" aria-hidden /></button>
                <button type="button" aria-label={t('Supprimer l’objectif')} onClick={() => { setConfirmDelete(opened); setOpened(null); }} className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/20"><Trash2 className="h-4 w-4" aria-hidden /></button>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <dl className="min-w-0 flex-1 space-y-3 text-sm">
                {opened.description && (<div><dt className="text-white/70">{t('Description')}</dt><dd className="font-semibold">{opened.description}</dd></div>)}
                <div><dt className="text-white/70">{metricLabel[opened.metric]}</dt><dd className="font-semibold">{formatMetric(opened.metric, opened.current)} / {formatMetric(opened.metric, opened.target)}</dd></div>
                <div><dt className="text-white/70">{t('Échéance')}</dt><dd className="font-semibold first-letter:uppercase">{dateLong(`${opened.deadline}T12:00:00`, lang)}</dd></div>
              </dl>
              <TargetRing value={opened.current / opened.target} size={104} tone={opened.tone} />
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.title ? t('Modifier l’objectif') : t('Nouvel objectif')} footer={<Button className="flex-1" onClick={submitTarget}>{t('Enregistrer')}</Button>}>
        <form noValidate onSubmit={(e) => { e.preventDefault(); submitTarget(); }} className="space-y-4">
          <Field label={t('Nom')} error={form.errors.title} required><Input placeholder={t('Ex. 1 000 billets en décembre')} {...form.bind('title')} /></Field>
          <Field label={t('Indicateur suivi')}>
            <Select {...form.bind('metric')}>
              {(Object.keys(metricLabel) as PlatformTarget['metric'][]).map((m) => <option key={m} value={m}>{metricLabel[m]}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('Valeur cible')} error={form.errors.target} required><Input type="number" inputMode="numeric" min={1} {...form.bind('target')} /></Field>
            <Field label={t('Échéance')} error={form.errors.deadline} required><Input type="date" {...form.bind('deadline')} /></Field>
          </div>
          <div>
            <span className="mb-1.5 block text-sm font-semibold">{t('Couleur')}</span>
            <Segmented label={t('Couleur')} value={form.values.tone} onChange={(v) => form.set('tone', v)} options={[{ value: 'brand', label: t('Bleu') }, { value: 'navy', label: t('Bleu nuit') }]} />
          </div>
          <Field label={t('Description')} hint={t('Optionnel')}><Textarea className="min-h-[80px]" {...form.bind('description')} /></Field>
        </form>
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={t('Supprimer l’objectif « {title} » ?', { title: confirmDelete?.title ?? '' })}
        size="sm"
        footer={
          <>
            <Button variant="ghost" className="flex-1" onClick={() => setConfirmDelete(null)}>{t('Annuler')}</Button>
            <Button variant="danger" className="flex-1" onClick={async () => { await removeTarget(confirmDelete!.id); setConfirmDelete(null); toast(t('Objectif supprimé')); reload(); }}>{t('Supprimer l’objectif')}</Button>
          </>
        }
      >
        <span />
      </Modal>
    </div>
  );
}

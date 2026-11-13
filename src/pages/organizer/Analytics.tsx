import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, FileText, Lock } from 'lucide-react';
import { categories } from '@/data/mock';
import { DEMO } from '@/services/api';
import { getAnalytics, type Analytics } from '@/services/premium';
import { ApiError } from '@/lib/errors';
import { exportExcel } from '@/lib/export';
import { printReport } from '@/lib/printReport';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { dateShort, moneyRaw, num } from '@/lib/format';
import { Button, Card, EmptyState, Field, Input, Loading, PageHeader, Select, StatCard, Table, Td } from '@/components/ui';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const ago = (n: number) => iso(new Date(Date.now() - n * 86_400_000));

/** Barres horizontales simples (valeur ou part), lisibles sans couleur seule : le chiffre est toujours écrit. */
function Bars({ rows }: { rows: { label: string; value: number; text: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex justify-between text-sm"><span className="font-semibold">{r.label}</span><span className="text-ink-soft">{r.text}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-canvas" aria-hidden><div className="h-full rounded-full bg-brand" style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

/** Évolution des ventes : une barre par jour (regroupées par semaine au-delà de 60 jours) avec un tableau pour les lecteurs d'écran. */
function SalesChart({ data, lang }: { data: Analytics['series']; lang: 'fr' | 'en' }) {
  const { t } = useApp();
  const step = data.length > 60 ? 7 : 1;
  const pts = useMemo(() => {
    const out: { day: string; tickets: number; revenue: number }[] = [];
    for (let i = 0; i < data.length; i += step) {
      const slice = data.slice(i, i + step);
      out.push({ day: slice[0]!.day, tickets: slice.reduce((a, x) => a + x.tickets, 0), revenue: slice.reduce((a, x) => a + x.revenue, 0) });
    }
    return out;
  }, [data, step]);
  const max = Math.max(1, ...pts.map((p) => p.revenue));
  return (
    <figure>
      <div className="flex h-40 items-end gap-px" role="img" aria-label={t('Évolution des ventes')}>
        {pts.map((p) => <div key={p.day} title={`${dateShort(p.day, lang)} — ${moneyRaw(p.revenue, 'HTG', lang)} · ${p.tickets}`} className="min-w-[2px] flex-1 rounded-t bg-brand/80" style={{ height: `${Math.max(2, (p.revenue / max) * 100)}%` }} />)}
      </div>
      <figcaption className="mt-2 flex justify-between text-xs text-ink-muted"><span>{dateShort(pts[0]!.day, lang)}</span><span>{dateShort(pts[pts.length - 1]!.day, lang)}</span></figcaption>
      <table className="sr-only"><caption>{t('Évolution des ventes')}</caption><thead><tr><th>{t('Date')}</th><th>{t('Billets')}</th><th>{t('Chiffre d’affaires')}</th></tr></thead>
        <tbody>{pts.filter((p) => p.tickets > 0).map((p) => <tr key={p.day}><td>{p.day}</td><td>{p.tickets}</td><td>{p.revenue}</td></tr>)}</tbody></table>
    </figure>
  );
}

export default function AnalyticsPage() {
  const { t, lang, toast } = useApp();
  useTitle(t('Statistiques avancées'));
  const [from, setFrom] = useState(ago(89));
  const [to, setTo] = useState(iso(new Date()));
  const [preset, setPreset] = useState('90');
  const [picked, setPicked] = useState<string[]>([]);
  const q = useAsync(() => (DEMO ? Promise.resolve(null) : getAnalytics(from, to)), [from, to]);

  if (DEMO) return <EmptyState icon={<Lock className="h-5 w-5" />} title={t('Programme disponible sur le site en ligne')} body={t('Les statistiques avancées nécessitent le serveur.')} />;
  if (q.error instanceof ApiError && q.error.status === 403)
    return (
      <EmptyState icon={<Lock className="h-5 w-5" />} title={t('Réservé aux organisateurs vérifiés')} body={t('Chiffre d’affaires, conversion, provenance des ventes, comparaison d’événements et exports PDF et Excel.')}
        action={<Link to="/organisateur-verifie" className="font-semibold text-brand-ink">{t('Découvrir le programme')}</Link>} />
    );
  if (!q.data) return q.error ? <EmptyState icon={<Lock className="h-5 w-5" />} title={t('Chargement impossible')} body={t('Vérifiez votre connexion puis rechargez la page.')} /> : <Loading />;
  const a = q.data;
  const label = (id: string) => t(categories.find((c) => c.id === id)?.label ?? 'Autre');
  const srcLabel = (k: string) => (k === 'ambassador' ? t('Ambassadeurs') : k === 'promo' ? t('Codes promo') : k === 'link' ? t('Liens de suivi') : t('Direct'));
  const compared = a.events.filter((e) => picked.includes(e.id));
  const setPresetDays = (v: string) => { setPreset(v); if (v !== 'custom') { setFrom(ago(Number(v) - 1)); setTo(iso(new Date())); } };
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 4 ? [...p, id] : p));

  const eventRows = a.events.map((e) => ({
    [t('Événement')]: e.title, [t('Date')]: e.start.slice(0, 10), [t('Chiffre d’affaires (HTG)')]: e.revenue, [t('Billets vendus (période)')]: e.ticketsInPeriod, [t('Commandes')]: e.orders,
    [t('Billets vendus (total)')]: e.sold, [t('Billets restants')]: e.remaining, [t('Vues')]: e.views, [t('Conversion (%)')]: e.conversion,
  }));
  const exportXls = () => exportExcel(eventRows, `statistiques-${a.range.from}-${a.range.to}`, t('Statistiques'));
  const exportPdf = () => {
    try {
      printReport(t('Statistiques'), `${a.range.from} → ${a.range.to}`, [
        { title: t('Synthèse'), head: [t('Indicateur'), t('Valeur')], rows: [
          [t('Chiffre d’affaires'), moneyRaw(a.totals.revenue, 'HTG', lang)], [t('Billets vendus'), a.totals.tickets], [t('Commandes'), a.totals.orders],
          [t('Billets restants'), a.inventory.remaining], [t('Panier moyen'), moneyRaw(a.totals.averageOrder, 'HTG', lang)],
        ] },
        { title: t('Performance par événement'), head: [t('Événement'), t('Chiffre d’affaires'), t('Billets'), t('Restants'), t('Conversion')], rows: a.events.map((e) => [e.title, moneyRaw(e.revenue, 'HTG', lang), e.ticketsInPeriod, e.remaining, `${e.conversion} %`]) },
        { title: t('Provenance des ventes'), head: [t('Source'), t('Commandes'), t('Chiffre d’affaires')], rows: a.sources.map((s) => [srcLabel(s.key), s.orders, moneyRaw(s.revenue, 'HTG', lang)]) },
      ], lang);
    } catch {
      toast(t('Le rapport n’a pas pu s’ouvrir. Autorisez les fenêtres pop-up.'), 'error');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('Statistiques avancées')} subtitle={t('Chiffres agrégés : aucune donnée personnelle d’acheteur n’est affichée.')}
        actions={<div className="flex gap-2"><Button variant="outline" size="sm" onClick={exportXls}><Download className="h-4 w-4" aria-hidden /> Excel</Button><Button variant="outline" size="sm" onClick={exportPdf}><FileText className="h-4 w-4" aria-hidden /> PDF</Button></div>} />

      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('Période')}>
          <Select value={preset} onChange={(e) => setPresetDays(e.target.value)}>
            <option value="30">{t('30 derniers jours')}</option><option value="90">{t('90 derniers jours')}</option><option value="365">{t('12 derniers mois')}</option><option value="custom">{t('Personnalisée')}</option>
          </Select>
        </Field>
        {preset === 'custom' && <>
          <Field label={t('Du')}><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label={t('Au')}><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
        </>}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('Chiffre d’affaires')} value={moneyRaw(a.totals.revenue, 'HTG', lang)} tone="green" />
        <StatCard label={t('Billets vendus')} value={num(a.totals.tickets, lang)} />
        <StatCard label={t('Billets restants')} value={num(a.inventory.remaining, lang)} hint={t('sur {n} de capacité', { n: num(a.inventory.capacity, lang) })} tone="orange" />
        <StatCard label={t('Panier moyen')} value={moneyRaw(a.totals.averageOrder, 'HTG', lang)} tone="violet" />
      </div>

      <Card><h2 className="mb-3 font-bold">{t('Évolution des ventes')}</h2>{a.totals.orders ? <SalesChart data={a.series} lang={lang} /> : <p className="text-sm text-ink-muted">{t('Aucune vente sur cette période.')}</p>}</Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><h2 className="mb-3 font-bold">{t('Ventes par catégorie')}</h2>
          {a.categories.some((c) => c.revenue > 0) ? <Bars rows={a.categories.filter((c) => c.revenue > 0).map((c) => ({ label: label(c.id), value: c.revenue, text: moneyRaw(c.revenue, 'HTG', lang) }))} /> : <p className="text-sm text-ink-muted">{t('Aucune vente sur cette période.')}</p>}</Card>
        <Card><h2 className="mb-3 font-bold">{t('Provenance des ventes')}</h2>
          {a.sources.length ? <Bars rows={a.sources.map((s) => ({ label: srcLabel(s.key), value: s.orders, text: `${s.orders} · ${moneyRaw(s.revenue, 'HTG', lang)}` }))} /> : <p className="text-sm text-ink-muted">{t('Aucune vente sur cette période.')}</p>}</Card>
      </div>

      <section aria-labelledby="h-perf">
        <h2 id="h-perf" className="mb-1 text-lg font-extrabold">{t('Performance par événement')}</h2>
        <p className="mb-3 text-sm text-ink-muted">{t('Cochez jusqu’à 4 événements pour les comparer.')}</p>
        <Card className="!p-0 overflow-hidden">
          <Table caption={t('Performance par événement')} head={['', t('Événement'), t('Chiffre d’affaires'), t('Billets'), t('Restants'), t('Vues'), t('Conversion')]}>
            {a.events.map((e) => (
              <tr key={e.id}>
                <Td><input type="checkbox" className="h-4 w-4" checked={picked.includes(e.id)} onChange={() => toggle(e.id)} aria-label={t('Comparer {title}', { title: e.title })} /></Td>
                <Td className="max-w-[240px] truncate font-semibold">{e.title}</Td>
                <Td>{moneyRaw(e.revenue, 'HTG', lang)}</Td><Td>{e.ticketsInPeriod}</Td><Td>{e.remaining}</Td><Td>{num(e.views, lang)}</Td><Td>{e.conversion} %</Td>
              </tr>
            ))}
          </Table>
        </Card>
      </section>

      {compared.length >= 2 && (
        <Card>
          <h2 className="mb-3 font-bold">{t('Comparaison')}</h2>
          <Table caption={t('Comparaison')} head={[t('Indicateur'), ...compared.map((e) => e.title)]}>
            {([[t('Chiffre d’affaires'), (e) => moneyRaw(e.revenue, 'HTG', lang)], [t('Billets vendus (période)'), (e) => e.ticketsInPeriod], [t('Billets restants'), (e) => e.remaining],
              [t('Taux de remplissage'), (e) => `${e.quota ? Math.round((e.sold / e.quota) * 100) : 0} %`], [t('Conversion'), (e) => `${e.conversion} %`]] as [string, (e: Analytics['events'][number]) => string | number][]).map(([k, f]) => (
              <tr key={k}><Td className="font-semibold">{k}</Td>{compared.map((e) => <Td key={e.id}>{f(e)}</Td>)}</tr>
            ))}
          </Table>
        </Card>
      )}

      {a.campaigns.length > 0 && (
        <Card>
          <h2 className="mb-3 font-bold">{t('Campagnes promotionnelles')}</h2>
          <Table caption={t('Campagnes promotionnelles')} head={[t('Campagne'), t('Canal'), t('Envois'), t('Ouvertures'), t('Clics')]}>
            {a.campaigns.map((k) => <tr key={k.id}><Td className="font-semibold">{k.name}</Td><Td>{k.channel}</Td><Td>{k.sent}</Td><Td>{k.opened}</Td><Td>{k.clicks}</Td></tr>)}
          </Table>
        </Card>
      )}
    </div>
  );
}

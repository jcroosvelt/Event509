import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, FileText, Lock } from 'lucide-react';
import { DEMO } from '@/services/api';
import { getFinance } from '@/services/premium';
import { ApiError } from '@/lib/errors';
import { exportCSV, exportExcel } from '@/lib/export';
import { printReport } from '@/lib/printReport';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { dateShort, moneyRaw } from '@/lib/format';
import { Badge, Button, Card, EmptyState, Field, Loading, PageHeader, Select, StatCard, Table, Td, type Tone } from '@/components/ui';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const ago = (n: number) => iso(new Date(Date.now() - n * 86_400_000));
const orderStatus: Record<string, { l: string; tone: Tone }> = {
  paid: { l: 'Payée', tone: 'green' }, pending: { l: 'En attente', tone: 'amber' }, partially_refunded: { l: 'Remb. partiel', tone: 'violet' }, refunded: { l: 'Remboursée', tone: 'gray' },
};
const payoutStatus: Record<string, { l: string; tone: Tone }> = {
  requested: { l: 'En attente de validation', tone: 'gray' }, rejected: { l: 'Refusé', tone: 'red' }, paid: { l: 'Versé', tone: 'green' }, processing: { l: 'En cours', tone: 'amber' }, scheduled: { l: 'Programmé', tone: 'brand' },
};
const methodLabel: Record<string, string> = { card: 'Carte', moncash: 'MonCash', natcash: 'NatCash', kashpaw: 'KashPaw', paypal: 'PayPal', transfer: 'Virement' };

/** Espace financier : revenus, commissions, paiements en attente, transactions, retraits et rapports exportables. */
export default function Finances() {
  const { t, lang, toast } = useApp();
  useTitle(t('Finances'));
  const [preset, setPreset] = useState('365');
  const [more, setMore] = useState(50);
  const from = ago(Number(preset) - 1);
  const to = iso(new Date());
  const q = useAsync(() => (DEMO ? Promise.resolve(null) : getFinance(from, to)), [preset]);
  if (DEMO) return <EmptyState icon={<Lock className="h-5 w-5" />} title={t('Programme disponible sur le site en ligne')} body={t('L’espace financier avancé nécessite le serveur.')} />;
  if (q.error instanceof ApiError && q.error.status === 403)
    return <EmptyState icon={<Lock className="h-5 w-5" />} title={t('Réservé aux organisateurs vérifiés')} body={t('Revenus, commissions, paiements en attente, historique des retraits et rapports exportables.')} action={<Link to="/organisateur-verifie" className="font-semibold text-brand-ink">{t('Découvrir le programme')}</Link>} />;
  if (!q.data) return <Loading />;
  const d = q.data;
  const max = Math.max(1, ...d.monthly.map((m) => m.gross));
  const month = (m: string) => new Date(`${m}-15T00:00:00Z`).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });

  const txRows = d.transactions.map((x) => ({
    [t('Commande')]: x.id, [t('Date')]: x.date.slice(0, 10), [t('Événement')]: x.event, [t('Méthode')]: methodLabel[x.method] ?? x.method, [t('Statut')]: t(orderStatus[x.status]?.l ?? x.status),
    [t('Devise')]: x.currency, [t('Montant')]: x.amount, [t('Commission')]: x.fee, [t('Total payé')]: x.total, [t('Billets')]: x.tickets,
  }));
  const reportName = `finances-${d.range.from}-${d.range.to}`;
  const pdf = () => {
    try {
      printReport(t('Rapport financier'), `${d.range.from} → ${d.range.to}`, [
        { title: t('Synthèse'), head: [t('Indicateur'), t('Valeur')], rows: [
          [t('Chiffre d’affaires'), moneyRaw(d.summary.gross, 'HTG', lang)], [t('Commissions de la plateforme'), moneyRaw(d.summary.fees, 'HTG', lang)], [t('Remboursements'), moneyRaw(d.summary.refunds, 'HTG', lang)],
          [t('Net estimé'), moneyRaw(d.summary.net, 'HTG', lang)], [t('Paiements en attente'), moneyRaw(d.summary.pendingAmount, 'HTG', lang)],
          [t('Solde disponible (HTG)'), moneyRaw(d.balance.HTG, 'HTG', lang)], [t('Solde disponible (USD)'), moneyRaw(d.balance.USD, 'USD', lang)],
        ] },
        { title: t('Revenus par mois'), head: [t('Mois'), t('Chiffre d’affaires'), t('Commandes')], rows: d.monthly.map((m) => [month(m.month), moneyRaw(m.gross, 'HTG', lang), m.orders]) },
        { title: t('Retraits'), head: [t('Référence'), t('Date'), t('Montant'), t('Statut')], rows: d.payouts.map((p) => [p.reference, p.date, moneyRaw(p.amount, p.currency, lang), t(payoutStatus[p.status]?.l ?? p.status)]) },
      ], lang);
    } catch {
      toast(t('Le rapport n’a pas pu s’ouvrir. Autorisez les fenêtres pop-up.'), 'error');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('Finances')} subtitle={t('Revenus, commissions, transactions et retraits. Aucune donnée personnelle d’acheteur.')}
        actions={<div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => exportCSV(txRows, reportName)}><Download className="h-4 w-4" aria-hidden /> CSV</Button>
          <Button variant="outline" size="sm" onClick={() => exportExcel(txRows, reportName, t('Transactions'))}><Download className="h-4 w-4" aria-hidden /> Excel</Button>
          <Button variant="outline" size="sm" onClick={pdf}><FileText className="h-4 w-4" aria-hidden /> PDF</Button>
        </div>} />
      <div className="max-w-xs">
        <Field label={t('Période')}>
          <Select value={preset} onChange={(e) => { setPreset(e.target.value); setMore(50); }}>
            <option value="30">{t('30 derniers jours')}</option><option value="90">{t('90 derniers jours')}</option><option value="365">{t('12 derniers mois')}</option>
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('Chiffre d’affaires')} value={moneyRaw(d.summary.gross, 'HTG', lang)} tone="green" />
        <StatCard label={t('Commissions de la plateforme')} value={moneyRaw(d.summary.fees, 'HTG', lang)} tone="violet" hint={t('Dont {a} payés par les acheteurs et {b} par vous', { a: moneyRaw(d.summary.buyerFees, 'HTG', lang), b: moneyRaw(d.summary.organizerFees, 'HTG', lang) })} />
        <StatCard label={t('Paiements en attente')} value={moneyRaw(d.summary.pendingAmount, 'HTG', lang)} tone="amber" hint={t('{n} commande(s)', { n: d.summary.pendingOrders })} />
        <StatCard label={t('Solde disponible')} value={moneyRaw(d.balance.HTG, 'HTG', lang)} hint={d.balance.USD > 0 ? moneyRaw(d.balance.USD, 'USD', lang) : undefined} />
      </div>

      <Card>
        <h2 className="mb-3 font-bold">{t('Revenus par mois')}</h2>
        {!d.monthly.length ? <p className="text-sm text-ink-muted">{t('Aucune vente sur cette période.')}</p> : (
          <ul className="space-y-2">
            {d.monthly.map((m) => (
              <li key={m.month}>
                <div className="mb-1 flex justify-between text-sm"><span className="font-semibold capitalize">{month(m.month)}</span><span className="text-ink-soft">{moneyRaw(m.gross, 'HTG', lang)} · {m.orders}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-canvas" aria-hidden><div className="h-full rounded-full bg-brand" style={{ width: `${(m.gross / max) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <section aria-labelledby="h-py">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="h-py" className="text-lg font-extrabold">{t('Retraits')}</h2>
          <Link to="/organisateur/versements" className="text-sm font-semibold text-brand-ink">{t('Demander un versement')}</Link>
        </div>
        {!d.payouts.length ? <p className="text-sm text-ink-muted">{t('Aucun retrait pour le moment.')}</p> : (
          <Card className="!p-0 overflow-hidden">
            <Table caption={t('Retraits')} head={[t('Référence'), t('Date'), t('Méthode'), t('Montant'), t('Statut')]}>
              {d.payouts.map((p) => (
                <tr key={p.id}>
                  <Td className="font-mono text-xs">{p.reference}{p.priority && <Badge tone="violet" className="ml-2">{t('Prioritaire')}</Badge>}</Td>
                  <Td>{dateShort(p.date, lang)}</Td><Td>{methodLabel[p.method] ?? p.method}</Td><Td className="font-bold">{moneyRaw(p.amount, p.currency, lang)}</Td>
                  <Td><Badge tone={payoutStatus[p.status]?.tone ?? 'gray'}>{t(payoutStatus[p.status]?.l ?? p.status)}</Badge></Td>
                </tr>
              ))}
            </Table>
          </Card>
        )}
      </section>

      <section aria-labelledby="h-tx">
        <h2 id="h-tx" className="mb-3 text-lg font-extrabold">{t('Historique des transactions')}</h2>
        {!d.transactions.length ? <p className="text-sm text-ink-muted">{t('Aucune vente sur cette période.')}</p> : (
          <Card className="!p-0 overflow-hidden">
            <Table caption={t('Historique des transactions')} head={[t('Commande'), t('Date'), t('Événement'), t('Méthode'), t('Montant'), t('Commission'), t('Statut')]}>
              {d.transactions.slice(0, more).map((x) => (
                <tr key={x.id}>
                  <Td className="font-mono text-xs">{x.id}</Td><Td>{dateShort(x.date, lang)}</Td><Td className="max-w-[200px] truncate">{x.event}</Td><Td>{methodLabel[x.method] ?? x.method}</Td>
                  <Td className="font-bold">{moneyRaw(x.amount, x.currency, lang)}</Td><Td>{moneyRaw(x.fee, x.currency, lang)}</Td>
                  <Td><Badge tone={orderStatus[x.status]?.tone ?? 'gray'}>{t(orderStatus[x.status]?.l ?? x.status)}</Badge></Td>
                </tr>
              ))}
            </Table>
            {more < d.transactions.length && <div className="p-3 text-center"><Button variant="ghost" size="sm" onClick={() => setMore(more + 50)}>{t('Voir plus')}</Button></div>}
          </Card>
        )}
      </section>
    </div>
  );
}

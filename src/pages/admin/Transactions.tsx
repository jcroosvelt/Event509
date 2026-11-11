import { useState } from 'react';
import { Download, Search } from 'lucide-react';
import { events, organizers } from '@/data/mock';
import { confirmOrderPayment, listPlatformOrders } from '@/services/api';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { convert, dateNumeric, moneyRaw, num, time } from '@/lib/format';
import { exportCSV } from '@/lib/export';
import { Badge, Button, Card, Input, Loading, PageHeader, Pager, Select, StatCard, Table, Td, type Tone } from '@/components/ui';
import type { Order } from '@/types';

const statusMap: Record<Order['status'], { l: string; tone: Tone }> = {
  paid: { l: 'Payée', tone: 'green' },
  pending: { l: 'En attente', tone: 'amber' },
  refunded: { l: 'Remboursée', tone: 'gray' },
  partially_refunded: { l: 'Remb. partiel', tone: 'violet' },
  cancelled: { l: 'Annulée', tone: 'red' },
};
const methodLabel: Record<Order['method'], string> = { card: 'Carte', moncash: 'MonCash', natcash: 'NatCash', paypal: 'PayPal', transfer: 'Virement' };
const PER = 15;

export default function Transactions() {
  const { t, lang, toast } = useApp();
  useTitle(t('Transactions'));
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<Order['status'] | ''>('');
  const [method, setMethod] = useState<Order['method'] | ''>('');
  const [org, setOrg] = useState('');
  const [page, setPage] = useState(0);
  const { data, loading, reload } = useAsync(() => listPlatformOrders({ q, status, method, organizerId: org }), [q, status, method, org], { throwOnError: true });
  const confirm = async (id: string) => {
    try {
      const r = await confirmOrderPayment(id);
      toast(r.emailSent ? t('Paiement confirmé : les billets ont été envoyés à l’acheteur') : t('Paiement confirmé : les billets sont valables (l’email n’a pas pu être envoyé)'));
      reload();
    } catch {
      toast(t('La confirmation a échoué. Réessayez.'), 'error');
    }
  };

  const list = data ?? [];
  const toHTG = (o: Order, v: number) => convert(v, o.currency, 'HTG');
  const volume = list.filter((o) => o.status === 'paid').reduce((a, o) => a + toHTG(o, o.subtotal), 0);
  const fees = list.filter((o) => o.status === 'paid').reduce((a, o) => a + toHTG(o, o.fees), 0);
  const eventOf = (id: string) => events.find((e) => e.id === id);
  const reset = (fn: () => void) => { fn(); setPage(0); };

  return (
    <div>
      <PageHeader
        title={t('Transactions')}
        subtitle={t('Toutes les commandes de la plateforme.')}
        actions={
          <Button variant="outline" onClick={() => exportCSV(list.map((o) => ({
            [t('Commande')]: o.id, [t('Date')]: o.createdAt, [t('Acheteur')]: o.buyerName, [t('Email')]: o.buyerEmail, [t('Événement')]: eventOf(o.eventId)?.title ?? '',
            [t('Organisateur')]: organizers.find((x) => x.id === eventOf(o.eventId)?.organizerId)?.name ?? '', [t('Montant')]: o.total, [t('Commission')]: o.fees,
            [t('Devise')]: o.currency, [t('Méthode')]: t(methodLabel[o.method]), [t('Statut')]: t(statusMap[o.status].l),
          })), 'transactions')}>
            <Download className="h-4 w-4" aria-hidden /> CSV
          </Button>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label={t('Commandes')} value={num(list.length, lang)} />
        <StatCard label={t('Volume payé')} value={moneyRaw(Math.round(volume), 'HTG', lang)} tone="green" />
        <StatCard label={t('Commissions')} value={moneyRaw(Math.round(fees), 'HTG', lang)} tone="violet" className="col-span-2 lg:col-span-1" />
      </div>
      <Card>
        <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_180px_180px_220px]" role="search">
          <div>
            <label htmlFor="tx-q" className="sr-only">{t('Rechercher une transaction')}</label>
            <Input id="tx-q" type="search" icon={<Search className="h-4 w-4" />} placeholder={t('N° de commande, acheteur, email…')} value={q} onChange={(e) => reset(() => setQ(e.target.value))} />
          </div>
          <label className="sr-only" htmlFor="tx-s">{t('Statut')}</label>
          <Select id="tx-s" value={status} onChange={(e) => reset(() => setStatus(e.target.value as Order['status'] | ''))}>
            <option value="">{t('Tous les statuts')}</option>
            {(Object.keys(statusMap) as Order['status'][]).map((s) => <option key={s} value={s}>{t(statusMap[s].l)}</option>)}
          </Select>
          <label className="sr-only" htmlFor="tx-m">{t('Méthode')}</label>
          <Select id="tx-m" value={method} onChange={(e) => reset(() => setMethod(e.target.value as Order['method'] | ''))}>
            <option value="">{t('Tous les moyens')}</option>
            {(Object.keys(methodLabel) as Order['method'][]).map((m) => <option key={m} value={m}>{t(methodLabel[m])}</option>)}
          </Select>
          <label className="sr-only" htmlFor="tx-o">{t('Organisateur')}</label>
          <Select id="tx-o" value={org} onChange={(e) => reset(() => setOrg(e.target.value))}>
            <option value="">{t('Tous les organisateurs')}</option>
            {organizers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        </div>
        {loading ? (
          <Loading />
        ) : (
          <>
            <Table caption={t('Transactions')} head={[t('Commande'), t('Date'), t('Acheteur'), t('Événement'), t('Méthode'), t('Montant'), t('Statut'), '']}>
              {list.slice(page * PER, page * PER + PER).map((o) => (
                <tr key={o.id}>
                  <Td className="font-mono text-xs">{o.id}</Td>
                  <Td className="text-ink-soft">{dateNumeric(o.createdAt, lang)} {time(o.createdAt, lang)}</Td>
                  <Td><span className="block font-semibold">{o.buyerName}</span><span className="text-xs text-ink-muted">{o.buyerEmail}</span></Td>
                  <Td className="max-w-[220px] truncate">{eventOf(o.eventId)?.title}</Td>
                  <Td>{t(methodLabel[o.method])}</Td>
                  <Td className="font-bold">{moneyRaw(o.total, o.currency, lang)}</Td>
                  <Td><Badge tone={statusMap[o.status].tone}>{t(statusMap[o.status].l)}</Badge></Td>
                  <Td>{o.status === 'pending' && <Button size="sm" variant="soft" onClick={() => confirm(o.id)} aria-label={t('Confirmer le paiement de la commande {id}', { id: o.id })}>{t('Confirmer le paiement')}</Button>}</Td>
                </tr>
              ))}
            </Table>
            {!list.length && <p className="py-8 text-center text-sm text-ink-muted">{t('Aucune transaction ne correspond à ces filtres.')}</p>}
            <Pager page={page} pages={Math.max(1, Math.ceil(list.length / PER))} total={list.length} onChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}

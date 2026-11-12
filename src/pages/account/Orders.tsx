import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Receipt, Undo2 } from 'lucide-react';
import { events } from '@/data/mock';
import { requestRefund } from '@/services/api';
import { useApp } from '@/store/app';
import { useTitle } from '@/lib/hooks';
import { dateNumeric, moneyRaw } from '@/lib/format';
import { useForm } from '@/lib/form';
import { Badge, Button, Card, EmptyState, Field, Modal, PageHeader, Select, Textarea, type Tone } from '@/components/ui';
import { EventCover } from '@/components/events';
import type { Order } from '@/types';

const statusMap: Record<Order['status'], { l: string; tone: Tone }> = {
  paid: { l: 'Payée', tone: 'green' },
  pending: { l: 'En attente', tone: 'amber' },
  refunded: { l: 'Remboursée', tone: 'gray' },
  partially_refunded: { l: 'Remb. partiel', tone: 'violet' },
  cancelled: { l: 'Annulée', tone: 'red' },
};
const methodLabel = { card: 'Carte', moncash: 'MonCash', natcash: 'NatCash', kashpaw: 'KashPaw', paypal: 'PayPal', transfer: 'Virement' };
const reasons = ['Empêchement', 'Achat en double', 'Événement modifié ou reporté', 'Autre'];

export default function Orders() {
  const { orders, updateOrder, lang, toast, t } = useApp();
  useTitle(t('Historique des achats'));
  const [refund, setRefund] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useForm({ reason: reasons[0], details: '' }, { details: (v, all) => (all.reason === 'Autre' && !String(v).trim() ? t('Précisez le motif') : undefined) });

  /** Facture imprimable (le backend fournira un PDF officiel). */
  const printInvoice = (o: Order, title: string) => {
    const w = window.open('', '_blank', 'width=720,height=900');
    if (!w) {
      toast(t('Autorisez les fenêtres pop-up pour afficher la facture'), 'info');
      return;
    }
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    const rows = o.items.map((i) => `<tr><td>${i.qty} × ${esc(t('billet'))}</td><td style="text-align:right">${moneyRaw(i.unitPrice * i.qty, o.currency, lang)}</td></tr>`).join('');
    w.document.write(`<html lang="${lang}"><head><title>${esc(t('Facture'))} ${o.id}</title><style>body{font-family:system-ui;padding:40px;color:#0B1533}table{width:100%;border-collapse:collapse}td{padding:8px 0;border-bottom:1px solid #eee}h1{margin:0}</style></head><body>
    <img src="/logo-full.png" height="48" alt="Event509"/><h1 style="margin-top:24px">${esc(t('Facture'))} ${o.id}</h1><p>${dateNumeric(o.createdAt, lang)} · ${esc(o.buyerName)} · ${esc(o.buyerEmail)}</p><h2>${esc(title)}</h2>
    <table>${rows}<tr><td>${esc(t('Réduction'))}</td><td style="text-align:right">-${moneyRaw(o.discount, o.currency, lang)}</td></tr><tr><td>${esc(t('Frais de service'))}</td><td style="text-align:right">${moneyRaw(o.fees, o.currency, lang)}</td></tr><tr><td><b>${esc(t('Total'))}</b></td><td style="text-align:right"><b>${moneyRaw(o.total, o.currency, lang)}</b></td></tr></table>
    <p>${esc(t('Payé par {method}', { method: t(methodLabel[o.method]) }))}</p><script>window.print()</script></body></html>`);
    w.document.close();
  };

  const submitRefund = async () => {
    if (!refund || !form.validate()) return;
    setBusy(true);
    const reason = form.values.details ? `${t(form.values.reason)} — ${form.values.details}` : t(form.values.reason);
    const r = await requestRefund(refund, reason);
    updateOrder(refund.id, { refundRequest: r });
    setBusy(false);
    setRefund(null);
    form.reset();
    toast(t('Demande envoyée. L’organisateur a 5 jours pour répondre.'));
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 sm:px-6 lg:pt-10">
      <PageHeader title={t('Historique des achats')} subtitle={orders.length > 1 ? t('{n} commandes', { n: orders.length }) : t('{n} commande', { n: orders.length })} />
      {!orders.length && <EmptyState icon={<Receipt className="h-5 w-5" />} title={t('Aucun achat pour le moment')} />}
      <ul className="space-y-3">
        {orders.map((o) => {
          const ev = events.find((e) => e.id === o.eventId);
          const s = statusMap[o.status];
          const qty = o.items.reduce((a, i) => a + i.qty, 0);
          const canRefund = o.status === 'paid' && o.total > 0 && !o.refundRequest && ev && new Date(ev.start) > new Date();
          return (
            <li key={o.id}>
              <Card className="p-4">
                <div className="flex items-center gap-4">
                  {ev && <EventCover event={ev} className="h-14 w-14 shrink-0 rounded-2xl [&>span]:!-bottom-1 [&>span]:!text-[2.2rem]" />}
                  <div className="min-w-0 flex-1">
                    <Link to={ev ? `/e/${ev.slug}` : '#'} className="line-clamp-1 font-bold hover:text-brand-ink">{ev?.title ?? o.eventId}</Link>
                    <div className="text-xs text-ink-muted">{o.id} · {dateNumeric(o.createdAt, lang)} · {qty > 1 ? t('{n} billets', { n: qty }) : t('{n} billet', { n: qty })} · {t(methodLabel[o.method])}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-extrabold">{o.total ? moneyRaw(o.total, o.currency, lang) : t('Gratuit')}</div>
                    <Badge tone={s.tone}>{t(s.l)}</Badge>
                  </div>
                </div>
                {o.refundRequest && (
                  <p className="mt-3 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                    {o.refundRequest.status === 'pending' ? t('Remboursement demandé — en attente de l’organisateur') : o.refundRequest.status === 'approved' ? t('Remboursement accepté') : t('Remboursement refusé — vous pouvez ouvrir un litige')}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                  <Button size="sm" variant="ghost" onClick={() => printInvoice(o, ev?.title ?? '')}><Download className="h-4 w-4" aria-hidden /> {t('Facture')}</Button>
                  {canRefund && <Button size="sm" variant="ghost" onClick={() => setRefund(o)}><Undo2 className="h-4 w-4" aria-hidden /> {t('Demander un remboursement')}</Button>}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>

      <Modal
        open={!!refund}
        onClose={() => setRefund(null)}
        title={t('Demande de remboursement')}
        description={t('L’organisateur dispose de 5 jours pour répondre. En cas de refus, vous pouvez ouvrir un litige auprès d’Event509.')}
        size="sm"
        footer={<Button className="flex-1" onClick={submitRefund} loading={busy}>{t('Envoyer la demande')}</Button>}
      >
        <div className="space-y-4">
          <Field label={t('Motif')}>
            <Select {...form.bind('reason')}>
              {reasons.map((r) => <option key={r} value={r}>{t(r)}</option>)}
            </Select>
          </Field>
          <Field label={t('Détails')} error={form.errors.details} hint={form.values.reason === 'Autre' ? undefined : t('Optionnel')}>
            <Textarea placeholder={t('Expliquez votre demande…')} {...form.bind('details')} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Receipt, Undo2 } from 'lucide-react';
import { events } from '@/data/mock';
import { useApp } from '@/store/app';
import { dateNumeric, moneyRaw } from '@/lib/format';
import { Badge, Button, Card, EmptyState, Field, Modal, PageHeader, Select, Textarea } from '@/components/ui';
import { EventCover } from '@/components/events';
import type { Order } from '@/types';

const statusMap: Record<Order['status'], { l: string; tone: 'green' | 'amber' | 'red' | 'gray' | 'violet' }> = {
  paid: { l: 'Payée', tone: 'green' },
  pending: { l: 'En attente', tone: 'amber' },
  refunded: { l: 'Remboursée', tone: 'gray' },
  partially_refunded: { l: 'Remb. partiel', tone: 'violet' },
  cancelled: { l: 'Annulée', tone: 'red' },
};
const methodLabel = { card: 'Carte', moncash: 'MonCash', natcash: 'NatCash', paypal: 'PayPal', transfer: 'Virement' };

function printInvoice(o: Order, title: string) {
  const w = window.open('', '_blank', 'width=720,height=900');
  if (!w) return;
  const rows = o.items.map((i) => `<tr><td>${i.qty} × billet</td><td style="text-align:right">${moneyRaw(i.unitPrice * i.qty, o.currency)}</td></tr>`).join('');
  w.document.write(`<html><head><title>Facture ${o.id}</title><style>body{font-family:system-ui;padding:40px;color:#0B1533}table{width:100%;border-collapse:collapse}td{padding:8px 0;border-bottom:1px solid #eee}h1{margin:0}</style></head><body>
  <img src="/logo-full.png" height="48"/><h1 style="margin-top:24px">Facture ${o.id}</h1><p>${dateNumeric(o.createdAt)} · ${o.buyerName} · ${o.buyerEmail}</p><h3>${title}</h3>
  <table>${rows}<tr><td>Réduction</td><td style="text-align:right">-${moneyRaw(o.discount, o.currency)}</td></tr><tr><td>Frais de service</td><td style="text-align:right">${moneyRaw(o.fees, o.currency)}</td></tr><tr><td><b>Total</b></td><td style="text-align:right"><b>${moneyRaw(o.total, o.currency)}</b></td></tr></table>
  <p>Payé par ${methodLabel[o.method]}</p><script>window.print()</script></body></html>`);
  w.document.close();
}

export default function Orders() {
  const { orders, lang, toast, t } = useApp();
  const [refund, setRefund] = useState<Order | null>(null);

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 sm:px-6 lg:pt-10">
      <PageHeader title={t('nav.orders')} subtitle={`${orders.length} commandes`} />
      {!orders.length && <EmptyState icon={<Receipt className="h-5 w-5" />} title="Aucun achat pour le moment" />}
      <div className="space-y-3">
        {orders.map((o) => {
          const ev = events.find((e) => e.id === o.eventId);
          const s = statusMap[o.status];
          const qty = o.items.reduce((a, i) => a + i.qty, 0);
          return (
            <Card key={o.id} className="p-4">
              <div className="flex items-center gap-4">
                {ev && <EventCover event={ev} className="h-14 w-14 shrink-0 rounded-2xl [&>span]:!-bottom-1 [&>span]:!text-[2.2rem]" />}
                <div className="min-w-0 flex-1">
                  <Link to={ev ? `/e/${ev.slug}` : '#'} className="line-clamp-1 font-bold hover:text-brand">{ev?.title ?? o.eventId}</Link>
                  <div className="text-xs text-ink-muted">{o.id} · {dateNumeric(o.createdAt, lang)} · {qty} billet{qty > 1 ? 's' : ''} · {methodLabel[o.method]}</div>
                </div>
                <div className="text-right">
                  <div className="font-extrabold">{o.total ? moneyRaw(o.total, o.currency, lang) : 'Gratuit'}</div>
                  <Badge tone={s.tone}>{s.l}</Badge>
                </div>
              </div>
              <div className="mt-3 flex gap-2 border-t border-line pt-3">
                <Button size="sm" variant="ghost" onClick={() => printInvoice(o, ev?.title ?? '')}><Download className="h-4 w-4" /> Facture</Button>
                {o.status === 'paid' && o.total > 0 && <Button size="sm" variant="ghost" onClick={() => setRefund(o)}><Undo2 className="h-4 w-4" /> Demander un remboursement</Button>}
              </div>
            </Card>
          );
        })}
      </div>

      <Modal
        open={!!refund}
        onClose={() => setRefund(null)}
        title="Demande de remboursement"
        size="sm"
        footer={<Button className="flex-1" onClick={() => { setRefund(null); toast('Demande envoyée à l’organisateur'); }}>Envoyer la demande</Button>}
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">L’organisateur dispose de 5 jours pour répondre. En cas de refus, vous pouvez ouvrir un litige auprès d’Event509.</p>
          <Field label="Motif">
            <Select>
              <option>Empêchement</option>
              <option>Achat en double</option>
              <option>Événement modifié ou reporté</option>
              <option>Autre</option>
            </Select>
          </Field>
          <Field label="Détails (optionnel)"><Textarea placeholder="Expliquez votre demande…" /></Field>
        </div>
      </Modal>
    </div>
  );
}

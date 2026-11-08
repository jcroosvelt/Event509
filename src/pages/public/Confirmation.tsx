import { Link, useLocation, useParams } from 'react-router-dom';
import { CheckCircle2, Clock, Mail, MessageCircle, Smartphone } from 'lucide-react';
import { useApp } from '@/store/app';
import { useTitle } from '@/lib/hooks';
import { moneyRaw } from '@/lib/format';
import { ButtonLink, Card } from '@/components/ui';
import { TicketCard } from '@/components/TicketCard';
import type { IssuedTicket, Order } from '@/types';

export default function Confirmation() {
  const { id } = useParams();
  const { state } = useLocation() as { state?: { order: Order; tickets: IssuedTicket[]; delivery: Record<string, boolean> } };
  const app = useApp();
  const { t } = app;
  const order = state?.order ?? app.orders.find((o) => o.id === id);
  const tickets = state?.tickets ?? app.tickets.filter((x) => x.orderId === id);
  const delivery = state?.delivery ?? { email: true, whatsapp: false, app: true };
  const pending = order?.status === 'pending';
  useTitle(pending ? t('Commande en attente') : t('Commande confirmée'));

  if (!order)
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">{t('Commande introuvable')}</h1>
        <Link to="/billets" className="mt-4 inline-block font-semibold text-brand">{t('Voir mes billets')}</Link>
      </div>
    );

  return (
    <div className="mx-auto max-w-2xl px-4 pt-10 sm:px-6">
      <div className="mb-8 text-center" role="status">
        <div aria-hidden className={`mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full ${pending ? 'bg-amber-100 text-amber-700' : 'bg-brand-100 text-brand'}`}>
          {pending ? <Clock className="h-10 w-10" /> : <CheckCircle2 className="h-10 w-10" />}
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">{pending ? t('Commande en attente') : t('C’est confirmé !')}</h1>
        <p className="mt-2 text-ink-soft">
          {pending
            ? t('Vos billets seront émis dès réception du virement.')
            : `${t('Commande {id}', { id: order.id })} · ${order.total ? moneyRaw(order.total, order.currency, app.lang) : t('Gratuit')}`}
        </p>
      </div>

      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-bold">{t('Billets envoyés')}</h2>
        <ul className="grid gap-2 sm:grid-cols-3">
          {delivery.email && <li className="flex min-w-0 items-center gap-2 rounded-2xl bg-canvas p-3 text-sm"><Mail className="h-4 w-4 shrink-0 text-brand" aria-hidden /> <span className="truncate">{order.buyerEmail}</span></li>}
          {delivery.whatsapp && <li className="flex items-center gap-2 rounded-2xl bg-canvas p-3 text-sm"><MessageCircle className="h-4 w-4 text-emerald-600" aria-hidden /> WhatsApp</li>}
          {delivery.app && <li className="flex items-center gap-2 rounded-2xl bg-canvas p-3 text-sm"><Smartphone className="h-4 w-4 text-ink" aria-hidden /> {t('Portefeuille de l’app')}</li>}
        </ul>
      </Card>

      {!pending && <div className="space-y-4">{tickets.map((x) => <TicketCard key={x.id} ticket={x} />)}</div>}

      <div className="mt-8 flex flex-col gap-2 sm:flex-row">
        <ButtonLink to="/billets" size="lg" className="flex-1">{t('Ouvrir mon portefeuille')}</ButtonLink>
        <ButtonLink to="/explorer" size="lg" variant="outline" className="flex-1">{t('Continuer à explorer')}</ButtonLink>
      </div>
    </div>
  );
}

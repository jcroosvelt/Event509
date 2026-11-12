import { useEffect, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clock, Copy, Download, Mail, TriangleAlert } from 'lucide-react';
import { claimOrder, DEMO, getOrderByKey } from '@/services/api';
import { useApp } from '@/store/app';
import { useAsync, useTitle } from '@/lib/hooks';
import { moneyRaw } from '@/lib/format';
import { registerPush } from '@/lib/push';
import { downloadTicketImage } from '@/lib/ticketImage';
import { ticketImageOpts } from '@/lib/ticketImageOpts';
import { events } from '@/data/mock';
import { useSessionLabel } from '@/components/TicketCard';
import { Button, ButtonLink, Card, Loading } from '@/components/ui';
import { TicketCard } from '@/components/TicketCard';
import type { IssuedTicket, Order } from '@/types';

/**
 * Confirmation d'achat. Elle se retrouve sans compte : le lien reçu par email (avec sa clé) rouvre la commande
 * et ses billets, chacun avec son QR code unique.
 */
export default function Confirmation() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const key = params.get('k') ?? '';
  const { state } = useLocation() as { state?: { order: Order; tickets: IssuedTicket[]; emailSent?: boolean } };
  const app = useApp();
  const { t, user, refresh } = app;
  const [claimed, setClaimed] = useState(false);
  const [saving, setSaving] = useState(false);
  const sessionLabel = useSessionLabel();
  // Page ouverte depuis l'email, ou rechargée : on relit la commande sur le serveur avec la clé du lien
  const remote = useAsync(() => (state?.order || DEMO || !key ? Promise.resolve(null) : getOrderByKey(id, key)), [id, key]);
  const order = state?.order ?? remote.data?.order ?? app.orders.find((o) => o.id === id);
  const tickets = state?.tickets ?? remote.data?.tickets ?? app.tickets.filter((x) => x.orderId === id);
  const pending = order?.status === 'pending';
  const mine = !!user && (!!state || !!remote.data?.claimed || claimed);
  // Application Android : cet appareil recevra les notifications de cette commande (billet prêt, événement modifié…)
  useEffect(() => {
    if (!DEMO && key) registerPush({ orderId: id, key });
  }, [id, key]);
  useTitle(pending ? t('Commande en attente') : t('Commande confirmée'));

  if (remote.loading && !order) return <Loading />;
  if (!order)
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">{t('Commande introuvable')}</h1>
        <p className="mt-2 text-ink-soft">{t('Ouvrez le lien reçu par email : il contient la clé qui permet de retrouver vos billets.')}</p>
        <Link to="/explorer" className="mt-4 inline-block font-semibold text-brand-ink">{t('Explorer les événements')}</Link>
      </div>
    );

  const emailSent = state?.emailSent;
  const link = `${window.location.origin}/commande/${order.id}${key ? `?k=${encodeURIComponent(key)}` : ''}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      app.toast(t('Lien copié'));
    } catch {
      app.toast(t('Copiez l’adresse de la page depuis la barre du navigateur.'), 'info');
    }
  };
  /** Télécharge chaque billet en image ultra HD (recommandé : le billet reste disponible sans réseau). */
  const saveTickets = async () => {
    setSaving(true);
    try {
      for (const x of tickets.filter((k) => k.status === 'valid')) {
        const ev = events.find((e) => e.id === x.eventId);
        if (!ev) continue;
        await downloadTicketImage(ticketImageOpts(ev, x, t, app.lang, x.sessionLabel ? sessionLabel(x.sessionLabel) : undefined));
        await new Promise((r) => setTimeout(r, 600));
      }
      app.toast(t('Billets enregistrés dans vos images'));
    } catch {
      app.toast(t('Les billets n’ont pas pu être enregistrés.'), 'error');
    } finally {
      setSaving(false);
    }
  };
  const addToAccount = async () => {
    try {
      await claimOrder(order.id, key);
      setClaimed(true);
      await refresh();
      app.toast(t('Billets ajoutés à votre compte'));
    } catch {
      app.toast(t('Ces billets n’ont pas pu être ajoutés à votre compte.'), 'error');
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 pt-10 sm:px-6">
      <div className="mb-8 text-center" role="status">
        <div aria-hidden className={`mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full ${pending ? 'bg-amber-100 text-amber-700' : 'bg-brand-100 text-brand-ink'}`}>
          {pending ? <Clock className="h-10 w-10" /> : <CheckCircle2 className="h-10 w-10" />}
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">{pending ? t('Commande en attente') : t('C’est confirmé !')}</h1>
        <p className="mt-2 text-ink-soft">
          {pending
            ? t('Vos billets seront émis dès réception du virement.')
            : `${t('Commande {id}', { id: order.id })} · ${order.total ? moneyRaw(order.total, order.currency, app.lang) : t('Gratuit')}`}
        </p>
      </div>

      {!pending && (
        <Card className="mb-6">
          {emailSent === false ? (
            <div className="flex items-start gap-3 text-sm">
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-bold">{t('L’email n’a pas pu être envoyé pour l’instant')}</p>
                <p className="mt-1 text-ink-soft">{t('Vos billets sont valables et affichés ci-dessous. Gardez cette page : copiez son lien ou ajoutez-la à vos favoris pour les retrouver.')}</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={copy}><Copy className="h-4 w-4" aria-hidden /> {t('Copier le lien de mes billets')}</Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 text-sm">
              <Mail className="mt-0.5 h-5 w-5 shrink-0 text-brand-ink" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-bold">{t('Vos billets sont envoyés à {email}', { email: order.buyerEmail })}</p>
                <p className="mt-1 text-ink-soft">{t('Chaque billet a son QR code unique, joint à l’email. Pensez à vérifier vos courriers indésirables.')}</p>
              </div>
            </div>
          )}
        </Card>
      )}

      {!pending && tickets.some((k) => k.status === 'valid') && (
        <Card className="mb-6 border-2 border-brand-200 bg-brand-50/60">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-bold">{t('Téléchargez vos billets (recommandé)')}</p>
              <p className="mt-1 text-sm text-ink-soft">{t('Gardez-les sur votre téléphone : vous les présenterez à l’entrée même sans connexion Internet.')}</p>
            </div>
            <Button size="lg" onClick={saveTickets} loading={saving}><Download className="h-5 w-5" aria-hidden /> {t('Télécharger mes billets')}</Button>
          </div>
        </Card>
      )}

      {!pending && <div className="space-y-4">{tickets.map((x) => <TicketCard key={x.id} ticket={x} linked={mine} />)}</div>}

      {!pending && key && (
        <Card className="mt-6">
          {user && !mine ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="min-w-0 flex-1 text-sm text-ink-soft">{t('Ajoutez ces billets à votre compte pour les retrouver dans votre espace, et les transférer ou les revendre.')}</p>
              <Button onClick={addToAccount}>{t('Ajouter à mon compte')}</Button>
            </div>
          ) : !user ? (
            <p className="text-sm text-ink-soft">{t('Pas besoin de compte : gardez l’email de confirmation ou cette page, elle rouvre vos billets à tout moment.')}</p>
          ) : null}
        </Card>
      )}

      <div className="mt-8 flex flex-col gap-2 sm:flex-row">
        {user && <ButtonLink to="/billets" size="lg" className="flex-1">{t('Ouvrir mes billets')}</ButtonLink>}
        <ButtonLink to="/explorer" size="lg" variant="outline" className="flex-1">{t('Continuer à explorer')}</ButtonLink>
      </div>
    </div>
  );
}

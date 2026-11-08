import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Repeat2, ShieldCheck } from 'lucide-react';
import { events } from '@/data/mock';
import { buyResale, listResale } from '@/services/api';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { convert, dateShort, money, time } from '@/lib/format';
import { Badge, Button, Card, EmptyState, Loading, Modal, PageHeader, Select } from '@/components/ui';
import { EventCover } from '@/components/events';
import type { IssuedTicket } from '@/types';

export default function Resale() {
  const { t, lang, currency, user, addTickets, toast } = useApp();
  useTitle(t('Billets en revente'));
  const [params, setParams] = useSearchParams();
  const eventId = params.get('e') ?? '';
  const nav = useNavigate();
  const { data, loading, reload } = useAsync(() => listResale(eventId || undefined), [eventId]);
  const [buying, setBuying] = useState<IssuedTicket | null>(null);
  const [busy, setBusy] = useState(false);

  const price = (l: IssuedTicket) => {
    const ev = events.find((e) => e.id === l.eventId)!;
    return money(Math.round(convert(l.resalePrice ?? 0, ev.currency, currency) * 100) / 100, currency, lang);
  };

  const confirm = async () => {
    if (!buying) return;
    if (!user) {
      nav(`/connexion?next=${encodeURIComponent('/revente')}`);
      return;
    }
    setBusy(true);
    try {
      const ticket = await buyResale(buying.id, { name: user.name, email: user.email });
      addTickets([ticket]);
      toast(t('Billet acheté : il est dans votre portefeuille'));
      setBuying(null);
      nav(`/billets/${ticket.id}`);
    } catch {
      toast(t('Ce billet vient d’être vendu à quelqu’un d’autre. Choisissez une autre offre.'), 'error');
      setBuying(null);
      reload();
    } finally {
      setBusy(false);
    }
  };

  const withEvents = events.filter((e) => e.status === 'published');

  return (
    <div className="mx-auto max-w-5xl px-4 pt-6 sm:px-6 lg:pt-10">
      <PageHeader title={t('Billets en revente')} subtitle={t('Achetez en toute sécurité les billets revendus par d’autres participants, jamais au-dessus du prix d’origine.')} />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label htmlFor="resale-ev" className="sr-only">{t('Événement')}</label>
        <Select id="resale-ev" value={eventId} onChange={(e) => setParams(e.target.value ? { e: e.target.value } : {}, { replace: true })} className="sm:w-80">
          <option value="">{t('Tous les événements')}</option>
          {withEvents.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
        </Select>
        <p className="flex items-center gap-2 text-sm text-ink-soft"><ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden /> {t('L’ancien QR code est annulé, vous recevez un billet neuf.')}</p>
      </div>

      {loading ? (
        <Loading />
      ) : !data?.length ? (
        <EmptyState icon={<Repeat2 className="h-5 w-5" />} title={t('Aucun billet en revente pour le moment')} body={t('Revenez plus tard : les offres apparaissent dès qu’un participant met son billet en vente.')} />
      ) : (
        <ul className="space-y-3">
          {data.map((l) => {
            const ev = events.find((e) => e.id === l.eventId);
            if (!ev) return null;
            const tt = ev.tickets.find((x) => x.id === l.ticketTypeId);
            return (
              <li key={l.id}>
                <Card className="flex flex-col gap-4 p-3 sm:flex-row sm:items-center">
                  <EventCover event={ev} className="h-20 w-full shrink-0 rounded-2xl sm:w-24 [&>span]:!text-[3rem]" />
                  <div className="min-w-0 flex-1">
                    <Link to={`/e/${ev.slug}`} className="font-bold hover:text-brand-ink">{ev.title}</Link>
                    <div className="text-sm text-ink-muted">{dateShort(ev.start, lang)} · {time(ev.start, lang)} · {ev.venue?.city ?? t('En ligne')}</div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <Badge tone="brand">{tt?.name}</Badge>
                      {l.seat && <Badge>{t('Place {seat}', { seat: l.seat })}</Badge>}
                      {tt && (l.resalePrice ?? 0) < tt.price && <Badge tone="green">{t('Sous le prix d’origine')}</Badge>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                    <span className="text-xl font-extrabold">{price(l)}</span>
                    <Button onClick={() => setBuying(l)}>{t('Acheter')}</Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={!!buying}
        onClose={() => setBuying(null)}
        title={t('Confirmer l’achat')}
        size="sm"
        footer={<Button className="flex-1" onClick={confirm} loading={busy}>{buying ? t('Payer {amount}', { amount: price(buying) }) : ''}</Button>}
      >
        {buying && (
          <p className="text-sm text-ink-soft">
            {t('Paiement avec votre moyen habituel. Le vendeur est payé après l’événement ; en cas d’annulation, vous êtes remboursé.')}
          </p>
        )}
      </Modal>
    </div>
  );
}

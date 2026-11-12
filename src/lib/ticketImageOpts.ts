import type { EventItem, IssuedTicket, Lang } from '@/types';
import type { Vars } from '@/lib/i18n';
import { dateLong, moneyRaw, time } from '@/lib/format';
import type { TicketImageOpts } from '@/lib/ticketImage';

/** Informations d'un billet pour l'image téléchargeable (ultra HD). */
export function ticketImageOpts(
  ev: EventItem,
  tk: IssuedTicket,
  t: (fr: string, vars?: Vars) => string,
  lang: Lang,
  session?: string,
): TicketImageOpts {
  const tt = ev.tickets.find((x) => x.id === tk.ticketTypeId);
  return {
    title: ev.title,
    ticketName: tt?.name ?? '',
    dateLong: dateLong(ev.start, lang),
    time: time(ev.start, lang),
    session,
    venueName: ev.venue?.name ?? ev.online?.platform ?? '',
    address: ev.venue?.address ?? '',
    city: ev.venue?.city ?? '',
    holder: tk.holderName,
    seat: tk.seat,
    price: tt && tt.price > 0 ? moneyRaw(tt.price, ev.currency, lang) : t('Gratuit'),
    code: tk.code,
    labels: {
      ticket: t('Billet'), date: t('Date'), time: t('Heure'), venue: t('Lieu'), seat: t('Place'),
      holder: t('Titulaire'), session: t('Séance'), scan: t('Présentez ce QR code à l’entrée'),
    },
  };
}

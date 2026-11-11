import { QRCodeSVG } from 'qrcode.react';
import { Link } from 'react-router-dom';
import { Armchair, CalendarDays, MapPin } from 'lucide-react';
import { events } from '@/data/mock';
import { useApp } from '@/store/app';
import { cx, dateShort, time } from '@/lib/format';
import type { IssuedTicket } from '@/types';
import { Badge, type Tone } from './ui';
import { EventCover } from './events';

export const statusLabel: Record<IssuedTicket['status'], { label: string; tone: Tone }> = {
  pending: { label: 'En attente de paiement', tone: 'amber' },
  valid: { label: 'Valide', tone: 'green' },
  used: { label: 'Utilisé', tone: 'gray' },
  transferred: { label: 'Transféré', tone: 'violet' },
  refunded: { label: 'Remboursé', tone: 'red' },
  resale: { label: 'En revente', tone: 'amber' },
};

/** Libellé de session : ISO → date lisible, sinon texte tel quel. */
export function useSessionLabel() {
  const { lang } = useApp();
  return (s?: string) => (s && /^\d{4}-\d{2}-\d{2}T/.test(s) ? `${dateShort(s, lang)} · ${time(s, lang)}` : s);
}

/** Billet visuel avec QR code — l'encoche et le pointillé reprennent la forme du logo. */
export function TicketCard({ ticket, compact, linked = true }: { ticket: IssuedTicket; compact?: boolean; linked?: boolean }) {
  const { lang, t } = useApp();
  const session = useSessionLabel();
  const ev = events.find((e) => e.id === ticket.eventId);
  if (!ev) return null;
  const tt = ev.tickets.find((x) => x.id === ticket.ticketTypeId);
  const st = statusLabel[ticket.status];
  const dim = ticket.status !== 'valid';

  const body = (
    <div className={cx('overflow-hidden rounded-3xl bg-surface shadow-card transition', linked && 'hover:-translate-y-0.5', dim && 'opacity-75')}>
      <EventCover event={ev} className="h-24 [&>svg]:!h-16 [&>svg]:!w-16">
        <div className="absolute inset-0 bg-gradient-to-r from-navy/75 to-transparent" />
        <div className="absolute inset-y-0 left-5 flex flex-col justify-center text-white">
          <span className="text-xs font-semibold opacity-90">{tt?.name}</span>
          <span className="line-clamp-1 max-w-[16rem] text-lg font-extrabold">{ev.title}</span>
        </div>
      </EventCover>
      <div className="relative flex items-center gap-4 p-5">
        <span aria-hidden className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-canvas" />
        <span aria-hidden className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-canvas" />
        <span aria-hidden className="absolute left-5 right-5 top-0 border-t-2 border-dashed border-line" />
        <div className="min-w-0 flex-1 space-y-1.5 text-sm">
          <div className="flex items-center gap-2 text-ink-soft">
            <CalendarDays className="h-4 w-4 shrink-0" aria-hidden />
            {ticket.sessionLabel ? session(ticket.sessionLabel) : `${dateShort(ev.start, lang)} · ${time(ev.start, lang)}`}
          </div>
          <div className="flex items-center gap-2 text-ink-soft"><MapPin className="h-4 w-4 shrink-0" aria-hidden /> <span className="truncate">{ev.venue?.name ?? ev.online?.platform}</span></div>
          {ticket.seat && <div className="flex items-center gap-2 font-semibold"><Armchair className="h-4 w-4" aria-hidden /> {t('Place {seat}', { seat: ticket.seat })}</div>}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge tone={st.tone}>{t(st.label)}</Badge>
            <span className="font-mono text-[11px] text-ink-muted">{ticket.code}</span>
          </div>
        </div>
        {!compact && ticket.status === 'valid' && (
          // Le QR reste noir sur blanc dans les deux thèmes pour être lisible par les scanners
          <div className="rounded-2xl bg-white p-1.5 ring-1 ring-line">
            <QRCodeSVG value={ticket.code} size={84} fgColor="#0B1533" bgColor="#FFFFFF" level="M" aria-label={t('QR code du billet {code}', { code: ticket.code })} />
          </div>
        )}
      </div>
    </div>
  );
  return linked ? (
    <Link to={`/billets/${ticket.id}`} aria-label={t('Billet {type} — {event}', { type: tt?.name ?? '', event: ev.title })} className="block rounded-3xl">
      {body}
    </Link>
  ) : (
    body
  );
}

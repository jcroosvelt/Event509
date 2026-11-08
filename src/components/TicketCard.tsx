import { QRCodeSVG } from 'qrcode.react';
import { Link } from 'react-router-dom';
import { CalendarDays, MapPin, Armchair } from 'lucide-react';
import { events } from '@/data/mock';
import { useApp } from '@/store/app';
import { cx, dateShort, time } from '@/lib/format';
import type { IssuedTicket } from '@/types';
import { Badge } from './ui';
import { EventCover } from './events';

export const statusLabel: Record<IssuedTicket['status'], { label: string; tone: 'green' | 'gray' | 'violet' | 'red' | 'amber' }> = {
  valid: { label: 'Valide', tone: 'green' },
  used: { label: 'Utilisé', tone: 'gray' },
  transferred: { label: 'Transféré', tone: 'violet' },
  refunded: { label: 'Remboursé', tone: 'red' },
  resale: { label: 'En revente', tone: 'amber' },
};

/** Billet visuel avec QR code — l'encoche et le pointillé reprennent la forme du logo. */
export function TicketCard({ ticket, compact, linked = true }: { ticket: IssuedTicket; compact?: boolean; linked?: boolean }) {
  const { lang } = useApp();
  const ev = events.find((e) => e.id === ticket.eventId);
  if (!ev) return null;
  const tt = ev.tickets.find((t) => t.id === ticket.ticketTypeId);
  const st = statusLabel[ticket.status];
  const dim = ticket.status !== 'valid';

  const body = (
    <div className={cx('overflow-hidden rounded-3xl bg-white shadow-card transition', linked && 'hover:-translate-y-0.5', dim && 'opacity-70')}>
      <EventCover event={ev} className="h-24 [&>span]:!text-[4.5rem]">
        <div className="absolute inset-0 bg-gradient-to-r from-ink/70 to-transparent" />
        <div className="absolute inset-y-0 left-5 flex flex-col justify-center text-white">
          <span className="text-xs font-semibold opacity-80">{tt?.name}</span>
          <span className="line-clamp-1 max-w-[16rem] text-lg font-extrabold">{ev.title}</span>
        </div>
      </EventCover>
      <div className="relative flex items-center gap-4 p-5">
        {/* encoches */}
        <span className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-canvas" />
        <span className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-canvas" />
        <span className="absolute left-5 right-5 top-0 border-t-2 border-dashed border-line" />
        <div className="min-w-0 flex-1 space-y-1.5 text-sm">
          <div className="flex items-center gap-2 text-ink-soft"><CalendarDays className="h-4 w-4" /> {dateShort(ev.start, lang)} · {time(ev.start, lang)}</div>
          <div className="flex items-center gap-2 text-ink-soft"><MapPin className="h-4 w-4" /> <span className="truncate">{ev.venue?.name ?? ev.online?.platform}</span></div>
          {ticket.seat && <div className="flex items-center gap-2 font-semibold"><Armchair className="h-4 w-4" /> Place {ticket.seat}</div>}
          <div className="flex items-center gap-2 pt-1">
            <Badge tone={st.tone}>{st.label}</Badge>
            <span className="font-mono text-[11px] text-ink-muted">{ticket.code}</span>
          </div>
        </div>
        {!compact && (
          <div className="rounded-2xl bg-white p-1.5 ring-1 ring-line">
            <QRCodeSVG value={ticket.code} size={84} fgColor="#0B1533" level="M" />
          </div>
        )}
      </div>
    </div>
  );
  return linked ? <Link to={`/billets/${ticket.id}`}>{body}</Link> : body;
}

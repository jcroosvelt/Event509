import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, Armchair, CalendarDays, MapPin, MonitorPlay, RefreshCw, Send, ShieldCheck, Tag, WalletCards } from 'lucide-react';
import { events } from '@/data/mock';
import { useApp } from '@/store/app';
import { dateLong, money, time } from '@/lib/format';
import { Badge, Button, Card, Field, Input, Modal, ProgressBar } from '@/components/ui';
import { EventCover } from '@/components/events';
import { statusLabel } from '@/components/TicketCard';

/** Jeton tournant : le QR change toutes les 30 s pour empêcher les captures d'écran. */
function useRotatingToken(seconds = 30) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  const window_ = Math.floor(now / (seconds * 1000));
  const left = seconds - Math.floor((now / 1000) % seconds);
  return { token: window_.toString(36).slice(-5).toUpperCase(), left, seconds };
}

export default function TicketDetail() {
  const { id } = useParams();
  const { tickets, updateTicket, toast, lang } = useApp();
  const tk = tickets.find((x) => x.id === id);
  const ev = events.find((e) => e.id === tk?.eventId);
  const { token, left, seconds } = useRotatingToken();
  const [transfer, setTransfer] = useState(false);
  const [resale, setResale] = useState(false);
  const [to, setTo] = useState('');
  const tt = ev?.tickets.find((x) => x.id === tk?.ticketTypeId);
  const [price, setPrice] = useState(String(tt?.price ?? 0));

  if (!tk || !ev || !tt)
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">Billet introuvable</h1>
        <Link to="/billets" className="mt-4 inline-block font-semibold text-brand">Mes billets</Link>
      </div>
    );

  const st = statusLabel[tk.status];
  const active = tk.status === 'valid';

  return (
    <div className="mx-auto max-w-md px-4 pt-6">
      <Link to="/billets" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-ink-soft"><ArrowLeft className="h-4 w-4" /> Mes billets</Link>

      <div className="overflow-hidden rounded-4xl bg-white shadow-card">
        <EventCover event={ev} className="h-36">
          <div className="absolute inset-0 bg-gradient-to-t from-ink/80 to-transparent" />
          <div className="absolute bottom-4 left-5 right-5 text-white">
            <Badge className="mb-2 bg-white/90 text-ink">{tt.name}</Badge>
            <h1 className="text-xl font-extrabold leading-tight">{ev.title}</h1>
          </div>
        </EventCover>

        <div className="relative px-6 pb-6 pt-8">
          <span className="absolute -left-4 -top-4 h-8 w-8 rounded-full bg-canvas" />
          <span className="absolute -right-4 -top-4 h-8 w-8 rounded-full bg-canvas" />
          <div className="mx-auto w-fit rounded-3xl p-3 ring-1 ring-line">
            {active ? (
              <QRCodeSVG value={`${tk.code}.${token}`} size={220} fgColor="#0B1533" level="Q" imageSettings={{ src: '/logo-mark.png', height: 34, width: 28, excavate: true }} />
            ) : (
              <div className="grid h-[220px] w-[220px] place-items-center rounded-2xl bg-canvas text-center text-sm font-semibold text-ink-muted">QR désactivé<br />({st.label.toLowerCase()})</div>
            )}
          </div>
          {active && (
            <div className="mx-auto mt-3 max-w-[220px]">
              <div className="mb-1 flex items-center justify-between text-[11px] text-ink-muted">
                <span className="flex items-center gap-1"><RefreshCw className="h-3 w-3" /> Code dynamique</span>
                <span>{left}s</span>
              </div>
              <ProgressBar value={left / seconds} className="h-1" />
            </div>
          )}
          <div className="mt-3 text-center font-mono text-sm tracking-wider text-ink-soft">{tk.code}</div>
          <div className="mt-1 flex justify-center"><Badge tone={st.tone}>{st.label}</Badge></div>

          <div className="mt-6 space-y-3 border-t-2 border-dashed border-line pt-5 text-sm">
            <div className="flex gap-3"><CalendarDays className="h-5 w-5 text-brand" /><span className="capitalize">{dateLong(ev.start, lang)} · {time(ev.start, lang)}</span></div>
            <div className="flex gap-3"><MapPin className="h-5 w-5 text-brand" /><span>{ev.venue ? `${ev.venue.name}, ${ev.venue.city}` : ev.online?.platform}</span></div>
            {tk.seat && <div className="flex gap-3"><Armchair className="h-5 w-5 text-brand" /><span className="font-bold">Place {tk.seat}</span></div>}
            <div className="flex gap-3"><ShieldCheck className="h-5 w-5 text-emerald-600" /><span>Titulaire : <b>{tk.holderName}</b></span></div>
          </div>
        </div>
      </div>

      {active && ev.online && (
        <a href={ev.online.url} target="_blank" rel="noreferrer" className="mt-4 flex items-center gap-3 rounded-3xl bg-violet-600 p-4 font-semibold text-white">
          <MonitorPlay className="h-5 w-5" /> Rejoindre le direct sur {ev.online.platform}
        </a>
      )}

      {active && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button onClick={() => toast('Ajouté à Apple Wallet (démo)', 'info')} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-black text-sm font-semibold text-white">
              <WalletCards className="h-4 w-4" /> Apple Wallet
            </button>
            <button onClick={() => toast('Ajouté à Google Wallet (démo)', 'info')} className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-white text-sm font-semibold">
              <span className="font-bold text-[#4285F4]">G</span> Google Wallet
            </button>
          </div>
          <Card className="mt-4 grid grid-cols-2 gap-2 p-2">
            <Button variant="ghost" onClick={() => setTransfer(true)}><Send className="h-4 w-4" /> Transférer</Button>
            <Button variant="ghost" onClick={() => setResale(true)}><Tag className="h-4 w-4" /> Revendre</Button>
          </Card>
        </>
      )}
      {tk.status === 'resale' && (
        <Button variant="outline" className="mt-4 w-full" onClick={() => { updateTicket(tk.id, { status: 'valid' }); toast('Billet retiré de la revente'); }}>
          Retirer de la revente
        </Button>
      )}
      <p className="mt-4 text-center text-xs text-ink-muted">Ce QR est unique et à usage unique. Il est invalidé dès le premier scan.</p>

      <Modal
        open={transfer}
        onClose={() => setTransfer(false)}
        title="Transférer le billet"
        size="sm"
        footer={
          <Button
            className="flex-1"
            disabled={to.length < 5}
            onClick={() => {
              updateTicket(tk.id, { status: 'transferred' });
              setTransfer(false);
              toast(`Billet transféré à ${to}`);
            }}
          >
            Transférer
          </Button>
        }
      >
        <p className="mb-4 text-sm text-ink-soft">Le destinataire reçoit un nouveau QR code ; le vôtre est immédiatement désactivé.</p>
        <Field label="Email ou téléphone du destinataire"><Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="ami@exemple.com" /></Field>
      </Modal>

      <Modal
        open={resale}
        onClose={() => setResale(false)}
        title="Revendre sur Event509"
        size="sm"
        footer={
          <Button
            className="flex-1"
            onClick={() => {
              updateTicket(tk.id, { status: 'resale' });
              setResale(false);
              toast('Billet mis en revente');
            }}
          >
            Mettre en vente
          </Button>
        }
      >
        <p className="mb-4 text-sm text-ink-soft">Revente sécurisée : l’acheteur reçoit un nouveau billet et vous êtes payé après l’événement. Prix plafonné à la valeur faciale.</p>
        <Field label={`Prix (${ev.currency})`} hint={`Maximum : ${money(tt.price, ev.currency, lang)}`}>
          <Input type="number" min={0} max={tt.price} value={price} onChange={(e) => setPrice(String(Math.min(tt.price, Number(e.target.value))))} />
        </Field>
      </Modal>
    </div>
  );
}

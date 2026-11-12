import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, Armchair, CalendarDays, Download, MapPin, MonitorPlay, RefreshCw, Send, ShieldCheck, Sun, Tag, WalletCards } from 'lucide-react';
import { events } from '@/data/mock';
import { cancelResale, listForResale, transferTicket } from '@/services/api';
import { useApp } from '@/store/app';
import { useTitle } from '@/lib/hooks';
import { dateLong, money, time } from '@/lib/format';
import { isEmail, useForm, cleanNumber } from '@/lib/form';
import { downloadTicketImage } from '@/lib/ticketImage';
import { ticketImageOpts } from '@/lib/ticketImageOpts';
import { Badge, Button, Card, Field, Input, Modal, ProgressBar } from '@/components/ui';
import { EventCover } from '@/components/events';
import { statusLabel, useSessionLabel } from '@/components/TicketCard';

/** Jeton tournant : le QR change toutes les 30 s pour décourager les captures d'écran. */
function useRotatingToken(seconds = 30) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  const win = Math.floor(now / (seconds * 1000));
  const left = seconds - Math.floor((now / 1000) % seconds);
  return { token: win.toString(36).slice(-5).toUpperCase(), left, seconds };
}

export default function TicketDetail() {
  const { id } = useParams();
  const { tickets, updateTicket, toast, lang, t } = useApp();
  const tk = tickets.find((x) => x.id === id);
  const ev = events.find((e) => e.id === tk?.eventId);
  const tt = ev?.tickets.find((x) => x.id === tk?.ticketTypeId);
  useTitle(ev ? t('Billet — {event}', { event: ev.title }) : t('Billet'));
  const { token, left, seconds } = useRotatingToken();
  const session = useSessionLabel();
  const qrRef = useRef<HTMLDivElement>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [resaleOpen, setResaleOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const transfer = useForm({ to: '' }, { to: (v) => (!isEmail(v) ? t('Saisissez l’adresse email du destinataire (nom@domaine.com)') : undefined) });
  const [sentLink, setSentLink] = useState<{ to: string; url: string } | null>(null);
  const resale = useForm(
    { price: String(tt?.price ?? 0) },
    { price: (v) => (!(Number(v) > 0) ? t('Indiquez un prix supérieur à 0') : tt && Number(v) > tt.price ? t('Le prix ne peut pas dépasser {max}', { max: money(tt.price, ev!.currency, lang) }) : undefined) },
  );

  if (!tk || !ev || !tt)
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">{t('Billet introuvable')}</h1>
        <Link to="/billets" className="mt-4 inline-block font-semibold text-brand-ink">{t('Mes billets')}</Link>
      </div>
    );

  const st = statusLabel[tk.status];
  const active = tk.status === 'valid';

  const doTransfer = async () => {
    if (!transfer.validate()) return;
    setBusy(true);
    try {
      const r = await transferTicket(tk.id, transfer.values.to.trim(), lang);
      updateTicket(tk.id, { status: 'transferred', transferredTo: transfer.values.to });
      setTransferOpen(false);
      // Si l'email n'a pas pu partir, on donne le lien à transmettre soi-même au destinataire
      if (r.link && !r.emailSent) setSentLink({ to: transfer.values.to, url: `${window.location.origin}${r.link}` });
      else toast(t('Billet envoyé à {to}. Votre QR code est désactivé.', { to: transfer.values.to }));
    } catch {
      toast(t('Le transfert n’a pas abouti. Votre billet reste valide ; réessayez.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const doResale = async () => {
    if (!resale.validate()) return;
    setBusy(true);
    const price = Number(resale.values.price);
    await listForResale(tk, price);
    updateTicket(tk.id, { status: 'resale', resalePrice: price });
    setBusy(false);
    setResaleOpen(false);
    toast(t('Billet mis en revente. Vous serez payé après l’événement s’il est vendu.'));
  };

  const doCancelResale = async () => {
    await cancelResale(tk.code);
    updateTicket(tk.id, { status: 'valid', resalePrice: undefined });
    toast(t('Billet retiré de la revente'), 'success', {
      label: t('Annuler l’action'),
      run: () => {
        listForResale(tk, tk.resalePrice ?? tt.price);
        updateTicket(tk.id, { status: 'resale' });
      },
    });
  };

  const saveImage = () => {
    downloadTicketImage(ticketImageOpts(ev, tk, t, lang, tk.sessionLabel ? session(tk.sessionLabel) : undefined))
      .then(() => toast(t('Billet enregistré dans vos images')))
      .catch(() => toast(t('Le billet n’a pas pu être enregistré.'), 'error'));
  };

  return (
    <div className="mx-auto max-w-md px-4 pt-6">
      <Link to="/billets" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-ink-soft"><ArrowLeft className="h-4 w-4" aria-hidden /> {t('Mes billets')}</Link>

      <article className="overflow-hidden rounded-4xl bg-surface shadow-card" aria-labelledby="ticket-title">
        <EventCover event={ev} className="h-36">
          <div className="absolute inset-0 bg-gradient-to-t from-navy/80 to-transparent" />
          <div className="absolute bottom-4 left-5 right-5 text-white">
            <Badge className="mb-2 !bg-white/90 !text-navy">{tt.name}</Badge>
            <h1 id="ticket-title" className="text-xl font-extrabold leading-tight">{ev.title}</h1>
          </div>
        </EventCover>

        <div className="relative px-6 pb-6 pt-8">
          <span aria-hidden className="absolute -left-4 -top-4 h-8 w-8 rounded-full bg-canvas" />
          <span aria-hidden className="absolute -right-4 -top-4 h-8 w-8 rounded-full bg-canvas" />
          <div ref={qrRef} className="mx-auto w-fit rounded-3xl bg-white p-3 ring-1 ring-line">
            {active ? (
              <QRCodeSVG
                value={`${tk.code}.${token}`}
                size={220}
                fgColor="#0B1533"
                bgColor="#FFFFFF"
                level="Q"
                imageSettings={{ src: '/logo-mark.png', height: 34, width: 28, excavate: true }}
                role="img"
                aria-label={t('QR code d’entrée, code {code}', { code: tk.code })}
              />
            ) : (
              <div className="grid h-[220px] w-[220px] place-items-center rounded-2xl bg-canvas text-center text-sm font-semibold text-ink-muted">
                {t('QR désactivé')}<br />({t(st.label).toLowerCase()})
              </div>
            )}
          </div>
          {active && (
            <div className="mx-auto mt-3 max-w-[220px]">
              <div className="mb-1 flex items-center justify-between text-[11px] text-ink-muted">
                <span className="flex items-center gap-1"><RefreshCw className="h-3 w-3" aria-hidden /> {t('Code dynamique')}</span>
                <span aria-hidden>{left}s</span>
              </div>
              <ProgressBar value={left / seconds} className="h-1" label={t('Renouvellement du code')} />
              <p className="mt-2 flex items-center justify-center gap-1 text-[11px] text-ink-muted"><Sun className="h-3 w-3" aria-hidden /> {t('Montez la luminosité de l’écran au scan')}</p>
            </div>
          )}
          <div className="mt-3 text-center font-mono text-sm tracking-wider text-ink-soft">{tk.code}</div>
          <div className="mt-1 flex justify-center"><Badge tone={st.tone}>{t(st.label)}</Badge></div>
          {tk.status === 'transferred' && tk.transferredTo && <p className="mt-2 text-center text-xs text-ink-muted">{t('Transféré à {to}', { to: tk.transferredTo })}</p>}
          {tk.status === 'resale' && tk.resalePrice !== undefined && <p className="mt-2 text-center text-xs text-ink-muted">{t('En vente à {price}', { price: money(tk.resalePrice, ev.currency, lang) })}</p>}

          <dl className="mt-6 space-y-3 border-t-2 border-dashed border-line pt-5 text-sm">
            <div className="flex gap-3"><dt><CalendarDays className="h-5 w-5 text-brand-ink" aria-label={t('Date')} /></dt><dd className="first-letter:uppercase">{tk.sessionLabel ? session(tk.sessionLabel) : `${dateLong(ev.start, lang)} · ${time(ev.start, lang)}`}</dd></div>
            <div className="flex gap-3"><dt><MapPin className="h-5 w-5 text-brand-ink" aria-label={t('Lieu')} /></dt><dd>{ev.venue ? `${ev.venue.name}, ${ev.venue.city}` : ev.online?.platform}</dd></div>
            {tk.seat && <div className="flex gap-3"><dt><Armchair className="h-5 w-5 text-brand-ink" aria-label={t('Place')} /></dt><dd className="font-bold">{t('Place {seat}', { seat: tk.seat })}</dd></div>}
            <div className="flex gap-3"><dt><ShieldCheck className="h-5 w-5 text-emerald-600" aria-label={t('Titulaire')} /></dt><dd>{t('Titulaire : {name}', { name: tk.holderName })}</dd></div>
          </dl>
        </div>
      </article>

      {active && ev.online && (
        <a href={ev.online.url} target="_blank" rel="noreferrer" className="mt-4 flex items-center gap-3 rounded-3xl bg-violet-600 p-4 font-semibold text-white">
          <MonitorPlay className="h-5 w-5" aria-hidden /> {t('Rejoindre le direct sur {platform}', { platform: ev.online.platform })}
        </a>
      )}

      {active && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="dark" onClick={() => setWalletOpen(true)}><WalletCards className="h-4 w-4" aria-hidden /> {t('Ajouter au Wallet')}</Button>
            <Button variant="outline" onClick={saveImage}><Download className="h-4 w-4" aria-hidden /> {t('Enregistrer')}</Button>
          </div>
          <Card className="mt-4 grid grid-cols-2 gap-2 p-2">
            <Button variant="ghost" onClick={() => setTransferOpen(true)}><Send className="h-4 w-4" aria-hidden /> {t('Transférer')}</Button>
            <Button variant="ghost" onClick={() => setResaleOpen(true)}><Tag className="h-4 w-4" aria-hidden /> {t('Revendre')}</Button>
          </Card>
        </>
      )}
      {tk.status === 'resale' && (
        <Button variant="outline" className="mt-4 w-full" onClick={doCancelResale}>{t('Retirer de la revente')}</Button>
      )}
      <p className="mt-4 text-center text-xs text-ink-muted">{t('Ce QR est unique et à usage unique. Il est invalidé dès le premier scan.')}</p>

      <Modal
        open={walletOpen}
        onClose={() => setWalletOpen(false)}
        title={t('Ajouter au Wallet')}
        size="sm"
        footer={<Button className="flex-1" onClick={() => { saveImage(); setWalletOpen(false); }}><Download className="h-4 w-4" aria-hidden /> {t('Enregistrer l’image du billet')}</Button>}
      >
        <p className="text-sm text-ink-soft">{t('Les cartes Apple Wallet et Google Wallet sont générées et signées par le serveur Event509 : elles seront disponibles dès la connexion du backend.')}</p>
        <p className="mt-3 text-sm text-ink-soft">{t('En attendant, enregistrez l’image du billet : son QR code est accepté à l’entrée, même sans connexion.')}</p>
      </Modal>

      <Modal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        title={t('Transférer le billet')}
        description={t('Le destinataire reçoit un nouveau QR code ; le vôtre est immédiatement désactivé.')}
        size="sm"
        footer={<Button className="flex-1" onClick={doTransfer} loading={busy}>{t('Transférer')}</Button>}
      >
        <form noValidate onSubmit={(e) => { e.preventDefault(); doTransfer(); }}>
          <Field label={t('Email du destinataire')} error={transfer.errors.to} required>
            <Input type="email" inputMode="email" placeholder="ami@exemple.com" autoComplete="off" {...transfer.bind('to')} />
          </Field>
        </form>
      </Modal>

      <Modal
        open={!!sentLink}
        onClose={() => setSentLink(null)}
        title={t('Billet transféré')}
        description={t('Votre QR code est désactivé. L’email n’a pas pu partir : envoyez ce lien à {to}, il lui donne accès à son billet.', { to: sentLink?.to ?? '' })}
        size="sm"
        footer={<Button className="flex-1" onClick={() => { void navigator.clipboard?.writeText(sentLink!.url).then(() => toast(t('Lien copié'))).catch(() => {}); }}>{t('Copier le lien')}</Button>}
      >
        <p className="select-all break-all rounded-2xl bg-canvas p-3 font-mono text-xs">{sentLink?.url}</p>
      </Modal>

      <Modal
        open={resaleOpen}
        onClose={() => setResaleOpen(false)}
        title={t('Revendre sur Event509')}
        description={t('L’acheteur reçoit un billet neuf et vous êtes payé après l’événement. Le prix est plafonné à la valeur du billet.')}
        size="sm"
        footer={<Button className="flex-1" onClick={doResale} loading={busy}>{t('Mettre en vente')}</Button>}
      >
        <form noValidate onSubmit={(e) => { e.preventDefault(); doResale(); }}>
          <Field label={t('Prix ({cur})', { cur: ev.currency })} error={resale.errors.price} hint={t('Maximum : {max}', { max: money(tt.price, ev.currency, lang) })} required>
            <Input type="text" inputMode="decimal" autoComplete="off" {...resale.bind('price')} onChange={(e) => resale.set('price', cleanNumber(e.target.value, true))} />
          </Field>
        </form>
      </Modal>
    </div>
  );
}

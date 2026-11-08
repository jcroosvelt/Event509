import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Building2, Check, CreditCard, Lock, Mail, MessageCircle, Smartphone, Tag, Wallet, X } from 'lucide-react';
import { createOrder, getEvent, takenSeats, validatePromo } from '@/services/api';
import { useAsync } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { convert, cx, dateLong, money, moneyRaw, time } from '@/lib/format';
import { trackPixel } from '@/lib/pixels';
import { Button, Card, Field, IconBadge, Input, Loading, Segmented } from '@/components/ui';
import { EventCover } from '@/components/events';
import { SeatMap } from '@/components/SeatMap';
import type { Currency, PaymentMethod, PromoCode } from '@/types';

const methods: { id: PaymentMethod; label: string; sub: string; icon: typeof CreditCard; color: string }[] = [
  { id: 'moncash', label: 'MonCash', sub: 'Paiement mobile Digicel', icon: Smartphone, color: 'bg-red-50 text-red-600' },
  { id: 'natcash', label: 'NatCash', sub: 'Paiement mobile Natcom', icon: Smartphone, color: 'bg-orange-50 text-orange-500' },
  { id: 'card', label: 'Carte bancaire', sub: 'Visa, Mastercard, Amex', icon: CreditCard, color: 'bg-brand-50 text-brand' },
  { id: 'paypal', label: 'PayPal', sub: 'Compte PayPal ou carte', icon: Wallet, color: 'bg-sky-50 text-sky-600' },
  { id: 'transfer', label: 'Virement bancaire', sub: 'Validation sous 24–48 h', icon: Building2, color: 'bg-emerald-50 text-emerald-600' },
];

export default function Checkout() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const app = useApp();
  const { data: ev, loading } = useAsync(() => getEvent(slug), [slug]);

  const selection = useMemo(
    () =>
      (params.get('t') ?? '')
        .split(',')
        .filter(Boolean)
        .map((s) => {
          const [id, n] = s.split(':');
          return { ticketTypeId: id, qty: Math.max(0, parseInt(n, 10) || 0) };
        })
        .filter((s) => s.qty > 0),
    [params],
  );

  const [currency, setCurrency] = useState<Currency>(app.currency);
  const [seats, setSeats] = useState<string[]>([]);
  const [name, setName] = useState(app.user?.name ?? '');
  const [email, setEmail] = useState(app.user?.email ?? '');
  const [phone, setPhone] = useState(app.user?.phone ?? '');
  const [delivery, setDelivery] = useState({ email: true, whatsapp: true, app: true });
  const [method, setMethod] = useState<PaymentMethod>('moncash');
  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState<PromoCode | null>(null);
  const [promoErr, setPromoErr] = useState('');
  const [checking, setChecking] = useState(false);
  const [paying, setPaying] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [card, setCard] = useState({ number: '', exp: '', cvc: '' });

  if (loading) return <Loading />;
  if (!ev || !selection.length)
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">Panier vide</h1>
        <Link to={ev ? `/e/${ev.slug}` : '/explorer'} className="mt-4 inline-block font-semibold text-brand">Choisir des billets</Link>
      </div>
    );

  const lines = selection.map((s) => ({ ...s, tt: ev.tickets.find((t) => t.id === s.ticketTypeId)! })).filter((l) => l.tt);
  const seatCount = ev.seated ? lines.reduce((a, l) => a + l.qty * (l.tt.groupSize ?? 1), 0) : 0;
  const c = (v: number) => Math.round(convert(v, ev.currency, currency) * 100) / 100;
  const subtotal = c(lines.reduce((a, l) => a + l.qty * l.tt.price, 0));
  const discount = promo ? Math.min(subtotal, promo.type === 'percent' ? (subtotal * promo.value) / 100 : c(promo.value)) : 0;
  const isFree = subtotal === 0;
  const fees = isFree ? 0 : Math.round((subtotal - discount) * (app.feePercent / 100) * 100) / 100;
  const total = Math.round((subtotal - discount + fees) * 100) / 100;
  const fmt = (v: number) => moneyRaw(v, currency, app.lang);

  const applyPromo = async () => {
    setChecking(true);
    setPromoErr('');
    const p = await validatePromo(promoInput, ev.id);
    setChecking(false);
    if (p) {
      setPromo(p);
      app.toast(`Code ${p.code} appliqué`);
    } else setPromoErr('Code invalide, expiré ou épuisé');
  };

  const pay = async () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Nom requis';
    if (!/^\S+@\S+\.\S+$/.test(email)) e.email = 'Email invalide';
    if ((delivery.whatsapp || method === 'moncash' || method === 'natcash') && phone.replace(/\D/g, '').length < 8) e.phone = 'Numéro requis (WhatsApp / paiement mobile)';
    if (ev.seated && seats.length !== seatCount) e.seats = `Sélectionnez ${seatCount} place(s)`;
    if (!isFree && method === 'card' && card.number.replace(/\s/g, '').length < 15) e.card = 'Numéro de carte incomplet';
    setErrors(e);
    if (Object.keys(e).length) {
      app.toast('Vérifiez le formulaire', 'error');
      return;
    }
    setPaying(true);
    let seatIdx = 0;
    const { order, tickets } = await createOrder({
      eventId: ev.id,
      items: lines.map((l) => {
        const n = l.qty * (l.tt.groupSize ?? 1);
        const s = ev.seated ? seats.slice(seatIdx, seatIdx + n) : undefined;
        seatIdx += n;
        return { ticketTypeId: l.tt.id, qty: l.qty, seats: s };
      }),
      promo,
      method: isFree ? 'card' : method,
      currency,
      buyer: { name, email, phone },
      delivery,
      feePercent: app.feePercent,
      totals: { subtotal, discount, fees, total },
    });
    app.addOrder(order);
    app.addTickets(tickets);
    trackPixel('Purchase', { value: total, currency, event: ev.id });
    nav(`/commande/${order.id}`, { state: { order, tickets, delivery } });
  };

  const step = (n: number, title: string) => (
    <div className="mb-4 flex items-center gap-3">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-sm font-bold text-white">{n}</span>
      <h2 className="text-lg font-bold">{title}</h2>
    </div>
  );
  let n = 0;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 lg:pt-10">
      <Link to={`/e/${ev.slug}`} className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-ink-soft hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Retour à l’événement
      </Link>
      <h1 className="mb-6 text-3xl font-extrabold tracking-tight">Finaliser la commande</h1>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {ev.seated && (
            <Card>
              {step(++n, 'Choisissez vos places')}
              <SeatMap taken={takenSeats(ev.id)} selected={seats} max={seatCount} onChange={setSeats} />
              <p className={cx('mt-3 text-center text-sm', errors.seats ? 'text-red-600' : 'text-ink-muted')}>
                {seats.length}/{seatCount} place(s) sélectionnée(s){seats.length ? ` : ${seats.join(', ')}` : ''}
              </p>
            </Card>
          )}

          <Card>
            {step(++n, 'Vos informations')}
            {!app.user && (
              <div className="mb-4 rounded-2xl bg-brand-50 p-4 text-sm">
                Déjà inscrit ? <Link to="/connexion" className="font-bold text-brand">Connectez-vous</Link> pour retrouver vos billets dans l’app.
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nom complet" error={errors.name}><Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
              <Field label="Email" error={errors.email}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
              <Field label="Téléphone / WhatsApp" error={errors.phone} className="sm:col-span-2"><Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+509 3x xx xx xx" autoComplete="tel" /></Field>
            </div>
            <div className="mt-5">
              <div className="mb-2 text-sm font-semibold">Recevoir mes billets par</div>
              <div className="grid gap-2 sm:grid-cols-3">
                {([
                  ['email', 'Email', Mail],
                  ['whatsapp', 'WhatsApp', MessageCircle],
                  ['app', 'Dans l’app', Smartphone],
                ] as const).map(([k, l, I]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setDelivery((d) => ({ ...d, [k]: !d[k] }))}
                    className={cx('flex items-center gap-2 rounded-2xl border p-3 text-sm font-semibold transition', delivery[k] ? 'border-brand bg-brand-50' : 'border-line')}
                  >
                    <I className="h-4 w-4" /> {l}
                    <span className={cx('ml-auto grid h-5 w-5 place-items-center rounded-full', delivery[k] ? 'bg-brand text-white' : 'border border-line')}>{delivery[k] && <Check className="h-3 w-3" />}</span>
                  </button>
                ))}
              </div>
            </div>
          </Card>

          {!isFree && (
            <Card>
              {step(++n, 'Paiement')}
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">Devise</span>
                <Segmented value={currency} onChange={setCurrency} options={[{ value: 'HTG', label: 'HTG' }, { value: 'USD', label: 'USD' }]} size="sm" />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {methods.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMethod(m.id)}
                    className={cx('flex items-center gap-3 rounded-2xl border p-3 text-left transition', method === m.id ? 'border-brand bg-brand-50/60 ring-4 ring-brand/10' : 'border-line hover:border-ink/20')}
                  >
                    <span className={cx('grid h-10 w-10 place-items-center rounded-full', m.color)}><m.icon className="h-[18px] w-[18px]" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold">{m.label}</span>
                      <span className="block truncate text-xs text-ink-muted">{m.sub}</span>
                    </span>
                    <span className={cx('h-5 w-5 rounded-full border-2', method === m.id ? 'border-[6px] border-brand' : 'border-line')} />
                  </button>
                ))}
              </div>

              <div className="mt-5 rounded-2xl bg-canvas p-4">
                {method === 'card' && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Numéro de carte" error={errors.card} className="col-span-2">
                      <Input inputMode="numeric" placeholder="4242 4242 4242 4242" value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value.replace(/[^\d ]/g, '').slice(0, 19) })} />
                    </Field>
                    <Field label="Expiration"><Input placeholder="MM/AA" value={card.exp} onChange={(e) => setCard({ ...card, exp: e.target.value.slice(0, 5) })} /></Field>
                    <Field label="CVC"><Input inputMode="numeric" placeholder="123" value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, '').slice(0, 4) })} /></Field>
                  </div>
                )}
                {(method === 'moncash' || method === 'natcash') && (
                  <p className="text-sm text-ink-soft">Une demande de paiement sera envoyée au <b className="text-ink">{phone || 'numéro indiqué'}</b>. Validez-la avec votre code PIN {method === 'moncash' ? 'MonCash' : 'NatCash'}.</p>
                )}
                {method === 'paypal' && <p className="text-sm text-ink-soft">Vous serez redirigé vers PayPal pour confirmer le paiement, puis ramené ici.</p>}
                {method === 'transfer' && (
                  <div className="space-y-1 text-sm text-ink-soft">
                    <p>Effectuez le virement avec la référence de commande. Vos billets seront émis dès réception.</p>
                    <p><b className="text-ink">Banque :</b> Banque de démonstration · <b className="text-ink">Compte :</b> 000-123-4567</p>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* Récapitulatif */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card>
            <div className="flex gap-3">
              <EventCover event={ev} className="h-16 w-16 shrink-0 rounded-2xl [&>span]:!-bottom-1 [&>span]:!text-[2.4rem]" />
              <div className="min-w-0">
                <div className="line-clamp-2 font-bold">{ev.title}</div>
                <div className="text-xs capitalize text-ink-muted">{dateLong(ev.start, app.lang)} · {time(ev.start, app.lang)}</div>
              </div>
            </div>
            <div className="my-4 space-y-2 border-y border-dashed border-line py-4 text-sm">
              {lines.map((l) => (
                <div key={l.tt.id} className="flex justify-between gap-2">
                  <span className="text-ink-soft">{l.qty} × {l.tt.name}</span>
                  <span className="font-semibold">{fmt(c(l.tt.price * l.qty))}</span>
                </div>
              ))}
            </div>

            {!isFree && (
              <div className="mb-4">
                {promo ? (
                  <div className="flex items-center justify-between rounded-2xl bg-emerald-50 px-4 py-3 text-sm">
                    <span className="flex items-center gap-2 font-semibold text-emerald-700"><Tag className="h-4 w-4" /> {promo.code} (−{promo.type === 'percent' ? `${promo.value}%` : money(promo.value, ev.currency)})</span>
                    <button aria-label="Retirer le code" onClick={() => setPromo(null)}><X className="h-4 w-4 text-emerald-700" /></button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input placeholder="Code promo" value={promoInput} onChange={(e) => setPromoInput(e.target.value.toUpperCase())} className="h-11" />
                    <Button variant="dark" onClick={applyPromo} loading={checking} disabled={!promoInput}>Appliquer</Button>
                  </div>
                )}
                {promoErr && <p className="mt-1 text-xs text-red-600">{promoErr}</p>}
                <p className="mt-1 text-[11px] text-ink-muted">Essayez KOMPA10 ou NOEL2026</p>
              </div>
            )}

            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-ink-soft">Sous-total</span><span>{fmt(subtotal)}</span></div>
              {discount > 0 && <div className="flex justify-between text-emerald-600"><span>Réduction</span><span>−{fmt(discount)}</span></div>}
              {!isFree && <div className="flex justify-between"><span className="text-ink-soft">Frais de service ({app.feePercent}%)</span><span>{fmt(fees)}</span></div>}
              <div className="flex items-baseline justify-between border-t border-line pt-3">
                <span className="font-bold">Total</span>
                <span className="text-2xl font-extrabold">{isFree ? 'Gratuit' : fmt(total)}</span>
              </div>
            </div>
            <Button size="lg" className="mt-5 w-full" onClick={pay} loading={paying}>
              {!paying && <Lock className="h-4 w-4" />}
              {isFree ? 'Confirmer la réservation' : `Payer ${fmt(total)}`}
            </Button>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-ink-muted">
              <IconBadge size="sm" tone="green" className="h-5 w-5"><Lock className="h-3 w-3" /></IconBadge>
              Paiement sécurisé · Billet QR unique et non duplicable
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Building2, CalendarDays, CreditCard, Gift, Lock, Mail, Smartphone, Tag, Wallet, X } from 'lucide-react';
import { createOrder, currentFeeSettings, feeRateFor, getEvent, seatMapOf, takenSeats, validatePromo, DEMO } from '@/services/api';
import { computeFees } from '@/lib/fees';
import { ambassadors, organizers } from '@/data/mock';
import { useAsync, useTitle } from '@/lib/hooks';
import { rememberGuestOrder, useApp } from '@/store/app';
import { convert, cx, dateLong, money, moneyRaw, time } from '@/lib/format';
import { isEmail, useForm } from '@/lib/form';
import { trackPixel } from '@/lib/pixels';
import { Button, Card, Field, IconBadge, Input, Loading, Segmented, Toggle } from '@/components/ui';
import { trackingCode } from '@/lib/tracking';
import { EventCover } from '@/components/events';
import { SeatMap } from '@/components/SeatMap';
import { useSessionLabel } from '@/components/TicketCard';
import type { Currency, PaymentMethod, PromoCode } from '@/types';

const methods: { id: PaymentMethod; label: string; sub: string; icon: typeof CreditCard; color: string; logo?: string }[] = [
  { id: 'moncash', label: 'MonCash', sub: 'Paiement mobile Digicel', icon: Smartphone, color: 'bg-red-50 text-red-600', logo: '/pay/moncash.png' },
  { id: 'natcash', label: 'NatCash', sub: 'Paiement mobile Natcom', icon: Smartphone, color: 'bg-orange-50 text-orange-500', logo: '/pay/natcash.png' },
  { id: 'kashpaw', label: 'KashPaw', sub: 'Paiement mobile', icon: Smartphone, color: 'bg-yellow-50 text-yellow-600', logo: '/pay/kashpaw.png' },
  { id: 'card', label: 'Carte bancaire', sub: 'Visa, Mastercard, Amex', icon: CreditCard, color: 'bg-brand-50 text-brand-ink' },
  { id: 'paypal', label: 'PayPal', sub: 'Compte PayPal ou carte', icon: Wallet, color: 'bg-sky-50 text-sky-600' },
  { id: 'transfer', label: 'Virement bancaire', sub: 'Validation sous 24–48 h', icon: Building2, color: 'bg-emerald-50 text-emerald-600' },
];


export default function Checkout() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const app = useApp();
  const { t, lang } = app;
  useTitle(t('Finaliser la commande'));
  const { data: ev, loading } = useAsync(() => getEvent(slug), [slug]);
  const sessionLabel = useSessionLabel();
  const occ = params.get('s') ?? undefined;

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
  const [seats, setSeats] = useState<Record<string, string[]>>({});
  const [activeLine, setActiveLine] = useState<string>('');
  const [method, setMethod] = useState<PaymentMethod>('moncash');
  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState<PromoCode | null>(null);
  const [promoErr, setPromoErr] = useState('');
  const [optIn, setOptIn] = useState(false);
  const [checking, setChecking] = useState(false);
  const [paying, setPaying] = useState(false);
  const [seatErr, setSeatErr] = useState('');

  const form = useForm(
    { name: app.user?.name ?? '', email: app.user?.email ?? '', email2: app.user?.email ?? '', phone: app.user?.phone ?? '' },
    {
      name: (v) => (!String(v).trim() ? t('Indiquez le nom qui figurera sur les billets') : undefined),
      email: (v) => (!isEmail(v) ? t('Saisissez une adresse comme nom@domaine.com') : undefined),
      // Le billet part par email : on demande l'adresse deux fois pour éviter une faute de frappe qui l'enverrait ailleurs
      email2: (v, all) => (String(v).trim().toLowerCase() !== String(all.email).trim().toLowerCase() ? t('Les deux adresses email doivent être identiques') : undefined),
    },
  );

  if (loading) return <Loading />;
  if (!ev || !selection.length)
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">{t('Aucun billet sélectionné')}</h1>
        <p className="mt-2 text-ink-soft">{t('Choisissez vos billets sur la page de l’événement.')}</p>
        <Link to={ev ? `/e/${ev.slug}` : '/explorer'} className="mt-4 inline-block font-semibold text-brand-ink">{t('Choisir des billets')}</Link>
      </div>
    );

  const lines = selection.map((s) => ({ ...s, tt: ev.tickets.find((x) => x.id === s.ticketTypeId)! })).filter((l) => l.tt);
  const map = seatMapOf(ev);
  const needed = (id: string) => {
    const l = lines.find((x) => x.tt.id === id)!;
    return l.qty * (l.tt.groupSize ?? 1);
  };
  const currentLine = activeLine || lines[0]?.tt.id;
  const allSeats = Object.values(seats).flat();
  const seatsOk = !ev.seated || lines.every((l) => (seats[l.tt.id]?.length ?? 0) === needed(l.tt.id));

  const c = (v: number) => Math.round(convert(v, ev.currency, currency) * 100) / 100;
  const subtotal = c(lines.reduce((a, l) => a + l.qty * l.tt.price, 0));
  // Même règle que le serveur : seuls les billets visés par le code comptent
  const promoLines = promo?.ticketTypeId ? lines.filter((l) => l.tt.id === promo.ticketTypeId) : lines;
  const promoBase = c(promoLines.reduce((a, l) => a + l.qty * l.tt.price, 0));
  const discount = promo ? Math.min(promoBase, promo.type === 'percent' ? Math.round(promoBase * promo.value) / 100 : c(promo.value)) : 0;
  const isFree = subtotal === 0;
  // Commission : taux de l'organisateur (négocié ou par défaut) + frais fixes par billet payant
  const paidTickets = lines.filter((l) => l.tt.price > 0).reduce((a, l) => a + l.qty, 0);
  const fb = computeFees(currentFeeSettings(), subtotal - discount, paidTickets, currency, feeRateFor(ev.organizerId));
  const fees = fb.buyerFee;
  const total = fb.total;
  const fmt = (v: number) => moneyRaw(v, currency, lang);
  const referrer = app.referral ? ambassadors.find((a) => a.code === app.referral!.code) : undefined;

  const applyPromo = async () => {
    if (!promoInput.trim()) {
      setPromoErr(t('Saisissez un code promo'));
      return;
    }
    setChecking(true);
    setPromoErr('');
    const p = await validatePromo(promoInput, ev.id);
    setChecking(false);
    if (p) {
      setPromo(p);
      app.toast(t('Code {code} appliqué', { code: p.code }));
    } else setPromoErr(t('Ce code n’est pas valable pour cet événement. Vérifiez l’orthographe ou sa date de fin.'));
  };

  const pay = async () => {
    const formOk = form.validate();
    if (!seatsOk) {
      setSeatErr(t('Choisissez toutes vos places avant de payer'));
      if (formOk) document.getElementById('places')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (!formOk || !seatsOk) return;
    setPaying(true);
    try {
      const { order, tickets, accessKey, emailSent, payUrl } = await createOrder({
        eventId: ev.id,
        items: lines.map((l) => ({ ticketTypeId: l.tt.id, qty: l.qty, seats: ev.seated ? seats[l.tt.id] : undefined })),
        promo,
        method: isFree ? 'card' : method,
        currency,
        buyer: { name: form.values.name, email: form.values.email, phone: form.values.phone },
        lang: app.lang,
        feePercent: fb.rate,
        totals: { subtotal, discount, fees: fb.fee, total },
        sessionLabel: occ,
        referral: app.referral?.code,
        src: trackingCode(),
        marketingOptIn: optIn || undefined,
      });
      if (payUrl) {
        // Paiement en ligne : on garde la clé de la commande pour la retrouver au retour, puis on ouvre la page sécurisée.
        // L'application Android laisse alors toute page de paiement s'ouvrir dans la fenêtre du site.
        if (accessKey) rememberGuestOrder(order.id, accessKey);
        window.AppBridge?.postMessage('payment:start');
        window.location.assign(payUrl);
        return;
      }
      app.addOrder(order);
      app.addTickets(tickets);
      app.pushNotification({ title: t('Commande confirmée'), body: `${ev.title} — ${order.id}`, kind: 'sale' });
      trackPixel('Purchase', { value: total, currency, event: ev.id });
      // Sans compte : la clé du lien permet de retrouver la commande ; on la garde sur cet appareil pour la rattacher à un compte plus tard
      if (!app.user && accessKey) rememberGuestOrder(order.id, accessKey);
      nav(`/commande/${order.id}${accessKey ? `?k=${encodeURIComponent(accessKey)}` : ''}`, { state: { order, tickets, emailSent } });
    } catch {
      setPaying(false);
      app.toast(t('Le paiement n’a pas abouti et vous n’avez pas été débité. Vos informations sont conservées.'), 'error', { label: t('Réessayer'), run: pay });
    }
  };

  let n = 0;
  const step = (title: string) => (
    <div className="mb-4 flex items-center gap-3">
      <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full bg-contrast text-sm font-bold text-on-contrast">{++n}</span>
      <h2 className="text-lg font-bold">{title}</h2>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 lg:pt-10">
      <Link to={`/e/${ev.slug}`} className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-ink-soft hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {t('Retour à l’événement')}
      </Link>
      <h1 className="mb-6 text-3xl font-extrabold tracking-tight">{t('Finaliser la commande')}</h1>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          pay();
        }}
        className="grid gap-6 lg:grid-cols-[1fr_380px] [&>*]:min-w-0"
      >
        <div className="space-y-6">
          {ev.seated && (
            <Card id="places">
              {step(t('Choisissez vos places'))}
              {lines.length > 1 && (
                <Segmented
                  label={t('Type de billet')}
                  className="mb-4"
                  value={currentLine}
                  onChange={setActiveLine}
                  options={lines.map((l) => ({ value: l.tt.id, label: `${l.tt.name} (${seats[l.tt.id]?.length ?? 0}/${needed(l.tt.id)})` }))}
                />
              )}
              <SeatMap
                config={map}
                tickets={ev.tickets}
                taken={takenSeats(ev, occ ?? '')}
                selected={seats[currentLine] ?? []}
                activeTicketId={currentLine}
                max={needed(currentLine)}
                onChange={(s) => {
                  setSeatErr('');
                  setSeats((all) => ({ ...all, [currentLine]: s.filter((x) => !Object.entries(all).some(([k, v]) => k !== currentLine && v.includes(x))) }));
                }}
              />
              <p className={cx('mt-3 text-center text-sm', seatErr ? 'font-semibold text-red-600' : 'text-ink-muted')} role={seatErr ? 'alert' : undefined} aria-live="polite">
                {seatErr || t('{n}/{m} place(s) choisie(s)', { n: allSeats.length, m: lines.reduce((a, l) => a + needed(l.tt.id), 0) })}
                {allSeats.length > 0 && !seatErr ? ` : ${allSeats.join(', ')}` : ''}
              </p>
            </Card>
          )}

          <Card>
            {step(t('Vos informations'))}
            {!app.user && (
              <div className="mb-4 rounded-2xl bg-brand-50 p-4 text-sm">
                {t('Vous avez un compte ?')} <Link to={`/connexion?next=${encodeURIComponent(location.pathname + location.search)}`} className="font-bold text-brand-ink">{t('Connectez-vous')}</Link> {t('pour retrouver vos billets dans votre espace.')}
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('Nom complet')} error={form.errors.name} required><Input {...form.bind('name')} autoComplete="name" /></Field>
              <Field label={t('Email')} error={form.errors.email} hint={t('Vos billets avec leur QR code y seront envoyés')} required><Input type="email" inputMode="email" {...form.bind('email')} autoComplete="email" /></Field>
              <Field label={t('Confirmez votre email')} error={form.errors.email2} required><Input type="email" inputMode="email" {...form.bind('email2')} autoComplete="email" onPaste={(e) => e.preventDefault()} /></Field>
              <Field label={t('Téléphone')} error={form.errors.phone} className="sm:col-span-2" hint={t('Facultatif')}>
                <Input type="tel" inputMode="tel" {...form.bind('phone')} placeholder="+509 3712 3456" autoComplete="tel" />
              </Field>
            </div>
            <p className="mt-4 flex items-start gap-2 rounded-2xl bg-canvas p-3 text-sm text-ink-soft"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-brand-ink" aria-hidden /> {t('Aucun compte n’est nécessaire : chaque billet, avec son QR code unique, arrive par email.')}</p>
            {!DEMO && (
              <div className="mt-3">
                <Toggle checked={optIn} onChange={setOptIn} label={t('Recevoir les actualités de {name}', { name: organizers.find((o) => o.id === ev.organizerId)?.name ?? '' })}
                  description={t('Facultatif. Vous pouvez vous désinscrire à tout moment depuis chaque message.')} />
              </div>
            )}
          </Card>

          {!isFree && (
            <Card>
              {step(t('Paiement'))}
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">{t('Devise')}</span>
                <Segmented label={t('Devise')} value={currency} onChange={setCurrency} options={[{ value: 'HTG', label: 'HTG' }, { value: 'USD', label: 'USD' }]} size="sm" />
              </div>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t('Moyen de paiement')}>
                {methods.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={method === m.id}
                    onClick={() => setMethod(m.id)}
                    className={cx('flex items-center gap-3 rounded-2xl border p-3 text-left transition', method === m.id ? 'border-brand bg-brand-50/60 ring-4 ring-brand/10' : 'border-line hover:border-ink/20')}
                  >
                    {m.logo ? (
                      <img src={m.logo} alt="" width={64} height={40} className="h-10 w-16 shrink-0 rounded-xl bg-white object-contain p-1 ring-1 ring-line" />
                    ) : (
                      <span aria-hidden className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-full', m.color)}><m.icon className="h-[18px] w-[18px]" /></span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold">{t(m.label)}</span>
                      <span className="block truncate text-xs text-ink-muted">{t(m.sub)}</span>
                    </span>
                    <span aria-hidden className={cx('h-5 w-5 rounded-full border-2', method === m.id ? 'border-[6px] border-brand' : 'border-line')} />
                  </button>
                ))}
              </div>

              <div className="mt-5 rounded-2xl bg-canvas p-4" aria-live="polite">
                {(method === 'moncash' || method === 'natcash' || method === 'kashpaw' || method === 'card') && (
                  <p className="flex items-start gap-2 text-sm text-ink-soft">
                    <Lock className="mt-0.5 h-4 w-4 shrink-0 text-brand-ink" aria-hidden />
                    {t('Vous serez redirigé vers la page de paiement sécurisée {name}, puis ramené ici automatiquement. Aucune donnée de paiement n’est saisie sur Event509.', { name: methods.find((x) => x.id === method)?.label ? t(methods.find((x) => x.id === method)!.label) : '' })}
                  </p>
                )}
                {method === 'paypal' && <p className="text-sm text-ink-soft">{t('Vous serez redirigé vers PayPal pour confirmer le paiement, puis ramené ici.')}</p>}
                {method === 'transfer' && (
                  <div className="space-y-1 text-sm text-ink-soft">
                    <p>{t('Effectuez le virement avec la référence de commande. Vos billets seront émis dès réception.')}</p>
                    <p><b className="text-ink">{t('Banque :')}</b> Banque de démonstration · <b className="text-ink">{t('Compte :')}</b> 000-123-4567</p>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start" aria-labelledby="h-summary">
          <Card>
            <h2 id="h-summary" className="sr-only">{t('Récapitulatif')}</h2>
            <div className="flex gap-3">
              <EventCover event={ev} className="h-16 w-16 shrink-0 rounded-2xl [&>span]:!-bottom-1 [&>span]:!text-[2.4rem]" />
              <div className="min-w-0">
                <div className="line-clamp-2 font-bold">{ev.title}</div>
                <div className="text-xs text-ink-muted first-letter:uppercase">{dateLong(ev.start, lang)} · {time(ev.start, lang)}</div>
              </div>
            </div>
            {occ && (
              <p className="mt-3 flex items-center gap-2 rounded-2xl bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-dark">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden /> {ev.sessions?.length ? occ : sessionLabel(occ)}
              </p>
            )}
            <ul className="my-4 space-y-2 border-y border-dashed border-line py-4 text-sm">
              {lines.map((l) => (
                <li key={l.tt.id} className="flex justify-between gap-2">
                  <span className="text-ink-soft">{l.qty} × {l.tt.name}</span>
                  <span className="font-semibold">{fmt(c(l.tt.price * l.qty))}</span>
                </li>
              ))}
            </ul>

            {!isFree && (
              <div className="mb-4">
                {promo ? (
                  <div className="flex items-center justify-between rounded-2xl bg-emerald-50 px-4 py-3 text-sm">
                    <span className="flex items-center gap-2 font-semibold text-emerald-700"><Tag className="h-4 w-4" aria-hidden /> {promo.code} (−{promo.type === 'percent' ? `${promo.value}%` : money(promo.value, ev.currency, lang)})</span>
                    <button type="button" aria-label={t('Retirer le code promo')} onClick={() => setPromo(null)}><X className="h-4 w-4 text-emerald-700" aria-hidden /></button>
                  </div>
                ) : (
                  <Field error={promoErr}>
                    <div className="flex gap-2">
                      <label htmlFor="promo" className="sr-only">{t('Code promo')}</label>
                      <Input id="promo" placeholder={t('Code promo')} value={promoInput} onChange={(e) => { setPromoErr(''); setPromoInput(e.target.value.toUpperCase()); }} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), applyPromo())} className="h-11 min-w-0 flex-1" />
                      <Button variant="dark" onClick={applyPromo} loading={checking}>{t('Appliquer')}</Button>
                    </div>
                  </Field>
                )}
                {DEMO && <p className="mt-1 text-[11px] text-ink-muted">{t('Démo : essayez KOMPA10 ou NOEL2026')}</p>}
              </div>
            )}

            {referrer && (
              <p className="mb-4 flex items-center gap-2 rounded-2xl bg-violet-50 px-3 py-2 text-xs text-violet-600">
                <Gift className="h-3.5 w-3.5" aria-hidden /> {t('Recommandé par {name}', { name: referrer.name })}
              </p>
            )}

            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-ink-soft">{t('Sous-total')}</dt><dd>{fmt(subtotal)}</dd></div>
              {discount > 0 && <div className="flex justify-between text-emerald-700"><dt>{t('Réduction')}</dt><dd>−{fmt(discount)}</dd></div>}
              {!isFree && fees > 0 && <div className="flex justify-between"><dt className="text-ink-soft">{t('Frais de service')}</dt><dd>{fmt(fees)}</dd></div>}
              <div className="flex items-baseline justify-between border-t border-line pt-3">
                <dt className="font-bold">{t('Total')}</dt>
                <dd className="text-2xl font-extrabold">{isFree ? t('Gratuit') : fmt(total)}</dd>
              </div>
            </dl>
            <Button type="submit" size="lg" className="mt-5 w-full" loading={paying}>
              {!paying && <Lock className="h-4 w-4" aria-hidden />}
              {isFree ? t('Confirmer la réservation') : t('Payer {amount}', { amount: fmt(total) })}
            </Button>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-ink-muted">
              <IconBadge size="sm" tone="green" className="h-5 w-5"><Lock className="h-3 w-3" /></IconBadge>
              {t('Paiement sécurisé · billet QR unique et non duplicable')}
            </p>
          </Card>
        </aside>
      </form>
    </div>
  );
}

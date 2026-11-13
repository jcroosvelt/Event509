import { VerifiedBadge } from '@/components/VerifiedBadge';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Bell, BellRing, CalendarDays, Check, Clock, Copy, Info, MapPin, Minus, MonitorPlay, Plus, Repeat, Repeat2, Share2, Users, Flag,
} from 'lucide-react';
import { getEvent, getOrganizer, listEvents, listResale, listReviews, occurrences, reportEvent } from '@/services/api';
import { useForm } from '@/lib/form';
import { reportReason } from '@/lib/labels';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { convert, cx, dateLong, dateShort, money, num, time } from '@/lib/format';
import { downloadICS } from '@/lib/export';
import { trackPixel } from '@/lib/pixels';
import { ReviewItem, Stars } from '@/components/Reviews';
import { Avatar, Badge, Button, Card, Field, IconBadge, IconButton, Loading, Modal, ProgressBar, SectionHeader, Select, Textarea, type Tone } from '@/components/ui';
import { CategoryIcon, EventCard, EventCover, FavoriteButton, categoryOf } from '@/components/events';
import { useSessionLabel } from '@/components/TicketCard';
import NotFound from './NotFound';
import type { Report, TicketType } from '@/types';

export function ticketAvailability(tt: TicketType) {
  const now = new Date();
  const left = tt.quota - tt.sold;
  if (new Date(tt.salesStart) > now) return { ok: false, label: 'Bientôt en vente', left };
  if (new Date(tt.salesEnd) < now) return { ok: false, label: 'Vente terminée', left };
  if (left <= 0) return { ok: false, label: 'Complet', left: 0 };
  if (left < 50) return { ok: true, label: 'Plus que {n}', left };
  return { ok: true, label: '', left };
}

export const kindLabel: Record<TicketType['kind'], { label: string; tone: Tone }> = {
  free: { label: 'Gratuit', tone: 'green' },
  paid: { label: 'Standard', tone: 'brand' },
  vip: { label: 'VIP', tone: 'violet' },
  early_bird: { label: 'Early bird', tone: 'orange' },
  group: { label: 'Groupe', tone: 'amber' },
};

export default function EventDetail() {
  const { slug = '' } = useParams();
  const nav = useNavigate();
  const { lang, currency, reminders, toggleReminder, follows, toggleFollow, toast, t, user } = useApp();
  const { data: ev, loading } = useAsync(() => getEvent(slug), [slug]);
  const { data: others } = useAsync(() => listEvents({ sort: 'popular' }), []);
  const { data: resale } = useAsync(() => (ev ? listResale(ev.id) : Promise.resolve([])), [ev?.id]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [occ, setOcc] = useState<string>('');
  const [shareOpen, setShareOpen] = useState(false);
  const [pic, setPic] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const report = useForm({ reason: 'misleading', details: '' }, { details: (v) => (String(v).trim().length < 10 ? t('Décrivez le problème en quelques mots (10 caractères au moins)') : undefined) });
  const sessionLabel = useSessionLabel();
  useTitle(ev?.title);

  useEffect(() => {
    if (ev) trackPixel('ViewContent', { event: ev.id });
  }, [ev]);

  const total = useMemo(() => (ev ? ev.tickets.reduce((a, x) => a + (qty[x.id] ?? 0) * x.price, 0) : 0), [ev, qty]);
  const count = Object.values(qty).reduce((a, b) => a + b, 0);

  if (loading) return <Loading />;
  if (!ev) return <NotFound />;
  // Jusqu'à 5 visuels : le premier en grand, les autres en miniatures cliquables
  const gallery = ev.images?.length ? ev.images : [];

  const org = getOrganizer(ev.organizerId);
  const occs = occurrences(ev);
  const sold = ev.tickets.reduce((a, x) => a + x.sold, 0);
  const quota = ev.tickets.reduce((a, x) => a + x.quota, 0);
  const shownPrice = (p: number) => money(Math.round(convert(p, ev.currency, currency) * 100) / 100, currency, lang);
  const reminderOn = reminders.includes(ev.id);
  const following = org ? follows.includes(org.id) : false;
  const url = `${window.location.origin}/e/${ev.slug}`;
  const needsOcc = occs.length > 0;

  const change = (tt: TicketType, d: number) => {
    setQty((q) => {
      const cur = q[tt.id] ?? 0;
      const next = Math.max(0, Math.min(cur + d, tt.maxPerOrder, ticketAvailability(tt).left));
      const others_ = Object.entries(q).filter(([k]) => k !== tt.id).reduce((a, [, v]) => a + v, 0);
      if (d > 0 && others_ + next > ev.maxPerPerson) {
        toast(t('Maximum {n} billets par personne pour cet événement', { n: ev.maxPerPerson }), 'info');
        return q;
      }
      if (d > 0 && next === cur) toast(t('Maximum {n} par commande pour ce billet', { n: Math.min(tt.maxPerOrder, ticketAvailability(tt).left) }), 'info');
      return { ...q, [tt.id]: next };
    });
  };

  const goCheckout = () => {
    if (needsOcc && !occ) {
      toast(t(ev.sessions?.length ? 'Choisissez une session' : 'Choisissez une date'), 'info');
      document.getElementById('dates')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const sel = Object.entries(qty).filter(([, n]) => n > 0).map(([id, n]) => `${id}:${n}`).join(',');
    trackPixel('InitiateCheckout', { event: ev.id, value: total, currency: ev.currency });
    nav(`/e/${ev.slug}/achat?t=${sel}${occ ? `&s=${encodeURIComponent(occ)}` : ''}`);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:pt-8">
      <EventCover event={gallery.length > 1 ? { ...ev, cover: gallery[Math.min(pic, gallery.length - 1)]! } : ev} className="relative -mx-4 h-72 sm:mx-0 sm:h-[420px] sm:rounded-4xl">
        <div className="absolute inset-0 bg-gradient-to-t from-navy/70 via-transparent to-transparent" />
        <div className="absolute inset-x-4 top-4 flex justify-between">
          <IconButton label={t('Retour')} onClick={() => (history.length > 1 ? nav(-1) : nav('/explorer'))} className="border-0 bg-surface/90 backdrop-blur">
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </IconButton>
          <div className="flex gap-2">
            <IconButton label={t('Partager')} onClick={() => setShareOpen(true)} className="border-0 bg-surface/90 backdrop-blur">
              <Share2 className="h-[18px] w-[18px]" aria-hidden />
            </IconButton>
            <FavoriteButton eventId={ev.id} className="h-11 w-11" />
          </div>
        </div>
        <div className="absolute bottom-5 left-5 right-5 flex flex-wrap gap-2">
          {ev.categories.map((c) => (
            <Badge key={c} className="!bg-surface/90 text-ink"><CategoryIcon id={c} className="h-3.5 w-3.5" /> {t(categoryOf(c)?.label ?? '')}</Badge>
          ))}
          {ev.tags?.map((tg) => <Badge key={tg} className="!bg-navy/70 !text-white backdrop-blur">{tg}</Badge>)}
        </div>
      </EventCover>
      {gallery.length > 1 && (
        <ul className="mt-3 flex gap-2 overflow-x-auto" aria-label={t('Visuels de l’événement')}>
          {gallery.map((u, i) => (
            <li key={u} className="shrink-0">
              <button type="button" aria-label={t('Voir le visuel {n}', { n: i + 1 })} aria-current={i === pic} onClick={() => setPic(i)} className={cx('block overflow-hidden rounded-2xl ring-offset-2 ring-offset-canvas transition', i === pic ? 'ring-2 ring-brand' : 'opacity-80 hover:opacity-100')}>
                <img src={u} alt="" width={96} height={72} className="h-[72px] w-24 object-cover" loading="lazy" decoding="async" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_400px]">
        <div className="min-w-0 space-y-6">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{ev.title}</h1>
            {org && (
              <div className="mt-4 flex items-center gap-3">
                <Avatar name={org.avatar} src={org.logo} size={40} />
                <div className="min-w-0">
                  <Link to={`/o/${org.slug}`} className="flex items-center gap-1 text-sm font-bold hover:text-brand-ink">
                    {org.name} {org.verified && <VerifiedBadge size={18} />}
                  </Link>
                  <div className="text-xs text-ink-muted">{t('{n} abonnés', { n: num(org.followers + (following ? 1 : 0), lang) })} · {t('{n} événements', { n: org.eventsCount })}</div>
                </div>
                <Button
                  size="sm"
                  variant={following ? 'soft' : 'outline'}
                  className="ml-auto"
                  aria-pressed={following}
                  onClick={() => {
                    toggleFollow(org.id);
                    toast(following ? t('Vous ne suivez plus {name}', { name: org.name }) : t('Vous suivez {name}. Vous serez prévenu de ses nouveaux événements.', { name: org.name }));
                  }}
                >
                  {following && <Check className="h-4 w-4" aria-hidden />} {following ? t('Abonné') : t('Suivre')}
                </Button>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Card className="flex items-start gap-3 p-4">
              <IconBadge tone="brand"><CalendarDays className="h-[18px] w-[18px]" /></IconBadge>
              <div>
                <div className="text-sm font-bold first-letter:uppercase">{dateLong(ev.start, lang)}</div>
                <div className="text-sm text-ink-muted">{time(ev.start, lang)} – {time(ev.end, lang)}</div>
                {ev.recurring && <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-brand-ink"><Repeat className="h-3 w-3" aria-hidden /> {ev.recurring === 'weekly' ? t('Chaque semaine') : t('Chaque mois')}</div>}
              </div>
            </Card>
            <Card className="flex items-start gap-3 p-4">
              <IconBadge tone={ev.venue ? 'orange' : 'violet'}>{ev.venue ? <MapPin className="h-[18px] w-[18px]" /> : <MonitorPlay className="h-[18px] w-[18px]" />}</IconBadge>
              <div className="min-w-0">
                <div className="text-sm font-bold">{ev.venue?.name ?? t('En ligne — {platform}', { platform: ev.online?.platform ?? '' })}</div>
                <div className="text-sm text-ink-muted">{ev.venue ? `${ev.venue.address}, ${ev.venue.city}` : t('Lien envoyé après inscription')}</div>
                {ev.venue && (
                  <a className="mt-1 inline-block text-xs font-semibold text-brand-ink" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${ev.venue.name} ${ev.venue.city}`)}`}>
                    {t('Ouvrir dans Maps')}<span className="sr-only"> ({t('nouvel onglet')})</span>
                  </a>
                )}
              </div>
            </Card>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant={reminderOn ? 'soft' : 'outline'}
              size="sm"
              aria-pressed={reminderOn}
              onClick={() => {
                toggleReminder(ev.id);
                toast(reminderOn ? t('Rappel retiré') : t('Rappel activé : notification 24 h avant le début'));
              }}
            >
              {reminderOn ? <BellRing className="h-4 w-4" aria-hidden /> : <Bell className="h-4 w-4" aria-hidden />} {reminderOn ? t('Rappel activé') : t('Me rappeler')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadICS({ title: ev.title, start: ev.start, end: ev.end, location: ev.venue ? `${ev.venue.name}, ${ev.venue.city}` : ev.online?.url, description: ev.description })}
            >
              <CalendarDays className="h-4 w-4" aria-hidden /> {t('Ajouter au calendrier')}
            </Button>
            <Button variant="ghost" size="sm" className="text-ink-soft" onClick={() => (user ? (report.reset(), setReportOpen(true)) : nav(`/connexion?next=${encodeURIComponent(location.pathname)}`))}>
              <Flag className="h-4 w-4" aria-hidden /> {t('Signaler')}
            </Button>
          </div>

          <section aria-labelledby="h-about">
            <SectionHeader id="h-about" title={t('À propos')} />
            <p className="whitespace-pre-line leading-relaxed text-ink-soft">{ev.description}</p>
          </section>

          {needsOcc && (
            <section id="dates" aria-labelledby="h-dates">
              <SectionHeader id="h-dates" title={ev.sessions?.length ? t('Programme') : t('Dates')} />
              <div className="grid gap-2" role="radiogroup" aria-labelledby="h-dates">
                {occs.map((s, i) => {
                  const on = occ === s.label;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setOcc(s.label)}
                      className={cx('flex items-center gap-4 rounded-3xl border bg-surface p-4 text-left shadow-card transition', on ? 'border-brand ring-4 ring-brand/10' : 'border-transparent hover:border-line')}
                    >
                      <span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-2xl font-extrabold', on ? 'bg-brand text-white' : 'bg-brand-100 text-brand-dark')}>{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold first-letter:uppercase">{ev.sessions?.length ? s.label : dateLong(s.start, lang)}</span>
                        <span className="flex items-center gap-1 text-sm text-ink-muted">
                          <Clock className="h-3.5 w-3.5" aria-hidden />
                          {ev.sessions?.length ? `${dateShort(s.start, lang)} · ` : ''}{time(s.start, lang)}–{time(s.end, lang)}
                        </span>
                      </span>
                      {on && <Check className="h-5 w-5 text-brand-ink" aria-hidden />}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {ev.online && (
            <Card className="flex items-start gap-3 !bg-violet-50/60">
              <IconBadge tone="violet"><MonitorPlay className="h-[18px] w-[18px]" /></IconBadge>
              <div>
                <div className="font-bold">{t('Diffusion en direct sur {platform}', { platform: ev.online.platform })}</div>
                <p className="text-sm text-ink-soft">{t('Le lien de streaming privé apparaît dans votre billet et vous est envoyé par email et WhatsApp 1 h avant le début.')}</p>
              </div>
            </Card>
          )}

          <Card className="flex items-center gap-4">
            <IconBadge tone="green"><Users className="h-[18px] w-[18px]" /></IconBadge>
            <div className="flex-1">
              <div className="mb-2 flex justify-between text-sm"><span className="font-semibold">{t('Taux de remplissage')}</span><span className="text-ink-muted">{Math.round((sold / quota) * 100)}%</span></div>
              <ProgressBar value={sold / quota} tone="green" label={t('Taux de remplissage')} />
            </div>
          </Card>

          <ReviewsSection eventId={ev.id} />

          {resale && resale.length > 0 && (
            <Card className="flex flex-wrap items-center gap-4">
              <IconBadge tone="amber"><Repeat2 className="h-[18px] w-[18px]" /></IconBadge>
              <div className="min-w-0 flex-1">
                <div className="font-bold">{resale.length > 1 ? t('{n} billets en revente', { n: resale.length }) : t('{n} billet en revente', { n: resale.length })}</div>
                <p className="text-sm text-ink-soft">{t('Revente sécurisée entre participants, au prix maximum du billet.')}</p>
              </div>
              <Link to={`/revente?e=${ev.id}`} className="text-sm font-semibold text-brand-ink">{t('Voir les offres')}</Link>
            </Card>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start" aria-labelledby="h-tickets">
          <Card className="p-5">
            <h2 id="h-tickets" className="mb-1 text-lg font-bold">{t('Billets')}</h2>
            <p className="mb-4 flex items-center gap-1 text-xs text-ink-muted"><Info className="h-3.5 w-3.5" aria-hidden /> {t('Maximum {n} billets par personne', { n: ev.maxPerPerson })}{ev.seated && ` · ${t('places numérotées')}`}</p>
            {needsOcc && (
              <p className={cx('mb-4 rounded-2xl px-3 py-2 text-xs font-semibold', occ ? 'bg-brand-50 text-brand-dark' : 'bg-amber-50 text-amber-700')}>
                {occ ? `${t('Pour')} ${ev.sessions?.length ? occ : sessionLabel(occ)}` : t(ev.sessions?.length ? 'Choisissez une session dans le programme' : 'Choisissez une date dans la liste')}
              </p>
            )}
            <ul className="space-y-3">
              {ev.tickets.map((tt) => {
                const a = ticketAvailability(tt);
                const q = qty[tt.id] ?? 0;
                return (
                  <li key={tt.id} className={cx('rounded-2xl border p-4 transition', q > 0 ? 'border-brand bg-brand-50/50' : 'border-line', !a.ok && 'bg-canvas')}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold">{tt.name}</span>
                          <Badge tone={kindLabel[tt.kind].tone}>{t(kindLabel[tt.kind].label)}</Badge>
                        </div>
                        {tt.description && <p className="mt-1 text-xs text-ink-muted">{tt.description}</p>}
                        <div className="mt-2 text-lg font-extrabold">{shownPrice(tt.price)}</div>
                        {a.label && <div className={cx('text-xs font-semibold', a.ok ? 'text-orange-700' : 'text-ink-soft')}>{t(a.label, { n: a.left })}</div>}
                      </div>
                      {a.ok && (
                        <div className="flex items-center gap-2" role="group" aria-label={t('Quantité {name}', { name: tt.name })}>
                          <button type="button" aria-label={t('Retirer un billet {name}', { name: tt.name })} onClick={() => change(tt, -1)} disabled={!q} className="grid h-9 w-9 place-items-center rounded-full bg-canvas disabled:opacity-40">
                            <Minus className="h-4 w-4" aria-hidden />
                          </button>
                          <output aria-live="polite" className="w-5 text-center font-bold tabular-nums">{q}</output>
                          <button type="button" aria-label={t('Ajouter un billet {name}', { name: tt.name })} onClick={() => change(tt, 1)} className="grid h-9 w-9 place-items-center rounded-full bg-contrast text-on-contrast">
                            <Plus className="h-4 w-4" aria-hidden />
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {currency !== ev.currency && <p className="mt-3 text-xs text-ink-muted">{t('Prix affichés en {cur} (prix d’origine en {orig}).', { cur: currency, orig: ev.currency })}</p>}
            <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
              <span className="text-sm text-ink-soft">{count > 1 ? t('{n} billets', { n: count }) : t('{n} billet', { n: count })}</span>
              <span className="text-xl font-extrabold">{count ? shownPrice(total) : '—'}</span>
            </div>
            <Button size="lg" className="mt-4 w-full" onClick={() => (count ? goCheckout() : toast(t('Choisissez au moins un billet'), 'info'))}>
              {total === 0 && count ? t('Réserver gratuitement') : t('Continuer')}
            </Button>
          </Card>
        </aside>
      </div>

      <section aria-labelledby="h-more" className="mt-12">
        <SectionHeader id="h-more" title={t('Vous aimerez aussi')} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(others ?? []).filter((e) => e.id !== ev.id).slice(0, 4).map((e) => <EventCard key={e.id} event={e} />)}
        </div>
      </section>

      {count > 0 && (
        <div className="fixed inset-x-4 bottom-24 z-20 flex items-center gap-3 rounded-full bg-contrast p-2 pl-6 text-on-contrast shadow-2xl lg:hidden">
          <span className="flex-1 font-bold">{shownPrice(total)}</span>
          <Button onClick={goCheckout}>{t('Continuer')}</Button>
        </div>
      )}

      <Modal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title={t('Signaler cet événement')}
        description={t('L’équipe Event509 examine chaque signalement. L’organisateur ne voit pas votre nom.')}
        size="sm"
        footer={
          <Button
            className="flex-1"
            loading={reporting}
            onClick={async () => {
              if (!report.validate()) return;
              setReporting(true);
              await reportEvent(ev.id, report.values.reason as Report['reason'], report.values.details.trim(), user!.name);
              setReporting(false);
              setReportOpen(false);
              toast(t('Merci, votre signalement a été envoyé à l’équipe Event509'));
            }}
          >
            {t('Envoyer le signalement')}
          </Button>
        }
      >
        <form noValidate onSubmit={(e) => e.preventDefault()} className="space-y-4">
          <Field label={t('Motif')}>
            <Select {...report.bind('reason')}>
              {(Object.keys(reportReason) as Report['reason'][]).map((r) => <option key={r} value={r}>{t(reportReason[r])}</option>)}
            </Select>
          </Field>
          <Field label={t('Détails')} error={report.errors.details} required><Textarea placeholder={t('Ce qui ne va pas, et comment vous l’avez constaté…')} {...report.bind('details')} /></Field>
        </form>
      </Modal>

      <Modal open={shareOpen} onClose={() => setShareOpen(false)} title={t('Partager l’événement')} size="sm">
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-2xl bg-canvas p-2 pl-4">
            <span className="flex-1 truncate text-sm text-ink-soft">{url}</span>
            <Button size="sm" variant="dark" onClick={() => navigator.clipboard?.writeText(url).then(() => toast(t('Lien copié')), () => toast(t('Copie impossible : sélectionnez le lien manuellement'), 'error'))}>
              <Copy className="h-4 w-4" aria-hidden /> {t('Copier')}
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { n: 'WhatsApp', h: `https://wa.me/?text=${encodeURIComponent(`${ev.title} ${url}`)}` },
              { n: 'Facebook', h: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
              { n: 'X', h: `https://twitter.com/intent/tweet?text=${encodeURIComponent(ev.title)}&url=${encodeURIComponent(url)}` },
            ].map((s) => (
              <a key={s.n} href={s.h} target="_blank" rel="noreferrer" className="rounded-2xl bg-canvas py-3 text-center text-sm font-semibold hover:bg-brand-50">
                {s.n}<span className="sr-only"> ({t('nouvel onglet')})</span>
              </a>
            ))}
          </div>
          {'share' in navigator && (
            <Button variant="soft" className="w-full" onClick={() => navigator.share({ title: ev.title, url }).catch(() => {})}>
              {t('Autres applications…')}
            </Button>
          )}
        </div>
      </Modal>
    </div>
  );
}

/** Note moyenne et avis des participants (visible dès qu'il y en a). */
function ReviewsSection({ eventId }: { eventId: string }) {
  const { t, lang } = useApp();
  const { data } = useAsync(() => listReviews(eventId), [eventId]);
  if (!data || !data.count) return null;
  return (
    <section aria-labelledby="h-reviews">
      <SectionHeader id="h-reviews" title={t('Avis des participants')} />
      <div className="mb-3 flex items-center gap-3">
        <span className="text-3xl font-extrabold">{data.average.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US')}</span>
        <Stars value={data.average} size={20} label={t('{n} sur 5', { n: data.average })} />
        <span className="text-sm text-ink-muted">{data.count > 1 ? t('{n} avis', { n: data.count }) : t('1 avis')}</span>
      </div>
      <ul className="space-y-3">{data.items.slice(0, 5).map((r) => <ReviewItem key={r.id} r={r} lang={lang} />)}</ul>
    </section>
  );
}

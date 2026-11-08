import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, BadgeCheck, Bell, BellRing, CalendarDays, Clock, Copy, Info, MapPin, Minus, MonitorPlay, Plus, Repeat, Share2, Users,
} from 'lucide-react';
import { getEvent, getOrganizer, listEvents } from '@/services/api';
import { useAsync } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { convert, cx, dateLong, money, num, time } from '@/lib/format';
import { downloadICS } from '@/lib/export';
import { trackPixel } from '@/lib/pixels';
import { Avatar, Badge, Button, Card, IconBadge, IconButton, Loading, Modal, ProgressBar, SectionHeader } from '@/components/ui';
import { EventCard, EventCover, FavoriteButton, categoryOf } from '@/components/events';
import type { TicketType } from '@/types';

const NOW = new Date('2026-11-08T12:00:00');

export function ticketAvailability(t: TicketType) {
  const left = t.quota - t.sold;
  if (new Date(t.salesStart) > NOW) return { ok: false, label: 'Bientôt en vente', left };
  if (new Date(t.salesEnd) < NOW) return { ok: false, label: 'Vente terminée', left };
  if (left <= 0) return { ok: false, label: 'Complet', left: 0 };
  return { ok: true, label: left < 50 ? `Plus que ${left}` : '', left };
}

const kindLabel: Record<TicketType['kind'], { label: string; tone: 'brand' | 'green' | 'violet' | 'orange' | 'amber' }> = {
  free: { label: 'Gratuit', tone: 'green' },
  paid: { label: 'Standard', tone: 'brand' },
  vip: { label: 'VIP', tone: 'violet' },
  early_bird: { label: 'Early bird', tone: 'orange' },
  group: { label: 'Groupe', tone: 'amber' },
};

export default function EventDetail() {
  const { slug = '' } = useParams();
  const nav = useNavigate();
  const { lang, currency, reminders, toggleReminder, toast } = useApp();
  const { data: ev, loading } = useAsync(() => getEvent(slug), [slug]);
  const { data: others } = useAsync(() => listEvents({ sort: 'popular' }), []);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [shareOpen, setShareOpen] = useState(false);

  const total = useMemo(() => {
    if (!ev) return 0;
    return ev.tickets.reduce((a, t) => a + (qty[t.id] ?? 0) * t.price, 0);
  }, [ev, qty]);
  const count = Object.values(qty).reduce((a, b) => a + b, 0);

  if (loading) return <Loading />;
  if (!ev)
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">Événement introuvable</h1>
        <Link to="/explorer" className="mt-4 inline-block font-semibold text-brand">Explorer les événements</Link>
      </div>
    );

  const org = getOrganizer(ev.organizerId);
  const sold = ev.tickets.reduce((a, t) => a + t.sold, 0);
  const quota = ev.tickets.reduce((a, t) => a + t.quota, 0);
  const shownPrice = (p: number) => money(Math.round(convert(p, ev.currency, currency) * 100) / 100, currency, lang);
  const reminderOn = reminders.includes(ev.id);
  const url = typeof window !== 'undefined' ? `${window.location.origin}/e/${ev.slug}` : '';

  const change = (t: TicketType, d: number) => {
    setQty((q) => {
      const cur = q[t.id] ?? 0;
      const next = Math.max(0, Math.min(cur + d, t.maxPerOrder, ticketAvailability(t).left));
      // limite d'achat par personne (toutes catégories confondues)
      const others_ = Object.entries(q).filter(([k]) => k !== t.id).reduce((a, [, v]) => a + v, 0);
      if (d > 0 && others_ + next > ev.maxPerPerson) {
        toast(`Limite de ${ev.maxPerPerson} billets par personne`, 'error');
        return q;
      }
      return { ...q, [t.id]: next };
    });
  };

  const goCheckout = () => {
    const sel = Object.entries(qty).filter(([, n]) => n > 0).map(([id, n]) => `${id}:${n}`).join(',');
    trackPixel('InitiateCheckout', { event: ev.id, value: total, currency: ev.currency });
    nav(`/e/${ev.slug}/achat?t=${sel}`);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:pt-8">
      {/* Visuel */}
      <EventCover event={ev} className="relative -mx-4 h-72 sm:mx-0 sm:h-[420px] sm:rounded-4xl">
        <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-transparent" />
        <div className="absolute inset-x-4 top-4 flex justify-between">
          <IconButton label="Retour" onClick={() => nav(-1)} className="border-0 bg-white/90 backdrop-blur">
            <ArrowLeft className="h-5 w-5" />
          </IconButton>
          <div className="flex gap-2">
            <IconButton label="Partager" onClick={() => setShareOpen(true)} className="border-0 bg-white/90 backdrop-blur">
              <Share2 className="h-[18px] w-[18px]" />
            </IconButton>
            <FavoriteButton eventId={ev.id} className="h-11 w-11" />
          </div>
        </div>
        <div className="absolute bottom-5 left-5 right-5 flex flex-wrap gap-2">
          {ev.categories.map((c) => (
            <Badge key={c} className="bg-white/90 text-ink">{categoryOf(c)?.emoji} {categoryOf(c)?.label}</Badge>
          ))}
          {ev.tags?.map((tg) => <Badge key={tg} className="bg-ink/70 text-white backdrop-blur">{tg}</Badge>)}
        </div>
      </EventCover>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_400px]">
        <div className="min-w-0 space-y-6">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{ev.title}</h1>
            {org && (
              <div className="mt-4 flex items-center gap-3">
                <Avatar name={org.avatar} size={40} />
                <div>
                  <div className="flex items-center gap-1 text-sm font-bold">
                    {org.name} {org.verified && <BadgeCheck className="h-4 w-4 text-brand" aria-label="Organisateur vérifié" />}
                  </div>
                  <div className="text-xs text-ink-muted">{num(org.followers, lang)} abonnés · {org.eventsCount} événements</div>
                </div>
                <Button size="sm" variant="outline" className="ml-auto" onClick={() => toast(`Vous suivez ${org.name}`)}>Suivre</Button>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Card className="flex items-start gap-3 p-4">
              <IconBadge tone="brand"><CalendarDays className="h-[18px] w-[18px]" /></IconBadge>
              <div>
                <div className="text-sm font-bold capitalize">{dateLong(ev.start, lang)}</div>
                <div className="text-sm text-ink-muted">{time(ev.start, lang)} – {time(ev.end, lang)}</div>
                {ev.recurring && <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-brand"><Repeat className="h-3 w-3" /> Chaque {ev.recurring === 'weekly' ? 'semaine' : 'mois'}</div>}
              </div>
            </Card>
            <Card className="flex items-start gap-3 p-4">
              <IconBadge tone={ev.venue ? 'orange' : 'violet'}>{ev.venue ? <MapPin className="h-[18px] w-[18px]" /> : <MonitorPlay className="h-[18px] w-[18px]" />}</IconBadge>
              <div className="min-w-0">
                <div className="text-sm font-bold">{ev.venue?.name ?? `En ligne — ${ev.online?.platform}`}</div>
                <div className="text-sm text-ink-muted">{ev.venue ? `${ev.venue.address}, ${ev.venue.city}` : 'Lien envoyé après inscription'}</div>
                {ev.venue && (
                  <a className="mt-1 inline-block text-xs font-semibold text-brand" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${ev.venue.name} ${ev.venue.city}`)}`}>
                    Ouvrir dans Maps
                  </a>
                )}
              </div>
            </Card>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant={reminderOn ? 'soft' : 'outline'}
              size="sm"
              onClick={() => {
                toggleReminder(ev.id);
                toast(reminderOn ? 'Rappel retiré' : 'Rappel activé — notification 24 h avant');
              }}
            >
              {reminderOn ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />} {reminderOn ? 'Rappel activé' : 'Me rappeler'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadICS({ title: ev.title, start: ev.start, end: ev.end, location: ev.venue ? `${ev.venue.name}, ${ev.venue.city}` : ev.online?.url, description: ev.description })}
            >
              <CalendarDays className="h-4 w-4" /> Ajouter au calendrier
            </Button>
          </div>

          <section>
            <SectionHeader title="À propos" />
            <p className="whitespace-pre-line leading-relaxed text-ink-soft">{ev.description}</p>
          </section>

          {ev.sessions && (
            <section>
              <SectionHeader title="Programme" />
              <div className="space-y-2">
                {ev.sessions.map((s, i) => (
                  <Card key={s.id} className="flex items-center gap-4 p-4">
                    <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-100 font-extrabold text-brand-dark">{i + 1}</span>
                    <div>
                      <div className="font-semibold">{s.label}</div>
                      <div className="flex items-center gap-1 text-sm text-ink-muted"><Clock className="h-3.5 w-3.5" /> {dateLong(s.start, lang)} · {time(s.start, lang)}–{time(s.end, lang)}</div>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {ev.online && (
            <Card className="flex items-start gap-3 bg-violet-50/60">
              <IconBadge tone="violet"><MonitorPlay className="h-[18px] w-[18px]" /></IconBadge>
              <div>
                <div className="font-bold">Diffusion en direct sur {ev.online.platform}</div>
                <p className="text-sm text-ink-soft">Le lien de streaming privé apparaît dans votre billet et vous est envoyé par email et WhatsApp 1 h avant le début.</p>
              </div>
            </Card>
          )}

          <Card className="flex items-center gap-4">
            <IconBadge tone="green"><Users className="h-[18px] w-[18px]" /></IconBadge>
            <div className="flex-1">
              <div className="mb-2 flex justify-between text-sm"><span className="font-semibold">Taux de remplissage</span><span className="text-ink-muted">{Math.round((sold / quota) * 100)}%</span></div>
              <ProgressBar value={sold / quota} tone="green" />
            </div>
          </Card>
        </div>

        {/* Billets */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <h2 className="mb-1 text-lg font-bold">Billets</h2>
            <p className="mb-4 flex items-center gap-1 text-xs text-ink-muted"><Info className="h-3.5 w-3.5" /> Maximum {ev.maxPerPerson} billets par personne{ev.seated && ' · places numérotées'}</p>
            <div className="space-y-3">
              {ev.tickets.map((t) => {
                const a = ticketAvailability(t);
                const q = qty[t.id] ?? 0;
                return (
                  <div key={t.id} className={cx('rounded-2xl border p-4 transition', q > 0 ? 'border-brand bg-brand-50/50' : 'border-line', !a.ok && 'opacity-60')}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold">{t.name}</span>
                          <Badge tone={kindLabel[t.kind].tone}>{kindLabel[t.kind].label}</Badge>
                        </div>
                        {t.description && <p className="mt-1 text-xs text-ink-muted">{t.description}</p>}
                        <div className="mt-2 text-lg font-extrabold">{shownPrice(t.price)}</div>
                        {a.label && <div className={cx('text-xs font-semibold', a.ok ? 'text-orange-500' : 'text-ink-muted')}>{a.label}</div>}
                      </div>
                      {a.ok && (
                        <div className="flex items-center gap-2">
                          <button aria-label={`Retirer ${t.name}`} onClick={() => change(t, -1)} disabled={!q} className="grid h-9 w-9 place-items-center rounded-full bg-canvas disabled:opacity-40">
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className="w-5 text-center font-bold tabular-nums">{q}</span>
                          <button aria-label={`Ajouter ${t.name}`} onClick={() => change(t, 1)} className="grid h-9 w-9 place-items-center rounded-full bg-ink text-white">
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {currency !== ev.currency && <p className="mt-3 text-xs text-ink-muted">Prix affichés en {currency} (prix d’origine en {ev.currency}).</p>}
            <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
              <span className="text-sm text-ink-soft">{count} billet{count > 1 ? 's' : ''}</span>
              <span className="text-xl font-extrabold">{count ? shownPrice(total) : '—'}</span>
            </div>
            <Button size="lg" className="mt-4 w-full" disabled={!count} onClick={goCheckout}>
              {total === 0 && count ? 'Réserver gratuitement' : 'Continuer'}
            </Button>
          </Card>
        </aside>
      </div>

      {/* Suggestions */}
      <section className="mt-12">
        <SectionHeader title="Vous aimerez aussi" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(others ?? []).filter((e) => e.id !== ev.id).slice(0, 4).map((e) => <EventCard key={e.id} event={e} />)}
        </div>
      </section>

      {/* Barre d'achat mobile */}
      {count > 0 && (
        <div className="fixed inset-x-4 bottom-24 z-20 flex items-center gap-3 rounded-full bg-ink p-2 pl-6 text-white shadow-2xl lg:hidden">
          <span className="flex-1 font-bold">{shownPrice(total)}</span>
          <Button onClick={goCheckout}>Continuer</Button>
        </div>
      )}

      <Modal open={shareOpen} onClose={() => setShareOpen(false)} title="Partager l’événement" size="sm">
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-2xl bg-canvas p-2 pl-4">
            <span className="flex-1 truncate text-sm text-ink-soft">{url}</span>
            <Button size="sm" variant="dark" onClick={() => { navigator.clipboard?.writeText(url); toast('Lien copié'); }}>
              <Copy className="h-4 w-4" /> Copier
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { n: 'WhatsApp', h: `https://wa.me/?text=${encodeURIComponent(`${ev.title} ${url}`)}` },
              { n: 'Facebook', h: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
              { n: 'X', h: `https://twitter.com/intent/tweet?text=${encodeURIComponent(ev.title)}&url=${encodeURIComponent(url)}` },
            ].map((s) => (
              <a key={s.n} href={s.h} target="_blank" rel="noreferrer" className="rounded-2xl bg-canvas py-3 text-center text-sm font-semibold hover:bg-brand-50">
                {s.n}
              </a>
            ))}
          </div>
          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <Button variant="soft" className="w-full" onClick={() => navigator.share({ title: ev.title, url }).catch(() => {})}>
              Autres applications…
            </Button>
          )}
        </div>
      </Modal>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Copy, Eye, ImagePlus, Info, MapPin, MonitorPlay, Plus, Radio, Trash2 } from 'lucide-react';
import { categories, organizers } from '@/data/mock';
import { getEvent, rowLetter, saveEvent, seatMapOf } from '@/services/api';
import { useApp } from '@/store/app';
import { useTitle } from '@/lib/hooks';
import { cx, uid } from '@/lib/format';
import { orgOf } from '@/lib/permissions';
import { Badge, Button, Card, Field, Input, Loading, Segmented, Select, Textarea, Toggle } from '@/components/ui';
import { EventCard } from '@/components/events';
import { SeatMap } from '@/components/SeatMap';
import NotFound from '../public/NotFound';
import type { CategoryId, Currency, EventItem, SeatMapConfig, Session, TicketKind, TicketType } from '@/types';

const covers = [
  'linear-gradient(135deg, #1F5EFF 0%, #0B1533 100%)',
  'linear-gradient(135deg, #FF8A3D 0%, #E5487A 55%, #5B2BC9 100%)',
  'linear-gradient(135deg, #0FA37F 0%, #0B6B60 55%, #0B1533 100%)',
  'linear-gradient(135deg, #7C5CFF 0%, #1F5EFF 100%)',
  'linear-gradient(135deg, #F4B740 0%, #E07A1F 55%, #7A2E0E 100%)',
  'linear-gradient(135deg, #FF5E7E 0%, #7C3AED 55%, #0B1533 100%)',
];

const kinds: { v: TicketKind; l: string }[] = [
  { v: 'paid', l: 'Payant' }, { v: 'free', l: 'Gratuit' }, { v: 'vip', l: 'VIP' }, { v: 'early_bird', l: 'Early bird' }, { v: 'group', l: 'Groupe' },
];

/** Date locale « yyyy-mm-ddThh:mm » dans `days` jours à l'heure `h`. */
const inDays = (days: number, h = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(h, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00`;
};

const blank = (orgId: string): EventItem => ({
  id: `e${Date.now()}`, slug: '', title: '', description: '', cover: covers[0], categories: [],
  start: inDays(30, 19), end: inDays(30, 23), sessions: [], recurring: null,
  venue: { name: '', address: '', city: 'Port-au-Prince' }, online: null, currency: 'HTG',
  tickets: [{ id: uid('t'), name: 'Standard', kind: 'paid', price: 1000, quota: 200, sold: 0, salesStart: inDays(0), salesEnd: inDays(30, 18), maxPerOrder: 6 }],
  organizerId: orgId, status: 'draft', seated: false, maxPerPerson: 6, views: 0,
});

const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const local = (iso: string) => iso.slice(0, 16);

const steps = ['Informations', 'Date & lieu', 'Billets', 'Page & suivi', 'Publication'];

export default function EventEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const { toast, t, user } = useApp();
  const orgId = orgOf(user);
  const verified = organizers.find((o) => o.id === orgId)?.verified;
  const [ev, setEv] = useState<EventItem | null>(id ? null : blank(orgId));
  const [missing, setMissing] = useState(false);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<'venue' | 'online' | 'hybrid'>('venue');
  const [multi, setMulti] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useTitle(id ? t('Modifier l’événement') : t('Nouvel événement'));

  useEffect(() => {
    if (!id) return;
    getEvent(id).then((e) => {
      if (!e) return setMissing(true);
      setEv({ ...e, start: local(e.start), end: local(e.end) });
      setMode(e.venue && e.online ? 'hybrid' : e.online ? 'online' : 'venue');
      setMulti(!!e.sessions?.length);
    });
  }, [id]);

  // Prévenir la perte des modifications non enregistrées
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  if (missing) return <NotFound />;
  if (!ev) return <Loading />;

  const up = (p: Partial<EventItem>) => {
    setDirty(true);
    setEv((e) => (e ? { ...e, ...p } : e));
    // Corriger un champ efface son erreur
    setErrors((er) => {
      const n = { ...er };
      Object.keys(p).forEach((k) => delete n[k]);
      return n;
    });
  };
  const upT = (tid: string, p: Partial<TicketType>) => {
    up({ tickets: ev.tickets.map((x) => (x.id === tid ? { ...x, ...p } : x)) });
    setErrors((er) => ({ ...er, [`t-${tid}`]: '' }));
  };
  const upS = (sid: string, p: Partial<Session>) => up({ sessions: (ev.sessions ?? []).map((s) => (s.id === sid ? { ...s, ...p } : s)) });
  const map: SeatMapConfig = seatMapOf(ev);
  const upMap = (p: Partial<SeatMapConfig>) => up({ seatMap: { ...map, ...p } });

  const validate = (upTo: number) => {
    const e: Record<string, string> = {};
    if (upTo >= 0) {
      if (ev.title.trim().length < 4) e.title = t('Donnez un titre d’au moins 4 caractères');
      if (ev.description.trim().length < 20) e.description = t('Décrivez l’événement en 20 caractères au moins');
      if (!ev.categories.length) e.categories = t('Choisissez au moins une catégorie');
    }
    if (upTo >= 1) {
      if (mode !== 'online' && !ev.venue?.name?.trim()) e.venue = t('Indiquez le nom du lieu');
      if (mode !== 'venue' && !/^https?:\/\/\S+/.test(ev.online?.url ?? '')) e.online = t('Saisissez un lien commençant par https://');
      if (ev.end <= ev.start) e.end = t('La fin doit être après le début');
    }
    if (upTo >= 2) {
      if (!ev.tickets.length) e.tickets = t('Ajoutez au moins un type de billet');
      ev.tickets.forEach((x) => {
        if (!x.name.trim()) e[`t-${x.id}`] = t('Donnez un nom à ce billet');
        else if (x.quota < 1) e[`t-${x.id}`] = t('Le quota doit être d’au moins 1');
        else if (x.salesEnd <= x.salesStart) e[`t-${x.id}`] = t('La fin des ventes doit être après leur début');
      });
      if (ev.seated && ev.tickets.some((x) => !map.zones.some((z) => z.ticketTypeId === x.id))) e.seatMap = t('Attribuez une zone du plan à chaque type de billet');
    }
    setErrors(e);
    const first = Object.keys(e)[0];
    if (first) {
      // Amener l'utilisateur au premier champ à corriger
      const stepOf = (k: string) => (['title', 'description', 'categories'].includes(k) ? 0 : ['venue', 'online', 'end'].includes(k) ? 1 : 2);
      setStep(stepOf(first));
      setTimeout(() => document.querySelector<HTMLElement>(`[data-field="${first}"] input, [data-field="${first}"] textarea, [data-field="${first}"] button, [data-field="${first}"]`)?.focus(), 50);
    }
    return !first;
  };

  const next = () => {
    if (validate(step)) setStep((s) => Math.min(steps.length - 1, s + 1));
  };

  const save = async (status: EventItem['status']) => {
    if (status !== 'draft' && !validate(3)) return;
    setSaving(true);
    const out: EventItem = {
      ...ev,
      slug: ev.slug || slugify(ev.title) || ev.id,
      start: `${local(ev.start)}:00`,
      end: `${local(ev.end)}:00`,
      venue: mode === 'online' ? null : ev.venue,
      online: mode === 'venue' ? null : ev.online,
      sessions: multi ? ev.sessions : [],
      seatMap: ev.seated ? map : undefined,
      categories: mode !== 'venue' && !ev.categories.includes('online') ? [...ev.categories, 'online'] : ev.categories,
      status,
    };
    try {
      await saveEvent(out);
      setDirty(false);
      toast(status === 'draft' ? t('Brouillon enregistré') : status === 'pending' ? t('Envoyé en validation : publication sous 24 h') : t('Événement publié !'));
      nav('/organisateur/evenements');
    } catch {
      toast(t('L’enregistrement a échoué. Vos modifications sont conservées ; réessayez.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const onFile = (f?: File) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast(t('Choisissez une image JPG ou PNG'), 'error');
    if (f.size > 4 * 1024 * 1024) return toast(t('Image trop lourde : 4 Mo maximum'), 'error');
    const r = new FileReader();
    r.onload = () => up({ cover: String(r.result) });
    r.readAsDataURL(f);
  };

  const preview: EventItem = {
    ...ev,
    slug: ev.slug || slugify(ev.title),
    title: ev.title || t('Titre de votre événement'),
    venue: mode === 'online' ? null : ev.venue,
    online: mode === 'venue' ? null : ev.online ?? { platform: 'Zoom', url: '' },
  };

  const addZone = () => {
    const used = new Set(map.zones.map((z) => z.ticketTypeId));
    const tt = ev.tickets.find((x) => !used.has(x.id)) ?? ev.tickets[0];
    const last = map.zones[map.zones.length - 1];
    const from = last ? Math.min(map.rows - 1, last.toRow + 1) : 0;
    upMap({ zones: [...map.zones, { ticketTypeId: tt.id, fromRow: from, toRow: map.rows - 1 }] });
  };

  return (
    <div>
      <Link to="/organisateur/evenements" className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-ink-soft"><ArrowLeft className="h-4 w-4" aria-hidden /> {t('Événements')}</Link>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{id ? t('Modifier l’événement') : t('Nouvel événement')}</h1>
        <Button variant="outline" onClick={() => save('draft')} loading={saving}>{t('Enregistrer le brouillon')}</Button>
      </div>

      <nav aria-label={t('Étapes')} className="no-scrollbar -mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ol className="flex gap-2">
          {steps.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                aria-current={i === step ? 'step' : undefined}
                onClick={() => (i <= step || validate(i - 1)) && setStep(i)}
                className={cx('flex shrink-0 items-center gap-2 rounded-full py-2 pl-2 pr-4 text-sm font-semibold transition', i === step ? 'bg-contrast text-on-contrast' : i < step ? 'bg-brand-100 text-brand-dark' : 'bg-surface text-ink-soft shadow-card')}
              >
                <span aria-hidden className={cx('grid h-6 w-6 place-items-center rounded-full text-xs', i === step ? 'bg-brand text-white' : i < step ? 'bg-brand text-white' : 'bg-canvas')}>{i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}</span>
                {t(s)}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px] [&>*]:min-w-0">
        <div className="space-y-4">
          {step === 0 && (
            <>
              <Card className="space-y-5">
                <div data-field="title"><Field label={t('Titre de l’événement')} error={errors.title} required><Input value={ev.title} onChange={(e) => up({ title: e.target.value })} placeholder={t('Ex. Festival Kompa Live 2026')} maxLength={90} /></Field></div>
                <div data-field="description">
                  <Field label={t('Description')} error={errors.description} hint={`${ev.description.length}/2000`} required>
                    <Textarea value={ev.description} onChange={(e) => up({ description: e.target.value.slice(0, 2000) })} placeholder={t('Programme, artistes, ce qui est inclus, règles d’accès…')} className="min-h-[160px]" />
                  </Field>
                </div>
                <fieldset data-field="categories" tabIndex={-1}>
                  <legend className="mb-2 block text-sm font-semibold">{t('Catégories')} <span aria-hidden className="text-red-600">*</span></legend>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((c) => {
                      const on = ev.categories.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => up({ categories: on ? ev.categories.filter((x) => x !== c.id) : [...ev.categories, c.id as CategoryId] })}
                          className={cx('rounded-full px-3.5 py-2 text-sm font-semibold transition', on ? 'bg-contrast text-on-contrast' : 'bg-canvas text-ink-soft hover:text-ink')}
                        >
                          <span aria-hidden>{c.emoji}</span> {t(c.label)}
                        </button>
                      );
                    })}
                  </div>
                  {errors.categories && <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">{errors.categories}</p>}
                </fieldset>
              </Card>
              <Card>
                <h2 className="mb-3 text-sm font-semibold">{t('Visuel')}</h2>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]); }}
                  className="flex w-full flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-line py-10 text-sm text-ink-soft hover:border-brand hover:bg-brand-50/40"
                >
                  <ImagePlus className="h-7 w-7 text-brand-ink" aria-hidden />
                  <span className="font-semibold text-ink">{t('Importer une affiche')}</span>
                  <span className="text-xs">{t('JPG ou PNG, 1600×1200 recommandé, 4 Mo maximum')}</span>
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => onFile(e.target.files?.[0])} />
                <div className="mt-4 text-xs font-semibold text-ink-muted">{t('Ou choisissez un fond')}</div>
                <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={t('Fond')}>
                  {covers.map((c, i) => (
                    <button key={c} type="button" role="radio" aria-checked={ev.cover === c} aria-label={t('Fond {n}', { n: i + 1 })} onClick={() => up({ cover: c })} className={cx('h-12 w-12 rounded-2xl ring-offset-2 ring-offset-surface transition', ev.cover === c && 'ring-2 ring-brand')} style={{ background: c }} />
                  ))}
                </div>
              </Card>
            </>
          )}

          {step === 1 && (
            <>
              <Card className="space-y-5">
                <Segmented
                  label={t('Format')}
                  value={mode}
                  onChange={(v) => { setDirty(true); setMode(v); }}
                  options={[
                    { value: 'venue', label: <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" aria-hidden /> {t('Sur place')}</span> },
                    { value: 'online', label: <span className="flex items-center gap-1.5"><MonitorPlay className="h-4 w-4" aria-hidden /> {t('En ligne')}</span> },
                    { value: 'hybrid', label: <span className="flex items-center gap-1.5"><Radio className="h-4 w-4" aria-hidden /> {t('Hybride')}</span> },
                  ]}
                />
                {mode !== 'online' && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div data-field="venue" className="sm:col-span-2"><Field label={t('Nom du lieu')} error={errors.venue} required><Input value={ev.venue?.name ?? ''} onChange={(e) => up({ venue: { ...(ev.venue ?? { address: '', city: '' }), name: e.target.value } })} placeholder={t('Ex. Parc Historique de la Canne à Sucre')} /></Field></div>
                    <Field label={t('Adresse')}><Input autoComplete="street-address" value={ev.venue?.address ?? ''} onChange={(e) => up({ venue: { ...(ev.venue ?? { name: '', city: '' }), address: e.target.value } })} /></Field>
                    <Field label={t('Ville')}><Input autoComplete="address-level2" value={ev.venue?.city ?? ''} onChange={(e) => up({ venue: { ...(ev.venue ?? { name: '', address: '' }), city: e.target.value } })} /></Field>
                  </div>
                )}
                {mode !== 'venue' && (
                  <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
                    <Field label={t('Plateforme')}>
                      <Select value={ev.online?.platform ?? 'Zoom'} onChange={(e) => up({ online: { url: ev.online?.url ?? '', platform: e.target.value } })}>
                        {['Zoom', 'YouTube Live', 'Facebook Live', 'Google Meet', 'Vimeo', t('Autre')].map((p) => <option key={p}>{p}</option>)}
                      </Select>
                    </Field>
                    <div data-field="online">
                      <Field label={t('Lien de streaming')} error={errors.online} hint={t('Visible uniquement par les détenteurs de billet')} required>
                        <Input type="url" inputMode="url" value={ev.online?.url ?? ''} onChange={(e) => up({ online: { platform: ev.online?.platform ?? 'Zoom', url: e.target.value } })} placeholder="https://" />
                      </Field>
                    </div>
                  </div>
                )}
              </Card>
              <Card className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t('Début')} required><Input type="datetime-local" value={local(ev.start)} onChange={(e) => up({ start: e.target.value })} /></Field>
                  <div data-field="end"><Field label={t('Fin')} error={errors.end} required><Input type="datetime-local" value={local(ev.end)} min={local(ev.start)} onChange={(e) => up({ end: e.target.value })} /></Field></div>
                </div>
                <Field label={t('Récurrence')} hint={ev.recurring ? t('Les participants choisiront une date entre le début et la fin') : undefined}>
                  <Select value={ev.recurring ?? ''} onChange={(e) => up({ recurring: (e.target.value || null) as EventItem['recurring'] })}>
                    <option value="">{t('Événement unique')}</option>
                    <option value="weekly">{t('Chaque semaine')}</option>
                    <option value="monthly">{t('Chaque mois')}</option>
                  </Select>
                </Field>
                <Toggle
                  checked={multi}
                  onChange={(v) => {
                    setMulti(v);
                    if (v && !ev.sessions?.length) up({ sessions: [{ id: uid('s'), label: t('Session {n}', { n: 1 }), start: local(ev.start), end: local(ev.end) }] });
                  }}
                  label={t('Multi-sessions')}
                  description={t('Plusieurs jours ou créneaux sous un même événement')}
                />
                {multi && (
                  <div className="space-y-3">
                    {(ev.sessions ?? []).map((s, i) => (
                      <fieldset key={s.id} className="grid gap-2 rounded-2xl bg-canvas p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                        <legend className="sr-only">{t('Session {n}', { n: i + 1 })}</legend>
                        <Input value={s.label} onChange={(e) => upS(s.id, { label: e.target.value })} aria-label={t('Nom de la session')} />
                        <Input type="datetime-local" value={local(s.start)} onChange={(e) => upS(s.id, { start: e.target.value })} aria-label={t('Début')} />
                        <Input type="datetime-local" value={local(s.end)} onChange={(e) => upS(s.id, { end: e.target.value })} aria-label={t('Fin')} />
                        <Button variant="danger" onClick={() => up({ sessions: ev.sessions!.filter((x) => x.id !== s.id) })} aria-label={t('Supprimer la session {n}', { n: i + 1 })}><Trash2 className="h-4 w-4" aria-hidden /></Button>
                      </fieldset>
                    ))}
                    <Button variant="soft" size="sm" onClick={() => up({ sessions: [...(ev.sessions ?? []), { id: uid('s'), label: t('Session {n}', { n: (ev.sessions?.length ?? 0) + 1 }), start: local(ev.start), end: local(ev.end) }] })}>
                      <Plus className="h-4 w-4" aria-hidden /> {t('Ajouter une session')}
                    </Button>
                  </div>
                )}
              </Card>
            </>
          )}

          {step === 2 && (
            <>
              <Card className="grid gap-4 sm:grid-cols-3">
                <Field label={t('Devise')}>
                  <Select value={ev.currency} onChange={(e) => up({ currency: e.target.value as Currency })}>
                    <option value="HTG">{t('HTG — Gourde')}</option>
                    <option value="USD">{t('USD — Dollar')}</option>
                  </Select>
                </Field>
                <Field label={t('Limite par personne')} hint={t('Limite la revente abusive')}><Input type="number" inputMode="numeric" min={1} value={ev.maxPerPerson} onChange={(e) => up({ maxPerPerson: Math.max(1, +e.target.value || 1) })} /></Field>
                <div className="flex items-end pb-2"><Toggle checked={ev.seated} onChange={(v) => up({ seated: v })} label={t('Plan de salle')} description={t('Places numérotées')} /></div>
              </Card>
              {errors.tickets && <p role="alert" className="text-sm font-medium text-red-600">{errors.tickets}</p>}
              {ev.tickets.map((x, i) => (
                <Card key={x.id} className="space-y-4" data-field={`t-${x.id}`}>
                  <div className="flex items-center justify-between">
                    <h2 className="flex items-center gap-2 font-bold"><span aria-hidden className="grid h-7 w-7 place-items-center rounded-full bg-brand-100 text-xs text-brand-dark">{i + 1}</span> {t('Type de billet')}</h2>
                    <Button
                      variant="danger"
                      size="sm"
                      aria-label={t('Supprimer ce billet')}
                      onClick={() => (x.sold > 0 ? toast(t('Des billets de ce type sont déjà vendus : réduisez plutôt son quota.'), 'info') : up({ tickets: ev.tickets.filter((y) => y.id !== x.id), seatMap: ev.seatMap && { ...map, zones: map.zones.filter((z) => z.ticketTypeId !== x.id) } }))}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('Catégorie de billet')}>
                    {kinds.map((k) => (
                      <button key={k.v} type="button" role="radio" aria-checked={x.kind === k.v} onClick={() => upT(x.id, { kind: k.v, price: k.v === 'free' ? 0 : x.price || 1000, groupSize: k.v === 'group' ? x.groupSize ?? 5 : undefined })} className={cx('rounded-full px-3 py-1.5 text-xs font-bold', x.kind === k.v ? 'bg-contrast text-on-contrast' : 'bg-canvas text-ink-soft')}>{t(k.l)}</button>
                    ))}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label={t('Nom')} error={errors[`t-${x.id}`] || undefined} className="sm:col-span-2" required><Input value={x.name} onChange={(e) => upT(x.id, { name: e.target.value })} /></Field>
                    <Field label={t('Prix ({cur})', { cur: ev.currency })}><Input type="number" inputMode="decimal" min={0} disabled={x.kind === 'free'} value={x.price} onChange={(e) => upT(x.id, { price: Math.max(0, +e.target.value || 0) })} /></Field>
                    <Field label={t('Quota')} hint={x.sold ? t('{n} vendus', { n: x.sold }) : undefined}><Input type="number" inputMode="numeric" min={x.sold || 1} value={x.quota} onChange={(e) => upT(x.id, { quota: Math.max(x.sold, +e.target.value || 0) })} /></Field>
                    <Field label={t('Début des ventes')} className="lg:col-span-2"><Input type="datetime-local" value={local(x.salesStart)} onChange={(e) => upT(x.id, { salesStart: e.target.value })} /></Field>
                    <Field label={t('Fin des ventes')} className="lg:col-span-2"><Input type="datetime-local" value={local(x.salesEnd)} onChange={(e) => upT(x.id, { salesEnd: e.target.value })} /></Field>
                    <Field label={t('Maximum par commande')}><Input type="number" inputMode="numeric" min={1} value={x.maxPerOrder} onChange={(e) => upT(x.id, { maxPerOrder: Math.max(1, +e.target.value || 1) })} /></Field>
                    {x.kind === 'group' && <Field label={t('Personnes par pack')}><Input type="number" inputMode="numeric" min={2} value={x.groupSize ?? 5} onChange={(e) => upT(x.id, { groupSize: Math.max(2, +e.target.value || 2) })} /></Field>}
                    <Field label={t('Description')} hint={t('Optionnel')} className="sm:col-span-2 lg:col-span-4"><Input value={x.description ?? ''} onChange={(e) => upT(x.id, { description: e.target.value })} placeholder={t('Ce qui est inclus')} /></Field>
                  </div>
                </Card>
              ))}
              <Button variant="soft" onClick={() => up({ tickets: [...ev.tickets, { id: uid('t'), name: '', kind: 'paid', price: 1000, quota: 100, sold: 0, salesStart: inDays(0), salesEnd: local(ev.start), maxPerOrder: 6 }] })}>
                <Plus className="h-4 w-4" aria-hidden /> {t('Ajouter un type de billet')}
              </Button>

              {ev.seated && (
                <Card className="space-y-5" data-field="seatMap" tabIndex={-1}>
                  <div>
                    <h2 className="font-bold">{t('Plan de salle')}</h2>
                    <p className="text-sm text-ink-soft">{t('Définissez la grille, puis attribuez des rangs à chaque type de billet. Touchez une place pour la neutraliser (pilier, régie…).')}</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label={t('Rangs')}><Input type="number" inputMode="numeric" min={1} max={26} value={map.rows} onChange={(e) => upMap({ rows: Math.min(26, Math.max(1, +e.target.value || 1)) })} /></Field>
                    <Field label={t('Places par rang')}><Input type="number" inputMode="numeric" min={1} max={40} value={map.cols} onChange={(e) => upMap({ cols: Math.min(40, Math.max(1, +e.target.value || 1)) })} /></Field>
                    <Field label={t('Allée après la place')} hint={t('0 = aucune allée')}><Input type="number" inputMode="numeric" min={0} max={map.cols - 1} value={map.aisleAfter} onChange={(e) => upMap({ aisleAfter: Math.min(map.cols - 1, Math.max(0, +e.target.value || 0)) })} /></Field>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">{t('Zones tarifaires')}</h3>
                    {map.zones.map((z, zi) => (
                      <fieldset key={zi} className="grid grid-cols-[1fr_auto_auto_auto] items-end gap-2 rounded-2xl bg-canvas p-3">
                        <legend className="sr-only">{t('Zone {n}', { n: zi + 1 })}</legend>
                        <Field label={t('Billet')}>
                          <Select value={z.ticketTypeId} onChange={(e) => upMap({ zones: map.zones.map((y, j) => (j === zi ? { ...y, ticketTypeId: e.target.value } : y)) })}>
                            {ev.tickets.map((x) => <option key={x.id} value={x.id}>{x.name || t('Sans nom')}</option>)}
                          </Select>
                        </Field>
                        <Field label={t('Du rang')}>
                          <Select value={z.fromRow} onChange={(e) => upMap({ zones: map.zones.map((y, j) => (j === zi ? { ...y, fromRow: +e.target.value, toRow: Math.max(+e.target.value, y.toRow) } : y)) })} className="w-20">
                            {Array.from({ length: map.rows }, (_, r) => <option key={r} value={r}>{rowLetter(r)}</option>)}
                          </Select>
                        </Field>
                        <Field label={t('au rang')}>
                          <Select value={z.toRow} onChange={(e) => upMap({ zones: map.zones.map((y, j) => (j === zi ? { ...y, toRow: Math.max(y.fromRow, +e.target.value) } : y)) })} className="w-20">
                            {Array.from({ length: map.rows }, (_, r) => <option key={r} value={r}>{rowLetter(r)}</option>)}
                          </Select>
                        </Field>
                        <Button variant="danger" onClick={() => upMap({ zones: map.zones.filter((_, j) => j !== zi) })} aria-label={t('Supprimer la zone {n}', { n: zi + 1 })}><Trash2 className="h-4 w-4" aria-hidden /></Button>
                      </fieldset>
                    ))}
                    <Button variant="soft" size="sm" onClick={addZone}><Plus className="h-4 w-4" aria-hidden /> {t('Ajouter une zone')}</Button>
                    {errors.seatMap && <p role="alert" className="text-xs font-medium text-red-600">{errors.seatMap}</p>}
                  </div>
                  <SeatMap
                    config={map}
                    tickets={ev.tickets}
                    taken={new Set()}
                    selected={[]}
                    max={0}
                    editable
                    onToggleBlocked={(s) => upMap({ blocked: map.blocked.includes(s) ? map.blocked.filter((x) => x !== s) : [...map.blocked, s] })}
                  />
                  <p className="text-center text-xs text-ink-muted">{t('{n} places au total, dont {b} neutralisées', { n: map.rows * map.cols, b: map.blocked.length })}</p>
                </Card>
              )}

              <Card className="flex items-start gap-3 !bg-brand-50/60 p-4 text-sm text-ink-soft">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-ink" aria-hidden />
                <span>{t('Les codes promo se créent dans l’onglet')} <Link to="/organisateur/codes-promo" className="font-semibold text-brand-ink">{t('Codes promo')}</Link> {t('et peuvent cibler cet événement.')}</span>
              </Card>
            </>
          )}

          {step === 3 && (
            <>
              <Card className="space-y-4">
                <h2 className="font-bold">{t('Lien de partage')}</h2>
                <Field label={t('Adresse de la page')} hint={t('Lettres, chiffres et tirets')}>
                  <div className="flex items-center rounded-2xl border border-line bg-canvas pl-4 text-sm text-ink-muted">
                    <span aria-hidden>event509.com/e/</span>
                    <input aria-label={t('Adresse de la page')} className="h-12 min-w-0 flex-1 rounded-r-2xl bg-surface px-2 text-ink outline-none" value={ev.slug || slugify(ev.title)} onChange={(e) => up({ slug: slugify(e.target.value) })} />
                  </div>
                </Field>
                <Button variant="outline" size="sm" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/e/${ev.slug || slugify(ev.title)}`).then(() => toast(t('Lien copié')))}>
                  <Copy className="h-4 w-4" aria-hidden /> {t('Copier le lien')}
                </Button>
                <Field label={t('Étiquettes')} hint={t('Séparées par des virgules (ex. Plein air, 18+)')}>
                  <Input value={(ev.tags ?? []).join(', ')} onChange={(e) => up({ tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
                </Field>
              </Card>
              <Card className="space-y-4">
                <h2 className="font-bold">{t('Pixels de suivi')}</h2>
                <p className="text-sm text-ink-soft">{t('Mesurez vos campagnes : vues de page, débuts de paiement et achats sont envoyés automatiquement.')}</p>
                <Field label="Facebook Pixel ID" hint={t('Laissez vide pour utiliser le pixel par défaut de votre organisation')}><Input inputMode="numeric" value={ev.pixels?.fb ?? ''} onChange={(e) => up({ pixels: { ...ev.pixels, fb: e.target.value.replace(/\D/g, '') } })} placeholder="123456789012345" /></Field>
                <Field label="Google Analytics (GA4)"><Input value={ev.pixels?.ga ?? ''} onChange={(e) => up({ pixels: { ...ev.pixels, ga: e.target.value.toUpperCase() } })} placeholder="G-XXXXXXXXXX" /></Field>
              </Card>
            </>
          )}

          {step === 4 && (
            <Card className="space-y-4">
              <h2 className="text-lg font-bold">{t('Prêt à publier ?')}</h2>
              <ul className="space-y-2 text-sm">
                {([
                  [t('Titre et description'), ev.title.length > 3 && ev.description.length >= 20],
                  [t('Catégories'), ev.categories.length > 0],
                  [t('Date et lieu'), mode === 'online' ? !!ev.online?.url : !!ev.venue?.name],
                  [ev.tickets.length > 1 ? t('{n} types de billet', { n: ev.tickets.length }) : t('{n} type de billet', { n: ev.tickets.length }), ev.tickets.length > 0],
                  [t('Visuel'), !!ev.cover],
                ] as const).map(([l, ok]) => (
                  <li key={l} className="flex items-center gap-2">
                    <span aria-hidden className={cx('grid h-5 w-5 place-items-center rounded-full', ok ? 'bg-emerald-500 text-white' : 'bg-line')}>{ok && <Check className="h-3 w-3" />}</span>
                    {l} <span className="sr-only">{ok ? t('complet') : t('à compléter')}</span>
                  </li>
                ))}
              </ul>
              {verified ? (
                <p className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-700">{t('Votre organisation est vérifiée : l’événement est publié immédiatement.')}</p>
              ) : (
                <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">{t('Les nouveaux organisateurs sont vérifiés par l’équipe Event509 avant publication (moins de 24 h).')}</p>
              )}
              <Button size="lg" onClick={() => save(verified ? 'published' : 'pending')} loading={saving}>{verified ? t('Publier maintenant') : t('Envoyer en validation')}</Button>
            </Card>
          )}

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} className={step === 0 ? 'invisible' : ''}><ArrowLeft className="h-4 w-4" aria-hidden /> {t('Précédent')}</Button>
            {step < steps.length - 1 && <Button variant="dark" onClick={next}>{t('Suivant')} <ArrowRight className="h-4 w-4" aria-hidden /></Button>}
          </div>
        </div>

        <aside className="hidden xl:block" aria-label={t('Aperçu')}>
          <div className="sticky top-10">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-soft"><Eye className="h-4 w-4" aria-hidden /> {t('Aperçu')}</div>
            <div className="pointer-events-none" ref={(el) => el?.setAttribute('inert', '')}>
              <EventCard event={preview} />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {ev.tickets.map((x) => <Badge key={x.id} tone="brand">{x.name || '—'}</Badge>)}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Check, Copy, Eye, ImagePlus, Info, MapPin, MonitorPlay, Plus, Radio, Trash2,
} from 'lucide-react';
import { categories } from '@/data/mock';
import { getEvent, saveEvent } from '@/services/api';
import { useApp } from '@/store/app';
import { cx, uid } from '@/lib/format';
import { Badge, Button, Card, Field, Input, Loading, Segmented, Select, Textarea, Toggle } from '@/components/ui';
import { EventCard } from '@/components/events';
import type { CategoryId, Currency, EventItem, Session, TicketKind, TicketType } from '@/types';

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

const blank = (): EventItem => ({
  id: `e${Date.now()}`, slug: '', title: '', description: '', cover: covers[0], categories: [],
  start: '2026-12-12T19:00', end: '2026-12-12T23:00', sessions: [], recurring: null,
  venue: { name: '', address: '', city: 'Port-au-Prince' }, online: null, currency: 'HTG',
  tickets: [{ id: uid('t'), name: 'Standard', kind: 'paid', price: 1000, quota: 200, sold: 0, salesStart: '2026-11-08T00:00', salesEnd: '2026-12-12T18:00', maxPerOrder: 6 }],
  organizerId: 'org1', status: 'draft', seated: false, maxPerPerson: 6, views: 0,
});

const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const local = (iso: string) => iso.slice(0, 16);

const steps = ['Informations', 'Date & lieu', 'Billets', 'Page & suivi', 'Publication'];

export default function EventEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const { toast } = useApp();
  const [ev, setEv] = useState<EventItem | null>(id ? null : blank());
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<'venue' | 'online' | 'hybrid'>('venue');
  const [multi, setMulti] = useState(false);
  const [pixels, setPixels] = useState({ fb: '', ga: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    getEvent(id).then((e) => {
      if (!e) return;
      setEv({ ...e, start: local(e.start), end: local(e.end) });
      setMode(e.venue && e.online ? 'hybrid' : e.online ? 'online' : 'venue');
      setMulti(!!e.sessions?.length);
    });
  }, [id]);

  if (!ev) return <Loading />;
  const up = (p: Partial<EventItem>) => setEv((e) => (e ? { ...e, ...p } : e));
  const upT = (tid: string, p: Partial<TicketType>) => up({ tickets: ev.tickets.map((t) => (t.id === tid ? { ...t, ...p } : t)) });
  const upS = (sid: string, p: Partial<Session>) => up({ sessions: (ev.sessions ?? []).map((s) => (s.id === sid ? { ...s, ...p } : s)) });

  const validate = (upTo: number) => {
    const e: Record<string, string> = {};
    if (upTo >= 0) {
      if (ev.title.trim().length < 4) e.title = 'Titre trop court';
      if (ev.description.trim().length < 20) e.description = 'Décrivez votre événement (20 caractères min.)';
      if (!ev.categories.length) e.categories = 'Choisissez au moins une catégorie';
    }
    if (upTo >= 1) {
      if (mode !== 'online' && !ev.venue?.name) e.venue = 'Nom du lieu requis';
      if (mode !== 'venue' && !ev.online?.url) e.online = 'Lien de diffusion requis';
      if (ev.end <= ev.start) e.date = 'La fin doit être après le début';
    }
    if (upTo >= 2) {
      if (!ev.tickets.length) e.tickets = 'Ajoutez au moins un type de billet';
      ev.tickets.forEach((t) => {
        if (!t.name) e[`t-${t.id}`] = 'Nom requis';
        if (t.quota < 1) e[`t-${t.id}`] = 'Quota invalide';
      });
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (!validate(step)) {
      toast('Complétez les champs requis', 'error');
      return;
    }
    setStep((s) => Math.min(steps.length - 1, s + 1));
  };

  const save = async (status: EventItem['status']) => {
    if (status !== 'draft' && !validate(3)) {
      toast('Complétez les champs requis', 'error');
      return;
    }
    setSaving(true);
    const out: EventItem = {
      ...ev,
      slug: ev.slug || slugify(ev.title) || ev.id,
      start: `${local(ev.start)}:00`,
      end: `${local(ev.end)}:00`,
      venue: mode === 'online' ? null : ev.venue,
      online: mode === 'venue' ? null : ev.online,
      sessions: multi ? ev.sessions : [],
      categories: mode !== 'venue' && !ev.categories.includes('online') ? [...ev.categories, 'online'] : ev.categories,
      status,
    };
    await saveEvent(out);
    setSaving(false);
    toast(status === 'draft' ? 'Brouillon enregistré' : status === 'pending' ? 'Envoyé en validation — publication sous 24 h' : 'Événement publié !');
    nav('/organisateur/evenements');
  };

  const onFile = (f?: File) => {
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) return toast('Image trop lourde (4 Mo max)', 'error');
    const r = new FileReader();
    r.onload = () => up({ cover: String(r.result) });
    r.readAsDataURL(f);
  };

  const preview: EventItem = { ...ev, slug: ev.slug || slugify(ev.title), title: ev.title || 'Titre de votre événement', venue: mode === 'online' ? null : ev.venue, online: mode === 'venue' ? null : ev.online ?? { platform: 'Zoom', url: '' } };

  return (
    <div>
      <Link to="/organisateur/evenements" className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-ink-soft"><ArrowLeft className="h-4 w-4" /> Événements</Link>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{id ? 'Modifier l’événement' : 'Nouvel événement'}</h1>
        <Button variant="outline" onClick={() => save('draft')} loading={saving}>Enregistrer le brouillon</Button>
      </div>

      {/* Étapes */}
      <div className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {steps.map((s, i) => (
          <button
            key={s}
            onClick={() => (i <= step || validate(i - 1)) && setStep(i)}
            className={cx('flex shrink-0 items-center gap-2 rounded-full py-2 pl-2 pr-4 text-sm font-semibold transition', i === step ? 'bg-ink text-white' : i < step ? 'bg-brand-100 text-brand-dark' : 'bg-white text-ink-soft shadow-card')}
          >
            <span className={cx('grid h-6 w-6 place-items-center rounded-full text-xs', i === step ? 'bg-brand' : i < step ? 'bg-brand text-white' : 'bg-canvas')}>{i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}</span>
            {s}
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {step === 0 && (
            <>
              <Card className="space-y-5">
                <Field label="Titre de l’événement" error={errors.title}><Input value={ev.title} onChange={(e) => up({ title: e.target.value })} placeholder="Ex. Festival Kompa Live 2026" maxLength={90} /></Field>
                <Field label="Description" error={errors.description} hint={`${ev.description.length}/2000`}>
                  <Textarea value={ev.description} onChange={(e) => up({ description: e.target.value.slice(0, 2000) })} placeholder="Programme, artistes, ce qui est inclus, règles d’accès…" className="min-h-[160px]" />
                </Field>
                <div>
                  <span className="mb-2 block text-sm font-semibold">Catégories</span>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((c) => {
                      const on = ev.categories.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => up({ categories: on ? ev.categories.filter((x) => x !== c.id) : [...ev.categories, c.id as CategoryId] })}
                          className={cx('rounded-full px-3.5 py-2 text-sm font-semibold transition', on ? 'bg-ink text-white' : 'bg-canvas text-ink-soft hover:text-ink')}
                        >
                          {c.emoji} {c.label}
                        </button>
                      );
                    })}
                  </div>
                  {errors.categories && <p className="mt-1 text-xs text-red-600">{errors.categories}</p>}
                </div>
              </Card>
              <Card>
                <span className="mb-3 block text-sm font-semibold">Visuel</span>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]); }}
                  className="flex w-full flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-line py-10 text-sm text-ink-soft hover:border-brand hover:bg-brand-50/40"
                >
                  <ImagePlus className="h-7 w-7 text-brand" />
                  <span className="font-semibold text-ink">Importer une affiche</span>
                  <span className="text-xs">JPG ou PNG, 1600×1200 recommandé, 4 Mo max</span>
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
                <div className="mt-4 text-xs font-semibold text-ink-muted">Ou choisissez un fond</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {covers.map((c) => (
                    <button key={c} type="button" aria-label="Choisir ce fond" onClick={() => up({ cover: c })} className={cx('h-12 w-12 rounded-2xl ring-offset-2 transition', ev.cover === c && 'ring-2 ring-brand')} style={{ background: c }} />
                  ))}
                </div>
              </Card>
            </>
          )}

          {step === 1 && (
            <>
              <Card className="space-y-5">
                <Segmented
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: 'venue', label: <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" /> Sur place</span> },
                    { value: 'online', label: <span className="flex items-center gap-1.5"><MonitorPlay className="h-4 w-4" /> En ligne</span> },
                    { value: 'hybrid', label: <span className="flex items-center gap-1.5"><Radio className="h-4 w-4" /> Hybride</span> },
                  ]}
                />
                {mode !== 'online' && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Nom du lieu" error={errors.venue} className="sm:col-span-2"><Input value={ev.venue?.name ?? ''} onChange={(e) => up({ venue: { ...(ev.venue ?? { address: '', city: '' }), name: e.target.value } })} placeholder="Ex. Parc Historique de la Canne à Sucre" /></Field>
                    <Field label="Adresse"><Input value={ev.venue?.address ?? ''} onChange={(e) => up({ venue: { ...(ev.venue ?? { name: '', city: '' }), address: e.target.value } })} /></Field>
                    <Field label="Ville"><Input value={ev.venue?.city ?? ''} onChange={(e) => up({ venue: { ...(ev.venue ?? { name: '', address: '' }), city: e.target.value } })} /></Field>
                  </div>
                )}
                {mode !== 'venue' && (
                  <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
                    <Field label="Plateforme">
                      <Select value={ev.online?.platform ?? 'Zoom'} onChange={(e) => up({ online: { url: ev.online?.url ?? '', platform: e.target.value } })}>
                        {['Zoom', 'YouTube Live', 'Facebook Live', 'Google Meet', 'Vimeo', 'Autre'].map((p) => <option key={p}>{p}</option>)}
                      </Select>
                    </Field>
                    <Field label="Lien de streaming" error={errors.online} hint="Visible uniquement par les détenteurs de billet">
                      <Input type="url" value={ev.online?.url ?? ''} onChange={(e) => up({ online: { platform: ev.online?.platform ?? 'Zoom', url: e.target.value } })} placeholder="https://" />
                    </Field>
                  </div>
                )}
              </Card>
              <Card className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Début" error={errors.date}><Input type="datetime-local" value={local(ev.start)} onChange={(e) => up({ start: e.target.value })} /></Field>
                  <Field label="Fin"><Input type="datetime-local" value={local(ev.end)} onChange={(e) => up({ end: e.target.value })} /></Field>
                </div>
                <Field label="Récurrence">
                  <Select value={ev.recurring ?? ''} onChange={(e) => up({ recurring: (e.target.value || null) as EventItem['recurring'] })}>
                    <option value="">Événement unique</option>
                    <option value="weekly">Chaque semaine</option>
                    <option value="monthly">Chaque mois</option>
                  </Select>
                </Field>
                <Toggle checked={multi} onChange={(v) => { setMulti(v); if (v && !ev.sessions?.length) up({ sessions: [{ id: uid('s'), label: 'Session 1', start: local(ev.start), end: local(ev.end) }] }); }} label="Multi-sessions" description="Plusieurs jours ou créneaux sous un même événement" />
                {multi && (
                  <div className="space-y-3">
                    {(ev.sessions ?? []).map((s) => (
                      <div key={s.id} className="grid gap-2 rounded-2xl bg-canvas p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                        <Input value={s.label} onChange={(e) => upS(s.id, { label: e.target.value })} aria-label="Nom de la session" />
                        <Input type="datetime-local" value={local(s.start)} onChange={(e) => upS(s.id, { start: e.target.value })} aria-label="Début" />
                        <Input type="datetime-local" value={local(s.end)} onChange={(e) => upS(s.id, { end: e.target.value })} aria-label="Fin" />
                        <Button variant="danger" onClick={() => up({ sessions: ev.sessions!.filter((x) => x.id !== s.id) })} aria-label="Supprimer"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    ))}
                    <Button variant="soft" size="sm" onClick={() => up({ sessions: [...(ev.sessions ?? []), { id: uid('s'), label: `Session ${(ev.sessions?.length ?? 0) + 1}`, start: local(ev.start), end: local(ev.end) }] })}>
                      <Plus className="h-4 w-4" /> Ajouter une session
                    </Button>
                  </div>
                )}
              </Card>
            </>
          )}

          {step === 2 && (
            <>
              <Card className="grid gap-4 sm:grid-cols-3">
                <Field label="Devise">
                  <Select value={ev.currency} onChange={(e) => up({ currency: e.target.value as Currency })}>
                    <option value="HTG">HTG — Gourde</option>
                    <option value="USD">USD — Dollar</option>
                  </Select>
                </Field>
                <Field label="Limite par personne" hint="Anti-revente abusive"><Input type="number" min={1} value={ev.maxPerPerson} onChange={(e) => up({ maxPerPerson: Math.max(1, +e.target.value) })} /></Field>
                <div className="flex items-end pb-2"><Toggle checked={ev.seated} onChange={(v) => up({ seated: v })} label="Plan de salle" description="Places numérotées" /></div>
              </Card>
              {errors.tickets && <p className="text-sm text-red-600">{errors.tickets}</p>}
              {ev.tickets.map((t, i) => (
                <Card key={t.id} className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 font-bold"><span className="grid h-7 w-7 place-items-center rounded-full bg-brand-100 text-xs text-brand-dark">{i + 1}</span> Type de billet</span>
                    <Button variant="danger" size="sm" onClick={() => up({ tickets: ev.tickets.filter((x) => x.id !== t.id) })} disabled={t.sold > 0} title={t.sold > 0 ? 'Billets déjà vendus' : undefined}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {kinds.map((k) => (
                      <button key={k.v} type="button" onClick={() => upT(t.id, { kind: k.v, price: k.v === 'free' ? 0 : t.price || 1000, groupSize: k.v === 'group' ? t.groupSize ?? 5 : undefined })} className={cx('rounded-full px-3 py-1.5 text-xs font-bold', t.kind === k.v ? 'bg-ink text-white' : 'bg-canvas text-ink-soft')}>{k.l}</button>
                    ))}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Nom" error={errors[`t-${t.id}`]} className="sm:col-span-2"><Input value={t.name} onChange={(e) => upT(t.id, { name: e.target.value })} /></Field>
                    <Field label={`Prix (${ev.currency})`}><Input type="number" min={0} disabled={t.kind === 'free'} value={t.price} onChange={(e) => upT(t.id, { price: Math.max(0, +e.target.value) })} /></Field>
                    <Field label="Quota" hint={t.sold ? `${t.sold} vendus` : undefined}><Input type="number" min={t.sold || 1} value={t.quota} onChange={(e) => upT(t.id, { quota: Math.max(t.sold, +e.target.value) })} /></Field>
                    <Field label="Début des ventes"><Input type="datetime-local" value={local(t.salesStart)} onChange={(e) => upT(t.id, { salesStart: e.target.value })} /></Field>
                    <Field label="Fin des ventes"><Input type="datetime-local" value={local(t.salesEnd)} onChange={(e) => upT(t.id, { salesEnd: e.target.value })} /></Field>
                    <Field label="Max. par commande"><Input type="number" min={1} value={t.maxPerOrder} onChange={(e) => upT(t.id, { maxPerOrder: Math.max(1, +e.target.value) })} /></Field>
                    {t.kind === 'group' && <Field label="Personnes / pack"><Input type="number" min={2} value={t.groupSize ?? 5} onChange={(e) => upT(t.id, { groupSize: Math.max(2, +e.target.value) })} /></Field>}
                    <Field label="Description (optionnel)" className="sm:col-span-2 lg:col-span-4"><Input value={t.description ?? ''} onChange={(e) => upT(t.id, { description: e.target.value })} placeholder="Ce qui est inclus" /></Field>
                  </div>
                </Card>
              ))}
              <Button variant="soft" onClick={() => up({ tickets: [...ev.tickets, { id: uid('t'), name: '', kind: 'paid', price: 1000, quota: 100, sold: 0, salesStart: '2026-11-08T00:00', salesEnd: local(ev.start), maxPerOrder: 6 }] })}>
                <Plus className="h-4 w-4" /> Ajouter un type de billet
              </Button>
              <Card className="flex items-start gap-3 bg-brand-50/60 p-4 text-sm text-ink-soft">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                Les codes promo se créent dans l’onglet <Link to="/organisateur/codes-promo" className="font-semibold text-brand">Codes promo</Link> et peuvent cibler cet événement.
              </Card>
            </>
          )}

          {step === 3 && (
            <>
              <Card className="space-y-4">
                <h2 className="font-bold">Lien de partage</h2>
                <Field label="Adresse de la page" hint="Lettres, chiffres et tirets">
                  <div className="flex items-center rounded-2xl border border-line bg-canvas pl-4 text-sm text-ink-muted">
                    event509.com/e/
                    <input className="h-12 flex-1 rounded-r-2xl bg-white px-2 text-ink outline-none" value={ev.slug || slugify(ev.title)} onChange={(e) => up({ slug: slugify(e.target.value) })} />
                  </div>
                </Field>
                <Button variant="outline" size="sm" onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/e/${ev.slug || slugify(ev.title)}`); toast('Lien copié'); }}>
                  <Copy className="h-4 w-4" /> Copier le lien
                </Button>
                <Field label="Mots-clés / étiquettes" hint="Séparés par des virgules (ex. Plein air, 18+)">
                  <Input value={(ev.tags ?? []).join(', ')} onChange={(e) => up({ tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
                </Field>
              </Card>
              <Card className="space-y-4">
                <h2 className="font-bold">Pixels de suivi</h2>
                <p className="text-sm text-ink-soft">Mesurez vos campagnes : vues de page, débuts de paiement et achats sont envoyés automatiquement.</p>
                <Field label="Facebook Pixel ID"><Input value={pixels.fb} onChange={(e) => setPixels({ ...pixels, fb: e.target.value.replace(/\D/g, '') })} placeholder="123456789012345" /></Field>
                <Field label="Google Analytics (GA4)"><Input value={pixels.ga} onChange={(e) => setPixels({ ...pixels, ga: e.target.value.toUpperCase() })} placeholder="G-XXXXXXXXXX" /></Field>
              </Card>
            </>
          )}

          {step === 4 && (
            <Card className="space-y-4">
              <h2 className="text-lg font-bold">Prêt à publier ?</h2>
              <ul className="space-y-2 text-sm">
                {[
                  ['Titre et description', ev.title.length > 3 && ev.description.length >= 20],
                  ['Catégories', ev.categories.length > 0],
                  ['Date et lieu', mode === 'online' ? !!ev.online?.url : !!ev.venue?.name],
                  [`${ev.tickets.length} type(s) de billet`, ev.tickets.length > 0],
                  ['Visuel', !!ev.cover],
                ].map(([l, ok]) => (
                  <li key={String(l)} className="flex items-center gap-2">
                    <span className={cx('grid h-5 w-5 place-items-center rounded-full', ok ? 'bg-emerald-500 text-white' : 'bg-line')}>{ok && <Check className="h-3 w-3" />}</span>
                    {l}
                  </li>
                ))}
              </ul>
              <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
                Les nouveaux événements sont vérifiés par l’équipe Event509 avant publication (moins de 24 h). Les organisateurs vérifiés publient instantanément.
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="lg" onClick={() => save('published')} loading={saving}>Publier maintenant</Button>
                <Button size="lg" variant="outline" onClick={() => save('pending')} loading={saving}>Envoyer en validation</Button>
              </div>
            </Card>
          )}

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}><ArrowLeft className="h-4 w-4" /> Précédent</Button>
            {step < steps.length - 1 && <Button variant="dark" onClick={next}>Suivant <ArrowRight className="h-4 w-4" /></Button>}
          </div>
        </div>

        {/* Aperçu */}
        <aside className="hidden xl:block">
          <div className="sticky top-10">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-soft"><Eye className="h-4 w-4" /> Aperçu</div>
            <div className="pointer-events-none"><EventCard event={preview} /></div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {ev.tickets.map((t) => <Badge key={t.id} tone="brand">{t.name || '—'}</Badge>)}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, CheckCircle2, ExternalLink, FileUp, Globe } from 'lucide-react';
import { organizers } from '@/data/mock';
import { saveOrganizer } from '@/services/api';
import { load, persist, useApp } from '@/store/app';
import { useTitle } from '@/lib/hooks';
import { orgOf } from '@/lib/permissions';
import { useForm } from '@/lib/form';
import { Avatar, Badge, Button, Card, Field, IconBadge, Input, PageHeader, Textarea, Toggle } from '@/components/ui';

const DOCS = ['Pièce d’identité', 'Patente / NIF', 'Justificatif bancaire'];

export default function OrgSettings() {
  const { toast, t, user } = useApp();
  useTitle(t('Paramètres'));
  const org = organizers.find((o) => o.id === orgOf(user))!;
  const [busy, setBusy] = useState(false);
  const [display, setDisplayState] = useState(() => load('e509.orgDisplay', { showFollowers: true, showRemaining: true }));
  const [docs, setDocs] = useState<string[]>(() => load('e509.orgDocs', org.verified ? DOCS : []));
  const uploadFor = useRef<string>('');
  const fileRef = useRef<HTMLInputElement>(null);

  const profile = useForm(
    { name: org.name, city: org.city, website: org.website ?? '', instagram: org.instagram ?? '', bio: org.bio ?? '' },
    {
      name: (v) => (!String(v).trim() ? t('Indiquez le nom public') : undefined),
      website: (v) => (v && !/^https?:\/\/\S+\.\S+/.test(String(v)) ? t('Saisissez une adresse comme https://monsite.ht') : undefined),
    },
  );
  const pixels = useForm(load('e509.orgPixels', { fb: '1234567890', ga: 'G-7Q2XKD91' }), {
    fb: (v) => (v && !/^\d{10,20}$/.test(String(v)) ? t('Un identifiant Facebook Pixel contient 10 à 20 chiffres') : undefined),
    ga: (v) => (v && !/^G-[A-Z0-9]{6,12}$/.test(String(v)) ? t('Format attendu : G-XXXXXXXXXX') : undefined),
  });

  const saveProfile = async () => {
    if (!profile.validate()) return;
    setBusy(true);
    await saveOrganizer(org.id, profile.values);
    setBusy(false);
    toast(t('Profil public enregistré'));
  };
  const setDisplay = (p: typeof display) => {
    setDisplayState(p);
    persist('e509.orgDisplay', p);
  };
  const savePixels = () => {
    if (!pixels.validate()) return;
    persist('e509.orgPixels', pixels.values);
    toast(t('Pixels enregistrés'));
  };
  const onDoc = (f?: File) => {
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) return toast(t('Fichier trop lourd : 8 Mo maximum'), 'error');
    const next = [...new Set([...docs, uploadFor.current])];
    setDocs(next);
    persist('e509.orgDocs', next);
    toast(t('Document reçu : « {doc} »', { doc: t(uploadFor.current) }));
  };

  return (
    <div className="max-w-3xl">
      <PageHeader title={t('Paramètres')} subtitle={t('Profil public, vérification et outils de suivi.')} />
      <div className="space-y-4">
        <Card>
          <div className="mb-4 flex flex-wrap items-center gap-4">
            <Avatar name={org.avatar} size={64} />
            <div className="min-w-0 flex-1">
              <h2 className="flex items-center gap-1 text-lg font-bold">{profile.values.name} {org.verified && <BadgeCheck className="h-5 w-5 text-brand-ink" aria-label={t('Organisateur vérifié')} />}</h2>
              <Link to={`/o/${org.slug}`} className="flex items-center gap-1 text-sm text-brand-ink">event509.com/o/{org.slug} <ExternalLink className="h-3.5 w-3.5" aria-hidden /></Link>
            </div>
          </div>
          <form noValidate onSubmit={(e) => { e.preventDefault(); saveProfile(); }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('Nom public')} error={profile.errors.name} required><Input {...profile.bind('name')} /></Field>
              <Field label={t('Ville')}><Input {...profile.bind('city')} /></Field>
              <Field label={t('Site web')} error={profile.errors.website}><Input type="url" inputMode="url" placeholder="https://" {...profile.bind('website')} /></Field>
              <Field label="Instagram"><Input placeholder="@" {...profile.bind('instagram')} /></Field>
              <Field label={t('Présentation')} className="sm:col-span-2" hint={t('Affichée sur votre page publique')}><Textarea {...profile.bind('bio')} /></Field>
            </div>
            <div className="mt-4 space-y-3">
              <Toggle checked={display.showFollowers} onChange={(v) => setDisplay({ ...display, showFollowers: v })} label={t('Afficher le nombre d’abonnés')} />
              <Toggle checked={display.showRemaining} onChange={(v) => setDisplay({ ...display, showRemaining: v })} label={t('Afficher les places restantes')} description={t('Crée un sentiment d’urgence quand il reste peu de billets')} />
            </div>
            <Button type="submit" className="mt-4" loading={busy}>{t('Enregistrer')}</Button>
          </form>
        </Card>

        <Card>
          <div className="mb-3 flex items-center gap-3">
            <IconBadge tone="green"><BadgeCheck className="h-[18px] w-[18px]" /></IconBadge>
            <div className="flex-1"><h2 className="font-bold">{t('Vérification de l’organisateur')}</h2><p className="text-sm text-ink-muted">{t('Badge vérifié, publication instantanée, versements plus rapides')}</p></div>
            <Badge tone={docs.length === DOCS.length ? 'green' : 'amber'}>{org.verified ? t('Vérifié') : docs.length === DOCS.length ? t('En cours d’examen') : t('À compléter')}</Badge>
          </div>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => onDoc(e.target.files?.[0])} />
          <ul className="grid gap-2 sm:grid-cols-3">
            {DOCS.map((d) => {
              const ok = docs.includes(d);
              return (
                <li key={d}>
                  <button
                    type="button"
                    onClick={() => { uploadFor.current = d; fileRef.current?.click(); }}
                    className={`flex w-full items-center gap-2 rounded-2xl p-3 text-left text-sm font-semibold ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-canvas text-ink-soft hover:bg-brand-50'}`}
                  >
                    {ok ? <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden /> : <FileUp className="h-4 w-4 shrink-0" aria-hidden />}
                    <span className="flex-1">{t(d)}</span>
                    <span className="sr-only">{ok ? t('envoyé, remplacer') : t('envoyer')}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card>
          <div className="mb-4 flex items-center gap-3">
            <IconBadge><Globe className="h-[18px] w-[18px]" /></IconBadge>
            <div><h2 className="font-bold">{t('Pixels de suivi par défaut')}</h2><p className="text-sm text-ink-muted">{t('Appliqués à toutes vos pages événement')}</p></div>
          </div>
          <form noValidate onSubmit={(e) => { e.preventDefault(); savePixels(); }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Facebook Pixel ID" error={pixels.errors.fb}><Input inputMode="numeric" {...pixels.bind('fb')} /></Field>
              <Field label="Google Analytics (GA4)" error={pixels.errors.ga}><Input {...pixels.bind('ga')} onChange={(e) => pixels.set('ga', e.target.value.toUpperCase())} /></Field>
            </div>
            <p className="mt-3 text-xs text-ink-muted">{t('Événements envoyés : PageView, ViewContent, InitiateCheckout, Purchase (avec montant et devise).')}</p>
            <Button type="submit" className="mt-4" variant="dark">{t('Enregistrer')}</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

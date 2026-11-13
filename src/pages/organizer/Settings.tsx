import { AppLockCard } from '@/components/AppLockCard';
import { ProPageCard } from './ProPageCard';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, CheckCircle2, ExternalLink, FileUp, Globe, ImagePlus } from 'lucide-react';
import { organizers } from '@/data/mock';
import { DEMO, orgVerification, saveOrganizer, uploadFile } from '@/services/api';
import { shrinkImage } from '@/lib/image';
import { load, persist, useApp } from '@/store/app';
import { useAsync, useTitle } from '@/lib/hooks';
import { orgOf } from '@/lib/permissions';
import { useForm } from '@/lib/form';
import { Avatar, Badge, Button, Card, Field, IconBadge, Input, PageHeader, Spinner, Textarea, Toggle } from '@/components/ui';

const DOCS = ['Pièce d’identité', 'Patente / NIF', 'Justificatif bancaire'];
/** Type de chaque document, dans le même ordre que DOCS (voir l'administration). */
const DOC_TYPES = ['id', 'license', 'bank'] as const;

export default function OrgSettings() {
  const { toast, t, user } = useApp();
  useTitle(t('Paramètres'));
  const org = organizers.find((o) => o.id === orgOf(user))!;
  const [busy, setBusy] = useState(false);
  const [display, setDisplayState] = useState(() => load('e509.orgDisplay', { showFollowers: true, showRemaining: true }));
  const [localDocs, setLocalDocs] = useState<string[]>(() => load('e509.orgDocs', org.verified ? DOCS : []));
  // Mode serveur : l'état de la vérification et les documents reçus viennent du serveur
  const ver = useAsync(() => (DEMO ? Promise.resolve(null) : orgVerification()), []);
  const docs = DEMO ? localDocs : DOCS.filter((_, i) => ver.data?.docs.some((d) => d.type === DOC_TYPES[i]));
  const verified = DEMO ? org.verified : !!ver.data?.verified;
  const reviewStatus = DEMO ? (docs.length === DOCS.length ? 'pending' : 'none') : ver.data?.status ?? 'none';
  const [uploadingDoc, setUploadingDoc] = useState('');
  const [logo, setLogo] = useState(org.logo);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const uploadFor = useRef<string>('');
  const fileRef = useRef<HTMLInputElement>(null);

  const profile = useForm(
    { name: org.name, city: org.city, website: org.website ?? '', instagram: org.instagram ?? '', bio: org.bio ?? '' },
    {
      name: (v) => (!String(v).trim() ? t('Indiquez le nom public') : undefined),
      website: (v) => (v && !/^https?:\/\/\S+\.\S+/.test(String(v)) ? t('Saisissez une adresse comme https://monsite.ht') : undefined),
    },
  );
  const pixels = useForm(load('e509.orgPixels', DEMO ? { fb: '1234567890', ga: 'G-7Q2XKD91' } : { fb: '', ga: '' }), {
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
  const onDoc = async (f?: File) => {
    if (!f) return;
    const doc = uploadFor.current;
    if (DEMO) {
      if (f.size > 8 * 1024 * 1024) return toast(t('Fichier trop lourd : 8 Mo maximum'), 'error');
      const next = [...new Set([...localDocs, doc])];
      setLocalDocs(next);
      persist('e509.orgDocs', next);
      toast(t('Document reçu : « {doc} »', { doc: t(doc) }));
      return;
    }
    const isPdf = f.type === 'application/pdf';
    if (!isPdf && !f.type.startsWith('image/')) return toast(t('Envoyez une image ou un PDF'), 'error');
    if (isPdf && f.size > 3 * 1024 * 1024) return toast(t('PDF trop lourd : 3 Mo maximum'), 'error');
    setUploadingDoc(doc);
    try {
      // Les photos sont réduites (lisibles, mais légères) ; les PDF sont envoyés tels quels
      const blob = isPdf ? f : await shrinkImage(f, { maxSide: 2400, type: 'image/jpeg', quality: 0.88 });
      await uploadFile('verification', blob, f.name, DOC_TYPES[DOCS.indexOf(doc)]);
      ver.reload();
      toast(t('Document reçu : « {doc} »', { doc: t(doc) }));
    } catch {
      toast(t('Le document n’a pas pu être envoyé. Vérifiez votre connexion et réessayez.'), 'error');
    } finally {
      setUploadingDoc('');
    }
  };

  const onLogo = async (f?: File) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast(t('Choisissez une image JPG, PNG ou WebP'), 'error');
    if (f.size > 15 * 1024 * 1024) return toast(t('Image trop lourde : 15 Mo maximum'), 'error');
    setUploadingLogo(true);
    try {
      const { url } = await uploadFile('org_logo', await shrinkImage(f, { maxSide: 512, type: 'image/png' }), f.name);
      await saveOrganizer(org.id, { logo: url });
      setLogo(url);
      toast(t('Logo enregistré'));
    } catch {
      toast(t('L’image n’a pas pu être envoyée. Vérifiez votre connexion et réessayez.'), 'error');
    } finally {
      setUploadingLogo(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <PageHeader title={t('Paramètres')} subtitle={t('Profil public, vérification et outils de suivi.')} />
      <div className="space-y-4">
        <AppLockCard />
        <Card>
          <div className="mb-4 flex flex-wrap items-center gap-4">
            <Avatar name={org.avatar} src={logo} size={64} />
            <div className="min-w-0 flex-1">
              <h2 className="flex items-center gap-1 text-lg font-bold">{profile.values.name} {verified && <BadgeCheck className="h-5 w-5 text-brand-ink" aria-label={t('Organisateur vérifié')} />}</h2>
              <Link to={`/o/${org.slug}`} className="flex items-center gap-1 text-sm text-brand-ink">{window.location.host}/o/{org.slug} <ExternalLink className="h-3.5 w-3.5" aria-hidden /></Link>
            </div>
            <input ref={logoRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { void onLogo(e.target.files?.[0]); e.target.value = ''; }} />
            <Button type="button" variant="outline" size="sm" loading={uploadingLogo} onClick={() => logoRef.current?.click()}>
              <ImagePlus className="h-4 w-4" aria-hidden /> {logo ? t('Changer le logo') : t('Ajouter un logo')}
            </Button>
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

        <ProPageCard />

        {DEMO ? (
          <Card>
            <div className="mb-3 flex items-center gap-3">
              <IconBadge tone="green"><BadgeCheck className="h-[18px] w-[18px]" /></IconBadge>
              <div className="flex-1"><h2 className="font-bold">{t('Vérification de l’organisateur')}</h2><p className="text-sm text-ink-muted">{t('Badge vérifié, publication instantanée, versements plus rapides')}</p></div>
              <Badge tone={verified ? 'green' : reviewStatus === 'rejected' ? 'red' : reviewStatus === 'pending' ? 'green' : 'amber'}>
                {verified ? t('Vérifié') : reviewStatus === 'rejected' ? t('Refusé') : reviewStatus === 'docs_requested' ? t('Documents demandés') : reviewStatus === 'pending' ? t('En cours d’examen') : t('À compléter')}
              </Badge>
            </div>
            {!verified && ver.data?.note && (reviewStatus === 'docs_requested' || reviewStatus === 'rejected') && (
              <p role="status" className="mb-3 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">{t('Message de l’équipe Event509 :')} {ver.data.note}</p>
            )}
            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { void onDoc(e.target.files?.[0]); e.target.value = ''; }} />
            <ul className="grid gap-2 sm:grid-cols-3">
              {DOCS.map((d) => {
                const ok = docs.includes(d);
                return (
                  <li key={d}>
                    <button
                      type="button"
                      onClick={() => { uploadFor.current = d; fileRef.current?.click(); }}
                      disabled={!!uploadingDoc}
                      aria-busy={uploadingDoc === d}
                      className={`flex w-full items-center gap-2 rounded-2xl p-3 text-left text-sm font-semibold disabled:opacity-60 ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-canvas text-ink-soft hover:bg-brand-50'}`}
                    >
                      {uploadingDoc === d ? <Spinner className="h-4 w-4" /> : ok ? <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden /> : <FileUp className="h-4 w-4 shrink-0" aria-hidden />}
                      <span className="flex-1">{t(d)}</span>
                      <span className="sr-only">{ok ? t('envoyé, remplacer') : t('envoyer')}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : (
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <IconBadge tone="green"><BadgeCheck className="h-[18px] w-[18px]" /></IconBadge>
              <div className="min-w-0 flex-1"><h2 className="font-bold">{t('Organisateur vérifié')}</h2><p className="text-sm text-ink-muted">{t('Coche bleue officielle, outils professionnels et support prioritaire')}</p></div>
              <Badge tone={verified ? 'green' : 'gray'}>{verified ? t('Vérifié') : t('Non vérifié')}</Badge>
              <Link to="/organisateur/verification" className="text-sm font-semibold text-brand-ink">{verified ? t('Gérer') : t('Demander la vérification')}</Link>
            </div>
          </Card>
        )}

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

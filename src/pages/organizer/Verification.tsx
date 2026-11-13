import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, CircleDashed, FileUp, Info, Lock } from 'lucide-react';
import { useApp } from '@/store/app';
import { useAsync, useTitle } from '@/lib/hooks';
import { dateShort } from '@/lib/format';
import { shrinkImage } from '@/lib/image';
import { uploadFile } from '@/services/api';
import { getPremium, premiumAvailable, saveApplicationDraft, sendAppeal, submitApplication, type PremiumOverview } from '@/services/premium';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { Badge, Button, ButtonLink, Card, EmptyState, Field, Input, Loading, PageHeader, Select, Spinner, Textarea, Toggle, type Tone } from '@/components/ui';
import type { VerificationApplication, VerificationDocType, VerificationStatus } from '@/types';

const STATUS: Record<VerificationStatus | 'none', { l: string; tone: Tone; d: string }> = {
  none: { l: 'Non demandée', tone: 'gray', d: 'Déposez votre demande pour obtenir la coche bleue.' },
  draft: { l: 'Brouillon', tone: 'gray', d: 'Votre demande n’est pas encore envoyée.' },
  pending: { l: 'En attente', tone: 'amber', d: 'Votre demande est bien reçue : un administrateur va l’examiner.' },
  in_review: { l: 'En cours de vérification', tone: 'brand', d: 'Un administrateur examine actuellement votre dossier.' },
  docs_requested: { l: 'Documents supplémentaires requis', tone: 'violet', d: 'Complétez votre dossier puis renvoyez-le.' },
  approved: { l: 'Vérifié', tone: 'green', d: 'Votre identité et vos informations ont été vérifiées.' },
  rejected: { l: 'Refusé', tone: 'red', d: 'Votre demande a été refusée. Vous pouvez déposer un recours.' },
  suspended: { l: 'Suspendu', tone: 'amber', d: 'Votre vérification est suspendue. Consultez le motif ci-dessous.' },
  expired: { l: 'Expiré', tone: 'gray', d: 'Votre abonnement ou votre certification a pris fin. Vos données sont conservées.' },
};

const docLabels: Record<VerificationDocType, string> = {
  id: 'Pièce d’identité', selfie: 'Selfie de vérification', registration: 'Document d’enregistrement de l’entreprise',
  representation: 'Justificatif de représentation légale', license: 'Patente / NIF', bank: 'Justificatif bancaire',
};
const ORG_TYPES: { v: VerificationApplication['orgType']; l: string }[] = [
  { v: 'company', l: 'Entreprise' }, { v: 'association', l: 'Association' }, { v: 'institution', l: 'Institution' }, { v: 'agency', l: 'Agence événementielle' }, { v: 'independent', l: 'Indépendant' },
];
const ACTIONS_OPEN: VerificationStatus[] = ['draft', 'docs_requested', 'rejected', 'expired'];

const EMPTY: Partial<VerificationApplication> = { fullName: '', birthDate: '', email: '', phone: '', country: 'Haïti', orgName: '', orgType: '', activity: '', address: '', website: '', socials: '' };

function ageOf(iso?: string) {
  if (!iso) return 99;
  const d = new Date(`${iso}T00:00:00Z`);
  const n = new Date();
  let a = n.getUTCFullYear() - d.getUTCFullYear();
  if (n.getUTCMonth() < d.getUTCMonth() || (n.getUTCMonth() === d.getUTCMonth() && n.getUTCDate() < d.getUTCDate())) a--;
  return a;
}

/** Suivi de la demande « Organisateur vérifié » et formulaire en quatre étapes (enregistré automatiquement). */
export default function Verification() {
  const { t } = useApp();
  useTitle(t('Organisateur vérifié'));
  const ov = useAsync(() => (premiumAvailable ? getPremium() : Promise.resolve(null)), [], { throwOnError: true });
  if (!premiumAvailable)
    return <EmptyState icon={<Lock className="h-5 w-5" />} title={t('Programme disponible sur le site en ligne')} body={t('La demande de vérification nécessite le serveur : elle n’est pas disponible dans la démonstration.')} />;
  // Pendant un rechargement on garde la page affichée : le formulaire ne perd pas sa saisie
  if (!ov.data) return <Loading />;
  return <Content ov={ov.data} reload={ov.reload} />;
}

function Content({ ov, reload }: { ov: PremiumOverview; reload: () => void }) {
  const { t, lang } = useApp();
  const status: VerificationStatus | 'none' = ov.request?.status ?? 'none';
  const open = status === 'none' || ACTIONS_OPEN.includes(status as VerificationStatus);
  const progress = [
    { l: 'Demande', done: status !== 'none' && status !== 'draft' },
    { l: 'Paiement', done: ov.subscriptionActive },
    { l: 'Vérification', done: status === 'approved' || status === 'expired' || status === 'suspended' },
    { l: 'Badge actif', done: ov.verified },
  ];
  const st = STATUS[status];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('Organisateur vérifié')} subtitle={t('Faites certifier votre identité et accédez aux outils professionnels.')} />

      <ol className="mb-6 grid grid-cols-4 gap-2" aria-label={t('Progression')}>
        {progress.map((s, i) => (
          <li key={s.l} className="text-center">
            <span className={`mx-auto grid h-9 w-9 place-items-center rounded-full text-sm font-extrabold ${s.done ? 'bg-emerald-600 text-white' : 'bg-canvas text-ink-muted ring-1 ring-line'}`}>
              {s.done ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
            </span>
            <span className="mt-1 block text-xs font-semibold">{t(s.l)}</span>
            <span className="sr-only">{s.done ? t('terminé') : t('à faire')}</span>
          </li>
        ))}
      </ol>

      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          {ov.verified && <VerifiedBadge size={28} />}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h2 className="font-bold">{t('Statut de la vérification')}</h2><Badge tone={st.tone}>{t(st.l)}</Badge></div>
            <p className="mt-1 text-sm text-ink-soft">{t(st.d)}</p>
            {ov.verifiedSince && <p className="mt-1 text-xs text-ink-muted">{t('Certifié depuis le {date}', { date: dateShort(ov.verifiedSince, lang) })}</p>}
          </div>
        </div>
        {ov.request?.note && ['docs_requested', 'rejected', 'suspended'].includes(status) && (
          <p role="note" className="mt-3 rounded-2xl bg-violet-50 p-3 text-sm text-violet-700 dark:bg-violet-500/10 dark:text-violet-300"><Info className="mr-1 inline h-4 w-4" aria-hidden />{ov.request.note}</p>
        )}
        {!ov.subscriptionActive && status !== 'none' && status !== 'draft' && status !== 'rejected' && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-canvas p-3 text-sm">
            <span className="flex-1">{t('Votre abonnement n’est pas actif : le badge reste masqué tant qu’il n’est pas réglé.')}</span>
            <ButtonLink to="/organisateur/abonnement" size="sm">{t('Payer l’abonnement')}</ButtonLink>
          </div>
        )}
        {ov.verified && <div className="mt-4"><ButtonLink to="/organisateur/abonnement" variant="outline" size="sm">{t('Mon abonnement professionnel')}</ButtonLink></div>}
      </Card>

      {status === 'rejected' && <Appeal ov={ov} onDone={reload} />}

      {open ? (
        ov.config.enabled ? <Wizard ov={ov} reload={reload} /> : <EmptyState icon={<Lock className="h-5 w-5" />} title={t('Programme fermé')} body={t('Le programme n’accepte pas de nouvelles demandes pour le moment.')} />
      ) : (
        <Summary ov={ov} />
      )}

      {ov.history.length > 0 && (
        <section className="mt-8" aria-labelledby="h-hist">
          <h2 id="h-hist" className="mb-3 text-lg font-extrabold">{t('Historique')}</h2>
          <ul className="space-y-2">
            {ov.history.map((h) => (
              <li key={h.id} className="rounded-2xl bg-surface p-3 text-sm shadow-card">
                <div className="flex flex-wrap justify-between gap-2"><b>{t(h.action)}</b><span className="text-xs text-ink-muted">{dateShort(h.at, lang)}</span></div>
                {h.note && <p className="mt-1 text-ink-soft">{h.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Summary({ ov }: { ov: PremiumOverview }) {
  const { t } = useApp();
  const a = ov.request?.application ?? {};
  const rows: [string, string | undefined][] = [
    ['Nom complet', a.fullName], ['Organisation', a.orgName], ['Type', ORG_TYPES.find((x) => x.v === a.orgType)?.l], ['Site web', a.website], ['Réseaux sociaux', a.socials],
  ];
  return (
    <Card>
      <h2 className="mb-3 font-bold">{t('Votre demande')}</h2>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {rows.filter((r) => r[1]).map(([k, v]) => <div key={k}><dt className="text-xs font-semibold text-ink-muted">{t(k)}</dt><dd>{k === 'Type' ? t(v!) : v}</dd></div>)}
      </dl>
      <p className="mt-4 text-xs text-ink-muted">{t('{n} document(s) envoyé(s). Ils sont privés : seuls les administrateurs autorisés peuvent les consulter.', { n: ov.request?.docs.length ?? 0 })}</p>
    </Card>
  );
}

function Appeal({ ov, onDone }: { ov: PremiumOverview; onDone: () => void }) {
  const { t, toast } = useApp();
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  if (ov.request?.appeal) return null;
  return (
    <Card className="mb-6">
      <h2 className="font-bold">{t('Contester la décision')}</h2>
      <p className="mt-1 text-sm text-ink-soft">{t('Expliquez pourquoi votre demande devrait être réexaminée. Un administrateur relira votre dossier.')}</p>
      <div className="mt-3"><Field label={t('Votre recours')}><Textarea rows={4} maxLength={1500} value={msg} onChange={(e) => setMsg(e.target.value)} /></Field></div>
      <Button className="mt-3" loading={busy} onClick={async () => {
        setBusy(true);
        try { await sendAppeal(msg); toast(t('Recours envoyé')); onDone(); } catch (e) { toast(e instanceof Error ? e.message : t('Envoi impossible'), 'error'); } finally { setBusy(false); }
      }}>{t('Envoyer le recours')}</Button>
    </Card>
  );
}

function Wizard({ ov, reload }: { ov: PremiumOverview; reload: () => void }) {
  const { t, toast, user } = useApp();
  const [step, setStep] = useState(0);
  const [a, setA] = useState<Partial<VerificationApplication>>(() => ({ ...EMPTY, email: user?.email ?? '', fullName: user?.name ?? '', ...ov.request?.application }));
  const [saved, setSaved] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string>('');
  const first = useRef(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const forDoc = useRef<VerificationDocType>('id');
  const set = <K extends keyof VerificationApplication>(k: K, v: VerificationApplication[K]) => { setA((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); };
  const minor = !!a.birthDate && ageOf(a.birthDate) < ov.config.minAge;

  // Sauvegarde automatique : 1 s après la dernière saisie
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const id = setTimeout(() => { saveApplicationDraft(a).then((r) => setSaved(r.savedAt)).catch(() => setSaved(null)); }, 1000);
    return () => clearTimeout(id);
  }, [a]);

  const have = (d: VerificationDocType) => ov.request?.docs.some((x) => x.type === d);
  const required: VerificationDocType[] = [...ov.config.requiredDocs, ...(minor ? (['representation'] as const) : [])];
  const need = (d: VerificationDocType) => required.includes(d);

  const validate = (s: number) => {
    const e: Record<string, string> = {};
    const req = (k: keyof VerificationApplication, msg: string) => { if (!String(a[k] ?? '').trim()) e[k] = msg; };
    if (s === 0) {
      req('fullName', t('Indiquez votre nom complet')); req('birthDate', t('Indiquez votre date de naissance')); req('phone', t('Indiquez votre téléphone')); req('country', t('Indiquez votre pays'));
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email ?? '')) e.email = t('Saisissez une adresse comme nom@domaine.com');
      if (minor && !a.legalRep) e.legalRep = t('Confirmez que vous êtes représenté légalement');
    }
    if (s === 1) {
      req('orgName', t('Indiquez le nom de l’organisation')); req('orgType', t('Choisissez un type')); req('activity', t('Décrivez votre activité'));
      if (a.website && !/^https?:\/\/\S+\.\S+/.test(a.website)) e.website = t('Saisissez une adresse comme https://monsite.ht');
    }
    if (s === 2) {
      const missing = required.filter((d) => !have(d));
      if (missing.length) e.docs = t('Documents obligatoires manquants : {docs}', { docs: missing.map((d) => t(docLabels[d]).toLowerCase()).join(', ') });
      if (!a.website?.trim() && !a.socials?.trim() && !(['registration', 'license', 'bank'] as const).some(have)) e.presence = t('Indiquez un site web ou un réseau social (étape 2), ou envoyez un document d’enregistrement');
    }
    if (s === 3) {
      if (!a.acceptedTerms) e.acceptedTerms = t('Acceptez les conditions pour continuer');
      if (!a.confirmedAccurate) e.confirmedAccurate = t('Confirmez l’exactitude des informations');
    }
    setErrors(e);
    return !Object.keys(e).length;
  };

  const onFile = async (f?: File) => {
    if (!f) return;
    const doc = forDoc.current;
    const isPdf = f.type === 'application/pdf';
    if (!isPdf && !f.type.startsWith('image/')) return toast(t('Envoyez une image ou un PDF'), 'error');
    if (isPdf && f.size > 3 * 1024 * 1024) return toast(t('PDF trop lourd : 3 Mo maximum'), 'error');
    setUploading(doc);
    try {
      const blob = isPdf ? f : await shrinkImage(f, { maxSide: 2400, type: 'image/jpeg', quality: 0.88 });
      await uploadFile('verification', blob, f.name, doc);
      toast(t('Document reçu : « {doc} »', { doc: t(docLabels[doc]) }));
      setErrors((x) => ({ ...x, docs: '' }));
      reload();
    } catch {
      toast(t('Le document n’a pas pu être envoyé. Vérifiez votre connexion et réessayez.'), 'error');
    } finally {
      setUploading('');
    }
  };

  const next = () => { if (validate(step)) setStep(step + 1); };
  const submit = async () => {
    if (!validate(3)) return;
    setBusy(true);
    try {
      await saveApplicationDraft(a);
      await submitApplication();
      toast(t('Demande envoyée. Vous serez prévenu de chaque étape.'));
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Envoi impossible. Réessayez.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const TITLES = ['Informations personnelles', 'Informations professionnelles', 'Documents justificatifs', 'Confirmation'];
  const docSlot = (d: VerificationDocType, note: string) => (
    <li key={d} className="flex items-center gap-3 rounded-2xl bg-canvas p-3 text-sm">
      {have(d) ? <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden /> : <CircleDashed className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />}
      <span className="min-w-0 flex-1"><span className="block font-semibold">{t(docLabels[d])}</span><span className="block text-xs text-ink-muted">{need(d) ? t('Obligatoire') : note}</span></span>
      <Button size="sm" variant="outline" disabled={!!uploading} onClick={() => { forDoc.current = d; fileRef.current?.click(); }}>
        {uploading === d ? <Spinner /> : <FileUp className="h-4 w-4" aria-hidden />} {have(d) ? t('Remplacer') : t('Envoyer')}
      </Button>
    </li>
  );

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold">{t('Étape {n} sur 4', { n: step + 1 })} — {t(TITLES[step]!)}</h2>
        <span className="text-xs text-ink-muted" role="status">{saved ? t('Enregistré automatiquement') : t('Enregistrement automatique actif')}</span>
      </div>

      {step === 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('Nom complet')} error={errors.fullName} required><Input autoComplete="name" value={a.fullName ?? ''} onChange={(e) => set('fullName', e.target.value)} /></Field>
          <Field label={t('Date de naissance')} error={errors.birthDate} required><Input type="date" autoComplete="bday" value={a.birthDate ?? ''} onChange={(e) => set('birthDate', e.target.value)} /></Field>
          <Field label={t('Adresse email')} error={errors.email} required><Input type="email" inputMode="email" autoComplete="email" value={a.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label={t('Téléphone')} error={errors.phone} required><Input type="tel" inputMode="tel" autoComplete="tel" value={a.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label={t('Pays de résidence')} error={errors.country} required className="sm:col-span-2"><Input autoComplete="country-name" value={a.country ?? ''} onChange={(e) => set('country', e.target.value)} /></Field>
          {minor && (
            <div className="sm:col-span-2">
              <Toggle checked={!!a.legalRep} onChange={(v) => set('legalRep', v)} label={t('Je suis représenté légalement')} description={t('Vous avez moins de {n} ans : un justificatif de représentation légale sera demandé.', { n: ov.config.minAge })} />
              {errors.legalRep && <p role="alert" className="mt-1 text-sm font-semibold text-red-600">{errors.legalRep}</p>}
            </div>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="grid gap-4">
          <Field label={t('Nom de l’organisation')} error={errors.orgName} required><Input value={a.orgName ?? ''} onChange={(e) => set('orgName', e.target.value)} /></Field>
          <Field label={t('Type d’organisation')} error={errors.orgType} required>
            <Select value={a.orgType ?? ''} onChange={(e) => set('orgType', e.target.value as VerificationApplication['orgType'])}>
              <option value="">{t('Choisir…')}</option>
              {ORG_TYPES.map((o) => <option key={o.v} value={o.v}>{t(o.l)}</option>)}
            </Select>
          </Field>
          <Field label={t('Description de l’activité')} error={errors.activity} required><Textarea rows={4} maxLength={1500} value={a.activity ?? ''} onChange={(e) => set('activity', e.target.value)} /></Field>
          <Field label={t('Adresse professionnelle (facultatif)')}><Input autoComplete="street-address" value={a.address ?? ''} onChange={(e) => set('address', e.target.value)} /></Field>
          <Field label={t('Site web')} error={errors.website}><Input type="url" inputMode="url" placeholder="https://" value={a.website ?? ''} onChange={(e) => set('website', e.target.value)} /></Field>
          <Field label={t('Liens vers vos réseaux sociaux')} hint={t('Un lien par ligne')}><Textarea rows={3} maxLength={600} value={a.socials ?? ''} onChange={(e) => set('socials', e.target.value)} /></Field>
        </div>
      )}

      {step === 2 && (
        <div>
          <p className="mb-3 text-sm text-ink-soft">{t('Photo ou PDF lisible. Vos documents sont privés : ils ne sont jamais accessibles publiquement et chaque consultation par l’administration est enregistrée.')}</p>
          <ul className="space-y-2">
            {docSlot('id', t('Facultatif'))}
            {docSlot('selfie', t('Si nécessaire'))}
            {docSlot('registration', t('Si applicable'))}
            {docSlot('representation', minor ? t('Obligatoire') : t('Si applicable'))}
          </ul>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" aria-label={t('Choisir un fichier')} onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
          {errors.docs && <p role="alert" className="mt-3 text-sm font-semibold text-red-600">{errors.docs}</p>}
          {errors.presence && <p role="alert" className="mt-2 text-sm font-semibold text-red-600">{errors.presence}</p>}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-canvas p-4 text-sm">
            <p><b>{a.fullName}</b> · {a.orgName}</p>
            <p className="text-ink-muted">{a.email} · {a.phone}</p>
            <p className="mt-2 text-ink-soft">{t('{n} document(s) envoyé(s).', { n: ov.request?.docs.length ?? 0 })}</p>
          </div>
          <div>
            <Toggle checked={!!a.acceptedTerms} onChange={(v) => set('acceptedTerms', v)} label={<span>{t('J’accepte les')} <Link to="/cgu" className="underline">{t('conditions d’utilisation')}</Link> {t('et la')} <Link to="/confidentialite" className="underline">{t('politique de vérification')}</Link></span>} />
            {errors.acceptedTerms && <p role="alert" className="mt-1 text-sm font-semibold text-red-600">{errors.acceptedTerms}</p>}
          </div>
          <div>
            <Toggle checked={!!a.confirmedAccurate} onChange={(v) => set('confirmedAccurate', v)} label={t('Je confirme que les informations fournies sont exactes')} />
            {errors.confirmedAccurate && <p role="alert" className="mt-1 text-sm font-semibold text-red-600">{errors.confirmedAccurate}</p>}
          </div>
          <p className="text-xs text-ink-muted">{t('Le paiement de l’abonnement est une étape distincte, et le badge n’est jamais activé sans l’accord d’un administrateur. Délai habituel : {n} jour(s).', { n: ov.config.processingDays })}</p>
        </div>
      )}

      <div className="mt-6 flex justify-between gap-3">
        <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>{t('Retour')}</Button>
        {step < 3 ? <Button onClick={next}>{t('Continuer')}</Button> : <Button loading={busy} onClick={submit}>{t('Envoyer ma demande')}</Button>}
      </div>
    </Card>
  );
}

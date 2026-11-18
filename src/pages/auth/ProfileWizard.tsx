import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, ShieldCheck } from 'lucide-react';
import { useApp } from '@/store/app';
import { AccountTypePicker, type AccountType } from '@/components/AccountTypePicker';
import { COUNTRIES, countryName } from '@/data/countries';
import { ApiError } from '@/lib/errors';
import { Button, Card, Field, Input, Select } from '@/components/ui';
import type { ProfileDraft, QuestionDraft } from '@/services/api';

/** Inscription (étape après Google) ou complétion d'un ancien compte : profil, trois questions de sécurité, conditions. Le serveur contrôle tout. */
export function ProfileWizard({
  email, initial, onSubmit, title, askType = false,
}: {
  /** Inscription : choix acheteur / organisateur (pas pour la complétion d'un compte existant). */
  askType?: boolean;
  email: string;
  initial: Partial<ProfileDraft>;
  onSubmit: (d: ProfileDraft) => Promise<void>;
  title: string;
}) {
  const { t, lang } = useApp();
  const examples = [t('Quel était le surnom que j’utilisais pendant mon enfance ?'), t('Quel était le nom de mon premier projet personnel ?'), t('Quel était le nom de mon premier événement organisé ?')];
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [p, setP] = useState({ givenName: initial.givenName ?? '', familyName: initial.familyName ?? '', country: initial.country || 'HT', city: initial.city ?? '', username: initial.username ?? '', orgName: '' });
  const [accountType, setAccountType] = useState<AccountType>('buyer');
  const [qs, setQs] = useState<QuestionDraft[]>([{ question: '', answer: '' }]);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const profileOk = p.givenName.trim() && p.familyName.trim() && p.city.trim().length >= 2 && /^[A-Za-z]{2}$/.test(p.country);
  const questionsOk = qs.every((q) => q.question.trim().length >= 8 && q.answer.trim().length >= 3);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await onSubmit({ ...p, ...(askType ? { accountType } : {}), username: p.username.trim() || undefined, orgName: accountType === 'organizer' ? p.orgName.trim() || undefined : undefined, questions: qs, acceptTerms: terms, acceptPrivacy: privacy });
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      if (code === 'profile_invalid' || code === 'username_taken') setStep(1);
      else if (code === 'questions_invalid') setStep(2);
      setError(e instanceof ApiError && e.status !== 0 ? e.message : t('Réseau indisponible. Vérifiez votre connexion et réessayez.'));
    } finally {
      setBusy(false);
    }
  };
  const setQ = (i: number, k: keyof QuestionDraft, v: string) => setQs(qs.map((q, j) => (j === i ? { ...q, [k]: v } : q)));

  return (
    <div className="mx-auto max-w-xl px-4 pt-8 sm:pt-12">
      <Card className="p-6 sm:p-8">
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        <ol className="mt-4 flex gap-2 text-xs font-semibold" aria-label={t('Étapes')}>
          {[t('Profil'), t('Sécurité'), t('Conditions')].map((l, i) => (
            <li key={l} aria-current={step === i + 1 ? 'step' : undefined} className={`flex-1 rounded-full px-3 py-1.5 text-center ${step === i + 1 ? 'bg-contrast text-on-contrast' : step > i + 1 ? 'bg-emerald-50 text-emerald-700' : 'bg-canvas text-ink-muted'}`}>
              {step > i + 1 && <Check className="mr-1 inline h-3 w-3" aria-hidden />}{i + 1}. {l}
            </li>
          ))}
        </ol>
        {error && <p role="alert" className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}

        {step === 1 && (
          <form noValidate className="mt-5 space-y-4" onSubmit={(e) => { e.preventDefault(); if (profileOk) { setError(''); setStep(2); } }}>
            {askType && <AccountTypePicker value={accountType} onChange={setAccountType} />}
            <Field label={t('Adresse e-mail Google')} hint={t('Fournie par Google, non modifiable')}><Input value={email} readOnly disabled /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('Prénom')} required><Input autoComplete="given-name" value={p.givenName} onChange={(e) => setP({ ...p, givenName: e.target.value })} /></Field>
              <Field label={t('Nom')} required><Input autoComplete="family-name" value={p.familyName} onChange={(e) => setP({ ...p, familyName: e.target.value })} /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('Pays')} required>
                <Select value={p.country} onChange={(e) => setP({ ...p, country: e.target.value })}>
                  {[...COUNTRIES].sort((a, b) => countryName(a, lang).localeCompare(countryName(b, lang), lang)).map((c) => <option key={c} value={c}>{countryName(c, lang)}</option>)}
                </Select>
              </Field>
              <Field label={t('Ville')} required><Input autoComplete="address-level2" value={p.city} onChange={(e) => setP({ ...p, city: e.target.value })} /></Field>
            </div>
            <Field label={t('Nom d’utilisateur')} hint={t('Facultatif : sert aussi à retrouver votre compte')}><Input autoComplete="username" value={p.username} onChange={(e) => setP({ ...p, username: e.target.value })} /></Field>
            {askType && accountType === 'organizer' && <Field label={t('Nom de votre organisation')} hint={t('Facultatif : par défaut, votre nom')}><Input autoComplete="organization" value={p.orgName} onChange={(e) => setP({ ...p, orgName: e.target.value })} /></Field>}
            <Button type="submit" size="lg" className="w-full" disabled={!profileOk}>{t('Continuer')}</Button>
          </form>
        )}

        {step === 2 && (
          <form noValidate className="mt-5 space-y-5" onSubmit={(e) => { e.preventDefault(); if (questionsOk) { setError(''); setStep(3); } }}>
            <div className="flex gap-3 rounded-2xl bg-brand-50/60 p-4 text-sm text-ink-soft">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-ink" aria-hidden />
              <p>{t('Cette question vous aidera à prouver que vous êtes bien le propriétaire du compte si vous perdez l’accès à Google. Écrivez vos propres questions, sur des informations que vous seul connaissez. Évitez la date de naissance, le nom de famille, l’adresse, vos parents ou tout ce qui est visible sur les réseaux sociaux. Vos réponses sont protégées et ne seront plus jamais affichées.')}</p>
            </div>
            {qs.map((q, i) => (
              <fieldset key={i} className="space-y-3 rounded-2xl border border-line p-4">
                <legend className="px-1 text-sm font-bold">{t('Question {n}', { n: i + 1 })}</legend>
                {i > 0 && <button type="button" className="text-xs font-semibold text-red-600" onClick={() => setQs(qs.filter((_, j) => j !== i))}>{t('Retirer cette question')}</button>}
                <Field label={t('Votre question')} required><Input value={q.question} maxLength={160} onChange={(e) => setQ(i, 'question', e.target.value)} placeholder={t('Ex. {example}', { example: examples[i]! })} /></Field>
                <Field label={t('Votre réponse')} required><Input autoComplete="off" value={q.answer} maxLength={100} onChange={(e) => setQ(i, 'answer', e.target.value)} /></Field>
              </fieldset>
            ))}
            {qs.length < 3 && <Button type="button" variant="ghost" onClick={() => setQs([...qs, { question: '', answer: '' }])}>{t('+ Ajouter une question (facultatif, jusqu’à 3)')}</Button>}
            {!questionsOk && <p className="text-xs text-ink-muted" role="status">{t('Question : 8 caractères au moins. Réponse : 3 caractères au moins.')}</p>}
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4" aria-hidden /> {t('Retour')}</Button>
              <Button type="submit" className="flex-1" disabled={!questionsOk}>{t('Continuer')}</Button>
            </div>
          </form>
        )}

        {step === 3 && (
          <form noValidate className="mt-5 space-y-4" onSubmit={(e) => { e.preventDefault(); if (terms && privacy) void submit(); }}>
            <label className="flex items-start gap-2.5 text-sm"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
              <span>{t('J’accepte les')} <Link to="/cgu" target="_blank" className="font-semibold text-brand-ink underline">{t('conditions d’utilisation')}</Link></span></label>
            <label className="flex items-start gap-2.5 text-sm"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
              <span>{t('J’accepte la')} <Link to="/confidentialite" target="_blank" className="font-semibold text-brand-ink underline">{t('politique de confidentialité')}</Link></span></label>
            <p className="text-xs text-ink-muted">{t('Votre compte n’est créé qu’à la fin de cette étape.')}</p>
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4" aria-hidden /> {t('Retour')}</Button>
              <Button type="submit" className="flex-1" loading={busy} disabled={!terms || !privacy}>{t('Créer mon compte')}</Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}

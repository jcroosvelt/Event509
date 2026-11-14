import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, KeyRound } from 'lucide-react';
import { useApp } from '@/store/app';
import { useTitle } from '@/lib/hooks';
import { ApiError } from '@/lib/errors';
import {
  assistCreate, assistGoogle, assistStatus, recoveryAnswers, recoveryCode, recoveryGoogle, recoveryPasskeyOptions, recoveryPasskeyVerify,
  recoveryQuestions, recoveryStart,
} from '@/services/api';
import { passkeyCancelled, passkeysSupported, getPasskeyAssertion } from '@/lib/webauthn';
import { Button, Card, Field, Input } from '@/components/ui';
import { inApp, postApp } from '@/lib/appBridge';

const KEY = 'e509.assist';

/**
 * « Je n'ai plus accès à mon compte Google ». Messages neutres : rien ne révèle si un compte existe ni quelles méthodes il a.
 * Passkey ou code de récupération, PUIS questions de sécurité ; sinon, demande d'assistance examinée par l'administration.
 */
export default function RecoverAccount() {
  const { t, toast } = useApp();
  useTitle(t('Je n’ai plus accès à mon compte Google'));
  const [params] = useSearchParams();
  const [identifier, setIdentifier] = useState('');
  const [token, setToken] = useState('');
  const [factors, setFactors] = useState<{ first: boolean; questions: boolean }>({ first: false, questions: false });
  const [questions, setQuestions] = useState<string[] | null>(null);
  const [answers, setAnswers] = useState(['', '', '']);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [assist, setAssist] = useState({ open: false, reason: '', contact: '' });
  const [request, setRequest] = useState<string>(() => { try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; } });
  const [status, setStatus] = useState<{ status: string; executeAfter: string | null; ready: boolean } | null>(null);

  useEffect(() => {
    if (request) assistStatus(request).then(setStatus).catch(() => setStatus(null));
  }, [request]);

  const generic = t('Vérification impossible. Vérifiez les informations ou demandez de l’aide.');
  const guard = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg('');
    try {
      await fn();
    } catch (e) {
      if (passkeyCancelled(e)) return;
      setMsg(e instanceof ApiError && e.code === 'rate_limited' ? t('Trop de tentatives. Réessayez plus tard ou demandez de l’aide.') : e instanceof ApiError && e.status === 0 ? t('Réseau indisponible.') : generic);
    } finally {
      setBusy(false);
    }
  };

  const start = () => guard(async () => { setToken((await recoveryStart(identifier.trim())).recoveryToken); });
  const withPasskey = () => guard(async () => {
    const o = await recoveryPasskeyOptions(token);
    await recoveryPasskeyVerify(token, o.challengeId, await getPasskeyAssertion(o.options));
    setFactors((f) => ({ ...f, first: true }));
    setQuestions((await recoveryQuestions(token)).questions);
  });
  const withCode = () => guard(async () => {
    await recoveryCode(token, code);
    setFactors((f) => ({ ...f, first: true }));
    setQuestions((await recoveryQuestions(token)).questions);
  });
  const answer = () => guard(async () => {
    await recoveryAnswers(token, answers);
    setFactors((f) => ({ ...f, questions: true }));
  });
  const toGoogle = () => guard(async () => { location.assign((await recoveryGoogle(token)).url); });
  const sendAssist = () => guard(async () => {
    const r = await assistCreate(identifier.trim(), assist.reason, assist.contact);
    try { localStorage.setItem(KEY, r.requestToken); } catch { /* ignoré */ }
    setRequest(r.requestToken);
    setAssist({ open: false, reason: '', contact: '' });
    toast(t('Demande enregistrée. Gardez cet appareil : le suivi s’affiche ici.'));
  });
  const continueAssist = () => guard(async () => { location.assign((await assistGoogle(request)).url); });

  return (
    <div className="mx-auto max-w-lg px-4 pt-8 sm:pt-12">
      <Link to="/connexion" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-ink-soft"><ArrowLeft className="h-4 w-4" aria-hidden /> {t('Connexion')}</Link>
      <Card className="p-6 sm:p-8">
        <h1 className="text-2xl font-extrabold tracking-tight">{t('Je n’ai plus accès à mon compte Google')}</h1>
        <p className="mt-1 text-sm text-ink-soft">{t('Vous pouvez retrouver votre compte EVENT509 et y associer un nouveau compte Google. Toutes vos données sont conservées.')}</p>
        {params.get('error') && <p role="alert" className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{t('La récupération n’a pas abouti. Recommencez ou demandez de l’aide.')}</p>}
        {msg && <p role="alert" className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{msg}</p>}

        {!token ? (
          <form noValidate className="mt-5 space-y-4" onSubmit={(e) => { e.preventDefault(); if (identifier.trim().length >= 3) void start(); }}>
            <Field label={t('Adresse e-mail ou nom d’utilisateur de votre compte EVENT509')} required><Input autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} /></Field>
            <Button type="submit" size="lg" className="w-full" loading={busy} disabled={identifier.trim().length < 3}>{t('Continuer')}</Button>
          </form>
        ) : (
          <div className="mt-5 space-y-5">
            <p className="text-sm text-ink-soft">{t('Prouvez que ce compte est bien à vous. Il faut une passkey ou un code de récupération, puis vos réponses aux questions de sécurité.')}</p>

            <section aria-label={t('Étape 1')} className="space-y-3 rounded-2xl border border-line p-4">
              <h2 className="flex items-center gap-2 text-sm font-bold">{factors.first ? <Check className="h-4 w-4 text-emerald-600" aria-hidden /> : <KeyRound className="h-4 w-4" aria-hidden />} {t('1. Passkey ou code de récupération')}</h2>
              {!factors.first && (
                <>
                  {passkeysSupported() && <Button variant="outline" className="w-full" onClick={withPasskey} loading={busy}>{t('Utiliser une passkey')}</Button>}
                  <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void withCode(); }}>
                    <Field label={t('Code de récupération')}><Input autoComplete="off" placeholder="XXXX-XXXX-XXXX" value={code} onChange={(e) => setCode(e.target.value)} /></Field>
                    <Button type="submit" variant="soft" className="w-full" loading={busy} disabled={code.replace(/[^A-Za-z0-9]/g, '').length < 12}>{t('Utiliser ce code')}</Button>
                  </form>
                </>
              )}
            </section>

            {questions && (
              <section aria-label={t('Étape 2')} className="space-y-3 rounded-2xl border border-line p-4">
                <h2 className="flex items-center gap-2 text-sm font-bold">{factors.questions && <Check className="h-4 w-4 text-emerald-600" aria-hidden />} {t('2. Vos questions de sécurité')}</h2>
                {!factors.questions && (
                  <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void answer(); }}>
                    {questions.map((q, i) => <Field key={i} label={q}><Input autoComplete="off" value={answers[i]} onChange={(e) => setAnswers(answers.map((a, j) => (j === i ? e.target.value : a)))} /></Field>)}
                    <Button type="submit" className="w-full" loading={busy} disabled={answers.some((a) => a.trim().length < 1)}>{t('Valider mes réponses')}</Button>
                  </form>
                )}
              </section>
            )}

            {factors.first && factors.questions && (
              inApp() ? (
                <div className="rounded-2xl bg-canvas p-3 text-sm text-ink-soft">
                  <p>{t('Pour associer un nouveau compte Google, ouvrez cette page dans le navigateur du téléphone (Google ne s’ouvre pas dans l’application), puis refaites les vérifications.')}</p>
                  <Button className="mt-2" variant="outline" onClick={() => postApp(`browser:open:${location.origin}/connexion/recuperation`)}>{t('Ouvrir dans le navigateur')}</Button>
                </div>
              ) : <Button size="lg" className="w-full" onClick={toGoogle} loading={busy}>{t('Associer un nouveau compte Google')}</Button>
            )}
          </div>
        )}

        <div className="mt-6 border-t border-line pt-4 text-sm">
          <h2 className="font-bold">{t('Aucune de ces méthodes ?')}</h2>
          {status ? (
            <div className="mt-2 space-y-2 rounded-2xl bg-canvas p-4" role="status">
              {status.status === 'pending' && <p>{t('Votre demande est en cours d’examen par l’équipe EVENT509.')}</p>}
              {status.status === 'approved' && !status.ready && <p>{t('Votre demande est approuvée. Par sécurité, elle ne sera utilisable qu’à partir du {date}.', { date: status.executeAfter ? new Date(status.executeAfter).toLocaleString() : '' })}</p>}
              {status.status === 'approved' && status.ready && <><p>{t('Votre demande est approuvée et utilisable.')}</p>{inApp() ? <Button variant="outline" onClick={() => postApp(`browser:open:${location.origin}/connexion/recuperation`)}>{t('Ouvrir dans le navigateur')}</Button> : <Button onClick={continueAssist} loading={busy}>{t('Associer un nouveau compte Google')}</Button>}</>}
              {['rejected', 'cancelled'].includes(status.status) && <p>{t('Votre demande n’a pas été acceptée. Vous pouvez en déposer une autre avec plus de précisions.')}</p>}
              {status.status === 'completed' && <p>{t('Cette demande a déjà été utilisée.')}</p>}
              <Button variant="ghost" size="sm" onClick={() => { try { localStorage.removeItem(KEY); } catch { /* ignoré */ } setRequest(''); setStatus(null); }}>{t('Faire une nouvelle demande')}</Button>
            </div>
          ) : assist.open ? (
            <form className="mt-2 space-y-3" onSubmit={(e) => { e.preventDefault(); void sendAssist(); }}>
              <Field label={t('Adresse e-mail ou nom d’utilisateur du compte')} required><Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} /></Field>
              <Field label={t('Pourquoi demandez-vous de l’aide ?')} hint={t('Expliquez votre situation et ce qui prouve que le compte est à vous (événements organisés, personnes qui peuvent vous confirmer…).')} required>
                <textarea className="min-h-28 w-full rounded-2xl border border-line bg-surface p-3 text-sm" value={assist.reason} maxLength={1000} onChange={(e) => setAssist({ ...assist, reason: e.target.value })} />
              </Field>
              <Field label={t('Comment vous joindre ?')} hint={t('Facultatif : un autre e-mail ou numéro')}><Input value={assist.contact} onChange={(e) => setAssist({ ...assist, contact: e.target.value })} /></Field>
              <p className="text-xs text-ink-muted">{t('Connaître votre nom, votre e-mail ou votre date de naissance ne suffit pas à prouver que le compte est à vous. L’examen peut demander des vérifications supplémentaires et un délai de sécurité de 48 heures s’applique.')}</p>
              <Button type="submit" className="w-full" loading={busy} disabled={identifier.trim().length < 3 || assist.reason.trim().length < 30}>{t('Envoyer ma demande')}</Button>
            </form>
          ) : (
            <Button className="mt-2" variant="outline" onClick={() => setAssist({ ...assist, open: true })}>{t('Demander l’aide de l’équipe EVENT509')}</Button>
          )}
        </div>
      </Card>
    </div>
  );
}

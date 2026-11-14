import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Fingerprint, KeyRound, LifeBuoy, Laptop, ShieldCheck, Trash2 } from 'lucide-react';
import { useApp } from '@/store/app';
import { useAsync, useTitle } from '@/lib/hooks';
import { ApiError } from '@/lib/errors';
import { dateShort } from '@/lib/format';
import {
  cancelRecoveryRequest, deletePasskey, generateRecoveryCodes, googleUrl, linkConfirm, linkPending, linkUndo, listDeviceSessions, passkeyRegisterOptions,
  passkeyRegisterVerify, reauthPasskeyOptions, reauthPasskeyVerify, reauthWithCode, replaceQuestions, revokeDeviceSession, revokeOtherSessions,
  revokeRecoveryCodes, securitySummary, type QuestionDraft,
} from '@/services/api';
import { createPasskey, passkeyCancelled, passkeysSupported, getPasskeyAssertion } from '@/lib/webauthn';
import { Badge, Button, Card, Field, Input, Loading, Modal, PageHeader } from '@/components/ui';
import { inApp, postApp } from '@/lib/appBridge';

/** Libellés du journal (écrits avec t('…') pour être traduits). */
const eventLabels = (t: (s: string) => string): Record<string, string> => ({
  login: t('Connexion'), account_created: t('Compte créé'), profile_completed: t('Profil complété'), passkey_added: t('Passkey ajoutée'), passkey_removed: t('Passkey supprimée'),
  google_linked: t('Compte Google associé'), google_changed: t('Compte Google remplacé'), google_change_undone: t('Changement de compte Google annulé'),
  recovery_code_used: t('Code de récupération utilisé'), recovery_codes_generated: t('Codes de récupération générés'), recovery_codes_revoked: t('Codes de récupération révoqués'),
  questions_replaced: t('Questions de sécurité remplacées'), session_revoked: t('Session fermée'), sessions_revoked: t('Sessions fermées'), recovery_started: t('Récupération commencée'),
  recovery_requested: t('Demande de récupération avec assistance'), recovery_approved: t('Demande de récupération approuvée'), recovery_rejected: t('Demande de récupération refusée'),
  recovery_blocked: t('Demande de récupération bloquée'), recovery_completed: t('Récupération terminée'), recovery_request_cancelled: t('Demande de récupération annulée'),
  reauth: t('Identité confirmée'), reauth_failed: t('Confirmation d’identité échouée'), recovery_factor_failed: t('Vérification de récupération échouée'), recovery_factor_ok: t('Vérification de récupération réussie'),
});

const BLANK: QuestionDraft[] = [{ question: '', answer: '' }];

/** Page centrale de sécurité : identités, passkeys, récupération, appareils et sessions, historique. Aucun secret ni réponse n'y est affiché. */
export default function Security() {
  const { t, lang, toast, user } = useApp();
  useTitle(t('Sécurité du compte'));
  const [params, setParams] = useSearchParams();
  const sum = useAsync(() => securitySummary(), []);
  const sess = useAsync(() => listDeviceSessions(), []);
  const reload = () => { sum.reload(); sess.reload(); };
  const [reauthFor, setReauthFor] = useState<(() => Promise<void>) | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [qOpen, setQOpen] = useState(false);
  const [qs, setQs] = useState<QuestionDraft[]>(BLANK);
  const [pkName, setPkName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkToken] = useState(params.get('link'));
  const [linkEmail, setLinkEmail] = useState('');

  useEffect(() => {
    if (!linkToken) return;
    linkPending(linkToken).then((r) => setLinkEmail(r.email)).catch(() => toast(t('Cette demande a expiré. Recommencez.'), 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkToken]);
  useEffect(() => {
    if (params.get('recovered')) toast(t('Votre compte est récupéré. Vos autres sessions ont été fermées.'));
    const e = params.get('error');
    if (e) toast(({ reauth_required: t('Confirmez d’abord votre identité.'), google_in_use: t('Ce compte Google est déjà associé à un autre compte EVENT509.'), same_google: t('C’est déjà le compte Google associé.'), wrong_google: t('Ce n’est pas le compte Google associé à votre compte.') } as Record<string, string>)[e] ?? t('Une erreur est survenue. Réessayez.'), 'error');
    if (params.get('recovered') || e) setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Exécute une opération sensible ; si le serveur demande de confirmer l'identité, ouvre la confirmation puis recommence. */
  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'reauth_required') setReauthFor(() => fn);
      else if (e instanceof ApiError && e.code === 'last_method') toast(t('C’est votre seule méthode de connexion : ajoutez-en une autre avant de la supprimer.'), 'error');
      else if (e instanceof ApiError && e.code === 'questions_invalid') toast(e.message, 'error');
      else if (!passkeyCancelled(e)) toast(t('L’opération a échoué. Réessayez.'), 'error');
    }
  };

  if (sum.loading || !sum.data) return <Loading />;
  const s = sum.data;
  const labels = eventLabels(t);
  const dateTime = (iso: string) => `${dateShort(iso, lang)} ${new Date(iso).toLocaleTimeString(lang === 'en' ? 'en-US' : 'fr-FR', { hour: '2-digit', minute: '2-digit' })}`;

  const addPasskey = (name: string) => run(async () => {
    const o = await passkeyRegisterOptions();
    const response = await createPasskey(o.options);
    await passkeyRegisterVerify(o.challengeId, response, name);
    setPkName(null);
    toast(t('Passkey enregistrée'));
    reload();
  });
  const saveQuestions = () => run(async () => {
    await replaceQuestions(qs);
    setQOpen(false);
    setQs(BLANK);
    toast(t('Questions de sécurité remplacées'));
    reload();
  });
  const makeCodes = () => run(async () => {
    const r = await generateRecoveryCodes();
    setCodes(r.codes);
    reload();
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 pt-6 sm:px-6 lg:pt-10">
      <PageHeader title={t('Sécurité du compte')} subtitle={t('Gérez votre connexion, votre récupération et vos appareils. Aucun secret n’est affiché ici.')} />

      {linkToken && linkEmail && (
        <Card className="border-2 border-amber-300 bg-amber-50">
          <h2 className="font-bold">{t('Confirmer le nouveau compte Google')}</h2>
          <p className="mt-1 text-sm">{t('Vous allez associer {email} à votre compte EVENT509. Toutes vos données sont conservées.', { email: linkEmail })}</p>
          <div className="mt-3 flex gap-2">
            <Button loading={busy} onClick={() => run(async () => {
              setBusy(true);
              try {
                const r = await linkConfirm(linkToken);
                toast(t('Compte Google associé'));
                setParams({}, { replace: true });
                setLinkEmail('');
                if (!r.authComplete) location.assign('/compte/completer');
                else reload();
              } finally {
                setBusy(false);
              }
            })}>{t('Oui, associer ce compte')}</Button>
            <Button variant="outline" onClick={() => { setLinkEmail(''); setParams({}, { replace: true }); }}>{t('Annuler')}</Button>
          </div>
        </Card>
      )}

      {!user?.authComplete && <Card className="bg-amber-50"><p className="text-sm font-semibold">{t('Complétez votre profil pour sécuriser votre compte.')} <Link to="/compte/completer" className="text-brand-ink underline">{t('Compléter')}</Link></p></Card>}

      <Card>
        <h2 className="mb-1 flex items-center gap-2 font-bold"><ShieldCheck className="h-4 w-4" aria-hidden /> {t('Identité')}</h2>
        {s.google ? (
          <>
            <p className="text-sm text-ink-soft">{t('Compte Google associé : {email}', { email: s.google.email })} · {t('depuis le {date}', { date: dateShort(s.google.since, lang) })}</p>
            {inApp() && <BrowserNote />}
            <div className="mt-3 flex flex-wrap gap-2">
              {!inApp() && <Button variant="outline" onClick={() => (s.recentAuth ? location.assign(googleUrl('link')) : setReauthFor(() => async () => location.assign(googleUrl('link'))))}>{t('Changer mon compte Google')}</Button>}
              {s.canUndoGoogleChange && <Button variant="ghost" onClick={() => run(async () => { await linkUndo(); toast(t('Changement annulé')); reload(); })}>{t('Annuler le dernier changement')}</Button>}
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-ink-soft">{t('Aucun compte Google n’est associé. Associez-en un pour vous connecter avec Google : toutes vos données (billets, événements, rôles) sont conservées.')}</p>
            {inApp() ? <BrowserNote /> : <Button className="mt-3" onClick={() => (s.recentAuth ? location.assign(googleUrl('link')) : setReauthFor(() => async () => location.assign(googleUrl('link'))))}>{t('Associer mon compte Google')}</Button>}
          </>
        )}
      </Card>

      <Card>
        <h2 className="mb-1 flex items-center gap-2 font-bold"><Fingerprint className="h-4 w-4" aria-hidden /> {t('Passkeys')}</h2>
        <p className="mb-3 text-sm text-ink-soft">{t('Connectez-vous avec l’empreinte, le visage ou le code de votre appareil. Une passkey n’est pas automatiquement disponible sur un autre téléphone : ajoutez-en une sur chaque appareil.')}</p>
        <ul className="divide-y divide-line">
          {s.passkeys.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{p.name} {p.synced && <Badge tone="gray">{t('synchronisée')}</Badge>}</div>
                <div className="text-xs text-ink-muted">{t('Ajoutée le {date}', { date: dateShort(p.createdAt, lang) })}{p.lastUsedAt ? ` · ${t('utilisée le {date}', { date: dateShort(p.lastUsedAt, lang) })}` : ''}</div>
              </div>
              <Button size="sm" variant="ghost" aria-label={t('Supprimer la passkey {name}', { name: p.name })} onClick={() => run(async () => { await deletePasskey(p.id); toast(t('Passkey supprimée')); reload(); })}><Trash2 className="h-4 w-4 text-red-600" aria-hidden /></Button>
            </li>
          ))}
          {!s.passkeys.length && <li className="py-2 text-sm text-ink-muted">{t('Aucune passkey enregistrée.')}</li>}
        </ul>
        {passkeysSupported() ? <Button className="mt-3" variant="outline" onClick={() => setPkName('')}>{t('Ajouter une passkey sur cet appareil')}</Button> : <p className="mt-3 text-xs text-ink-muted">{t('Cet appareil ne prend pas en charge les passkeys.')}</p>}
      </Card>

      <Card>
        <h2 className="mb-1 flex items-center gap-2 font-bold"><LifeBuoy className="h-4 w-4" aria-hidden /> {t('Récupération du compte')}</h2>
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{t('Questions de sécurité')} : <b>{s.questions.count > 0 ? t('{n} configurée(s)', { n: s.questions.count }) : t('à configurer')}</b>{s.questions.updatedAt ? ` · ${t('modifiées le {date}', { date: dateShort(s.questions.updatedAt, lang) })}` : ''}</span>
            <Button size="sm" variant="outline" onClick={() => setQOpen(true)}>{t('Remplacer mes questions')}</Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{t('Codes de récupération')} : <b>{t('{n} restant(s)', { n: s.recoveryCodes.remaining })}</b></span>
            <span className="flex gap-2">
              <Button size="sm" variant="outline" onClick={makeCodes}>{s.recoveryCodes.remaining ? t('Générer une nouvelle série') : t('Générer mes codes')}</Button>
              {s.recoveryCodes.remaining > 0 && <Button size="sm" variant="ghost" onClick={() => run(async () => { await revokeRecoveryCodes(); toast(t('Codes révoqués')); reload(); })}>{t('Tout révoquer')}</Button>}
            </span>
          </div>
          <p className="text-xs text-ink-muted">{t('Si vous perdez l’accès à Google, ces éléments vous permettent de retrouver votre compte.')} <Link to="/connexion/recuperation" className="text-brand-ink underline">{t('Page de récupération')}</Link></p>
          {s.recoveryRequests.filter((r) => ['pending', 'approved'].includes(r.status)).map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-amber-50 p-3">
              <span>{t('Une demande de récupération avec assistance est en cours sur votre compte.')} {r.executeAfter && t('Utilisable à partir du {date}.', { date: dateTime(r.executeAfter) })}</span>
              <Button size="sm" variant="danger" onClick={() => run(async () => { await cancelRecoveryRequest(r.id); toast(t('Demande annulée')); reload(); })}>{t('Ce n’est pas moi : annuler')}</Button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 flex items-center gap-2 font-bold"><Laptop className="h-4 w-4" aria-hidden /> {t('Mes appareils et sessions')}</h2>
        <ul className="divide-y divide-line">
          {(sess.data ?? []).map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0 text-sm">
                <div className="truncate font-semibold">{d.device} {d.current && <Badge tone="green">{t('cet appareil')}</Badge>}</div>
                <div className="text-xs text-ink-muted">{d.ip ? `${d.ip} · ` : ''}{t('dernière activité {date}', { date: dateTime(d.lastSeenAt) })}</div>
              </div>
              {!d.current && <Button size="sm" variant="outline" onClick={() => run(async () => { await revokeDeviceSession(d.id); toast(t('Session fermée')); reload(); })}>{t('Fermer')}</Button>}
            </li>
          ))}
        </ul>
        {(sess.data?.length ?? 0) > 1 && <Button className="mt-3" variant="outline" onClick={() => run(async () => { const r = await revokeOtherSessions(); toast(t('{n} session(s) fermée(s)', { n: r.revoked })); reload(); })}>{t('Fermer toutes les autres sessions')}</Button>}
      </Card>

      <Card>
        <h2 className="mb-2 font-bold">{t('Historique de sécurité')}</h2>
        <ul className="divide-y divide-line text-sm">
          {s.events.map((e, i) => (
            <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
              <span>{labels[e.event] ?? t('Événement de sécurité')}{typeof e.detail.method === 'string' ? ` · ${e.detail.method}` : ''}{typeof e.detail.device === 'string' ? ` · ${e.detail.device}` : ''}</span>
              <span className="text-xs text-ink-muted">{dateTime(e.at)}{e.ip ? ` · ${e.ip}` : ''}</span>
            </li>
          ))}
          {!s.events.length && <li className="py-2 text-ink-muted">{t('Aucun événement.')}</li>}
        </ul>
      </Card>

      {/* Confirmation d'identité récente (opérations sensibles) */}
      {reauthFor && <ReauthModal onClose={() => setReauthFor(null)} onDone={() => { const fn = reauthFor; setReauthFor(null); reload(); void run(fn); }} />}

      {/* Nom de la nouvelle passkey */}
      <Modal open={pkName !== null} onClose={() => setPkName(null)} title={t('Ajouter une passkey')} size="sm" footer={<Button className="flex-1" onClick={() => addPasskey(pkName?.trim() || t('Mon appareil'))}>{t('Continuer')}</Button>}>
        <Field label={t('Nom de cet appareil')}><Input value={pkName ?? ''} onChange={(e) => setPkName(e.target.value)} placeholder={t('Ex. Mon téléphone')} /></Field>
      </Modal>

      {/* Remplacement des questions */}
      <Modal open={qOpen} onClose={() => setQOpen(false)} title={t('Remplacer mes questions de sécurité')} description={t('Écrivez vos propres questions, sur des informations que vous seul connaissez (pas de date de naissance, nom de famille, adresse, parents, réseaux sociaux).')} footer={<Button className="flex-1" onClick={saveQuestions} disabled={!qs.every((q) => q.question.trim().length >= 8 && q.answer.trim().length >= 3)}>{t('Enregistrer')}</Button>}>
        <div className="space-y-4">
          {qs.length < 3 && <Button type="button" variant="ghost" size="sm" onClick={() => setQs([...qs, { question: '', answer: '' }])}>{t('+ Ajouter une question (facultatif, jusqu’à 3)')}</Button>}
          {qs.map((q, i) => (
            <fieldset key={i} className="space-y-2 rounded-2xl border border-line p-3">
              <legend className="px-1 text-sm font-bold">{t('Question {n}', { n: i + 1 })}</legend>
              <Field label={t('Votre question')}><Input value={q.question} maxLength={160} onChange={(e) => setQs(qs.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))} /></Field>
              <Field label={t('Votre réponse')}><Input autoComplete="off" value={q.answer} maxLength={100} onChange={(e) => setQs(qs.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))} /></Field>
            </fieldset>
          ))}
        </div>
      </Modal>

      {/* Codes : affichés une seule fois */}
      <Modal open={!!codes} onClose={() => undefined} title={t('Vos codes de récupération')} description={t('Conservez-les dans un endroit sûr (gestionnaire de mots de passe, papier rangé en lieu sûr). Ils ne seront plus jamais affichés. Chaque code ne sert qu’une fois.')}
        footer={<Button className="flex-1" onClick={() => setCodes(null)}>{t('J’ai conservé mes codes')}</Button>}>
        <ul className="grid grid-cols-2 gap-2 font-mono text-sm" aria-label={t('Codes de récupération')}>{codes?.map((c) => <li key={c} className="rounded-xl bg-canvas px-3 py-2 text-center tracking-wider">{c}</li>)}</ul>
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="outline" onClick={() => void navigator.clipboard?.writeText((codes ?? []).join('\n')).then(() => toast(t('Codes copiés')))}>{t('Copier')}</Button>
          <Button size="sm" variant="outline" onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([`EVENT509 — codes de récupération\n\n${(codes ?? []).join('\n')}\n`], { type: 'text/plain' })); a.download = 'event509-codes-de-recuperation.txt'; a.click(); }}>{t('Télécharger')}</Button>
        </div>
      </Modal>
    </div>
  );
}

/** Dans l'application, Google ne peut pas s'ouvrir (WebView refusée) : ces actions se font dans le navigateur du téléphone. */
function BrowserNote() {
  const { t } = useApp();
  return (
    <div className="mt-3 rounded-2xl bg-canvas p-3 text-sm text-ink-soft">
      <p>{t('Dans l’application, associer ou changer le compte Google se fait dans le navigateur du téléphone.')}</p>
      <Button size="sm" variant="outline" className="mt-2" onClick={() => postApp(`browser:open:${location.origin}/compte/securite`)}>{t('Ouvrir dans le navigateur')}</Button>
    </div>
  );
}

/** Confirmation d'identité récente : Google, passkey ou code de récupération. */
function ReauthModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { t, toast } = useApp();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const withPasskey = async () => {
    setBusy(true);
    try {
      const o = await reauthPasskeyOptions();
      await reauthPasskeyVerify(o.challengeId, await getPasskeyAssertion(o.options));
      onDone();
    } catch (e) {
      if (!passkeyCancelled(e)) toast(t('Vérification impossible. Réessayez.'), 'error');
    } finally {
      setBusy(false);
    }
  };
  const withCode = async () => {
    setBusy(true);
    try {
      await reauthWithCode(code);
      onDone();
    } catch {
      toast(t('Code incorrect ou déjà utilisé.'), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={t('Confirmez votre identité')} description={t('Cette opération est sensible : prouvez que c’est bien vous.')} size="sm">
      <div className="space-y-4">
        {!inApp() && <a href={googleUrl('reauth', '/compte/securite')} className="flex h-11 items-center justify-center rounded-full border border-line text-sm font-bold hover:bg-canvas">{t('Confirmer avec Google')}</a>}
        {passkeysSupported() && <Button variant="outline" className="w-full" onClick={withPasskey} loading={busy}><KeyRound className="h-4 w-4" aria-hidden /> {t('Confirmer avec une passkey')}</Button>}
        <form onSubmit={(e) => { e.preventDefault(); void withCode(); }} className="space-y-2">
          <Field label={t('Ou un code de récupération')}><Input value={code} autoComplete="off" placeholder="XXXX-XXXX-XXXX" onChange={(e) => setCode(e.target.value)} /></Field>
          <Button type="submit" variant="soft" className="w-full" loading={busy} disabled={code.replace(/[^A-Za-z0-9]/g, '').length < 12}>{t('Utiliser ce code')}</Button>
        </form>
      </div>
    </Modal>
  );
}

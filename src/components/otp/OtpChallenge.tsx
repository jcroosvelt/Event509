import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, MessageCircle, TimerReset } from 'lucide-react';
import { useApp } from '@/store/app';
import { ApiError } from '@/lib/errors';
import { Button, Field, Input } from '@/components/ui';
import type { OtpSent } from '@/services/api';

/** Message à afficher pour une erreur du serveur (le serveur décide ; l'interface ne fait qu'expliquer). */
export function otpErrorMessage(e: unknown, t: (s: string) => string): string {
  const code = e instanceof ApiError ? e.code : undefined;
  switch (code) {
    case 'otp_invalid': return t('Code incorrect. Vérifiez les 6 chiffres reçus sur WhatsApp.');
    case 'otp_expired': return t('Ce code a expiré. Demandez-en un nouveau.');
    case 'otp_locked': return t('Trop d’essais : ce code n’est plus valable. Demandez-en un nouveau.');
    case 'otp_limit': return t('Limite atteinte : 3 codes par 24 heures. Réessayez plus tard.');
    case 'phone_invalid': return t('Numéro invalide. Utilisez le format international, par exemple +509 3712 3456.');
    case 'otp_unreachable': return t('Ce numéro n’est pas joignable sur WhatsApp.');
    case 'otp_invalid_number': return t('Ce numéro ne peut pas recevoir de message WhatsApp. Vérifiez-le.');
    case 'otp_unavailable': return t('La vérification par WhatsApp n’est pas encore disponible.');
    case 'otp_auth': case 'otp_template': case 'otp_rate_limit': case 'otp_temporary':
      return t('L’envoi du code a échoué. Réessayez dans quelques instants.');
    case 'phone_unverified': return t('Ajoutez et vérifiez d’abord votre numéro WhatsApp.');
    default: return e instanceof ApiError && e.status === 0 ? t('Réseau indisponible. Vérifiez votre connexion.') : t('Une erreur est survenue. Réessayez.');
  }
}

/** Compte à rebours en secondes (0 = terminé). */
export function useCountdown(seconds: number | null) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (seconds == null) return;
    const end = Date.now() + seconds * 1000;
    setLeft(seconds);
    const id = setInterval(() => {
      const l = Math.max(0, Math.round((end - Date.now()) / 1000));
      setLeft(l);
      if (l === 0) clearInterval(id);
    }, 500);
    return () => clearInterval(id);
  }, [seconds]);
  return left;
}
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Champ du numéro WhatsApp (format international). */
export function PhoneField({ value, onChange, error, disabled }: { value: string; onChange: (v: string) => void; error?: string; disabled?: boolean }) {
  const { t } = useApp();
  return (
    <Field label={t('Numéro WhatsApp')} error={error} hint={t('Format international, ex. +509 3712 3456')} required>
      <Input type="tel" inputMode="tel" autoComplete="tel" placeholder="+509 3712 3456" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

/** Saisie du code à 6 chiffres. */
export function OtpCodeInput({ value, onChange, error, disabled }: { value: string; onChange: (v: string) => void; error?: string; disabled?: boolean }) {
  const { t } = useApp();
  return (
    <Field label={t('Code reçu sur WhatsApp')} error={error} required>
      <Input
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder="••••••"
        disabled={disabled}
        className="text-center text-lg tracking-[0.5em]"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      />
    </Field>
  );
}

/**
 * Parcours « recevoir un code puis le saisir » réutilisable (inscription, mot de passe oublié, changement de mot de passe).
 * Le composant n'affiche « vérifié » que lorsque le serveur a accepté le code (`verify` réussit) : jamais de décision locale.
 */
export function OtpChallenge({
  send, verify, onVerified, phoneLabel, autoSend = false,
}: {
  send: () => Promise<OtpSent>;
  verify: (code: string) => Promise<void>;
  onVerified: () => void;
  /** Numéro (masqué) auquel le code est envoyé. */
  phoneLabel?: string;
  autoSend?: boolean;
}) {
  const { t } = useApp();
  const [phase, setPhase] = useState<'idle' | 'sent' | 'verified'>('idle');
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [ttl, setTtl] = useState<number | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const remaining = useCountdown(ttl);
  const started = useRef(false);

  const doSend = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await send();
      setPhase('sent');
      setCode('');
      setTtl(r.expiresInSeconds);
      setLeft(r.requestsLeft ?? null);
    } catch (e) {
      setError(otpErrorMessage(e, t));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (autoSend && !started.current) {
      started.current = true;
      void doSend();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doVerify = async () => {
    if (code.length !== 6) return setError(t('Saisissez les 6 chiffres du code.'));
    setBusy(true);
    setError('');
    try {
      await verify(code);
      setPhase('verified');
      onVerified();
    } catch (e) {
      setError(otpErrorMessage(e, t));
      if (e instanceof ApiError && ['otp_locked', 'otp_expired'].includes(e.code ?? '')) setCode('');
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'verified')
    return (
      <p role="status" className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
        <CheckCircle2 className="h-4 w-4" aria-hidden /> {t('Numéro confirmé')}
      </p>
    );

  if (phase === 'idle')
    return (
      <div className="space-y-3">
        <Button type="button" variant="soft" className="w-full" onClick={doSend} loading={busy}>
          <MessageCircle className="h-4 w-4" aria-hidden /> {t('Recevoir le code sur WhatsApp')}
        </Button>
        {error && <p role="alert" className="text-xs font-semibold text-red-600">{error}</p>}
      </div>
    );

  const expired = remaining === 0;
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft" role="status">
        {phoneLabel ? t('Un code à 6 chiffres a été envoyé sur WhatsApp au {phone}.', { phone: phoneLabel }) : t('Un code à 6 chiffres vous a été envoyé sur WhatsApp.')}
      </p>
      <OtpCodeInput value={code} onChange={setCode} error={error} disabled={busy} />
      <p className={expired ? 'text-xs font-semibold text-red-600' : 'text-xs text-ink-muted'} aria-live="polite">
        {expired ? t('Code expiré') : t('Expire dans {time}', { time: mmss(remaining) })}
      </p>
      <Button type="button" className="w-full" onClick={doVerify} loading={busy} disabled={expired || code.length !== 6}>{t('Confirmer le code')}</Button>
      <Button type="button" variant="ghost" className="w-full" onClick={doSend} disabled={busy}>
        <TimerReset className="h-4 w-4" aria-hidden /> {t('Renvoyer un code')}
        {left != null && <span className="ml-1 text-xs text-ink-muted">({t('{n} restant(s) aujourd’hui', { n: left })})</span>}
      </Button>
    </div>
  );
}

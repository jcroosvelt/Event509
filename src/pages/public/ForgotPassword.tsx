import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { requestPasswordReset, DEMO, otpEnabled, otpForgotSend, otpForgotVerify, otpResetPassword } from '@/services/api';
import { OtpChallenge, PhoneField, otpErrorMessage } from '@/components/otp/OtpChallenge';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/store/app';
import { useTitle } from '@/lib/hooks';
import { isEmail, isPhone, useForm } from '@/lib/form';
import { Button, Card, Field, IconBadge, Input } from '@/components/ui';

/** Mot de passe oublié par code WhatsApp : numéro, code, puis nouveau mot de passe (autorisation distincte du code, à usage unique). */
function ForgotByWhatsapp() {
  const { t, toast } = useApp();
  const nav = useNavigate();
  const [phone, setPhone] = useState('');
  const [phase, setPhase] = useState<'phone' | 'code' | 'password'>('phone');
  const [token, setToken] = useState('');
  const [pw, setPw] = useState({ next: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (pw.next.length < 8 || !/[A-Za-zÀ-ÿ]/.test(pw.next) || !/\d/.test(pw.next)) return setError(t('Au moins 8 caractères, avec une lettre et un chiffre'));
    if (pw.next !== pw.confirm) return setError(t('Les deux mots de passe doivent être identiques'));
    setBusy(true);
    setError('');
    try {
      await otpResetPassword(token, pw.next);
      toast(t('Mot de passe modifié. Connectez-vous avec le nouveau.'));
      nav('/connexion', { replace: true });
    } catch (e) {
      setError(otpErrorMessage(e, t));
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight">{t('Mot de passe oublié')}</h1>
      {phase !== 'password' && (
        <>
          <p className="text-sm text-ink-soft">{t('Indiquez le numéro WhatsApp de votre compte : nous vous envoyons un code à 6 chiffres.')}</p>
          <PhoneField value={phone} onChange={setPhone} disabled={phase === 'code'} />
          {phase === 'code' && <button type="button" onClick={() => setPhase('phone')} className="text-sm font-semibold text-brand-ink">{t('Changer de numéro')}</button>}
          {isPhone(phone) && (
            <OtpChallenge
              key={phone}
              send={async () => {
                const r = await otpForgotSend(phone);
                setPhase('code');
                return { sent: true as const, expiresInSeconds: r.expiresInSeconds };
              }}
              verify={async (code) => setToken((await otpForgotVerify(phone, code)).resetToken)}
              onVerified={() => setPhase('password')}
            />
          )}
        </>
      )}
      {phase === 'password' && (
        <form noValidate onSubmit={(e) => { e.preventDefault(); void save(); }} className="space-y-4">
          <Field label={t('Nouveau mot de passe')} hint={t('8 caractères minimum, avec une lettre et un chiffre')} required>
            <Input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          </Field>
          <Field label={t('Confirmer le mot de passe')} error={error} required>
            <Input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={busy}>{t('Enregistrer')}</Button>
        </form>
      )}
    </div>
  );
}

export default function ForgotPassword() {
  const { t, toast } = useApp();
  const [wa, setWa] = useState(false);
  useEffect(() => {
    if (!DEMO) void otpEnabled().then(setWa);
  }, []);
  useTitle(t('Mot de passe oublié'), { noindex: true });
  const [sent, setSent] = useState('');
  const [loading, setLoading] = useState(false);
  const form = useForm({ email: '' }, { email: (v) => (!isEmail(v) ? t('Saisissez une adresse comme nom@domaine.com') : undefined) });

  const submit = async () => {
    if (!form.validate()) return;
    setLoading(true);
    try {
      await requestPasswordReset(form.values.email);
      setSent(form.values.email);
    } catch {
      toast(t('L’envoi a échoué. Vérifiez votre connexion et réessayez.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 pt-10">
      <Link to="/connexion" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-ink-soft"><ArrowLeft className="h-4 w-4" aria-hidden /> {t('Connexion')}</Link>
      <Card className="p-6 sm:p-8">
        {wa ? <ForgotByWhatsapp /> : sent ? (
          <div className="text-center" role="status">
            <IconBadge size="lg" className="mx-auto"><MailCheck className="h-5 w-5" /></IconBadge>
            <h1 className="mt-4 text-xl font-extrabold">{t('Vérifiez votre boîte mail')}</h1>
            <p className="mt-2 text-sm text-ink-soft">{t('Si un compte existe pour {email}, vous recevrez un lien valable 1 heure.', { email: sent })}</p>
            {DEMO && (
              <Link to="/reinitialiser?token=demo" className="mt-4 inline-block text-sm font-semibold text-brand-ink">{t('Démo : ouvrir le lien reçu')}</Link>
            )}
            <Button variant="ghost" className="mt-4 w-full" onClick={() => setSent('')}>{t('Utiliser une autre adresse')}</Button>
          </div>
        ) : (
          <form noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <h1 className="text-2xl font-extrabold tracking-tight">{t('Mot de passe oublié')}</h1>
            <p className="mt-1 text-sm text-ink-soft">{t('Indiquez l’email de votre compte : nous vous envoyons un lien pour choisir un nouveau mot de passe.')}</p>
            <Field label={t('Email')} error={form.errors.email} className="mt-6" required>
              <Input type="email" inputMode="email" autoComplete="email" {...form.bind('email')} />
            </Field>
            <Button type="submit" size="lg" className="mt-6 w-full" loading={loading}>{t('Envoyer le lien')}</Button>
          </form>
        )}
      </Card>
    </div>
  );
}

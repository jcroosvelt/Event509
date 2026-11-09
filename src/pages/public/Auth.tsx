import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Phone } from 'lucide-react';
import { useApp } from '@/store/app';
import { useTitle } from '@/lib/hooks';
import { isEmail, isPhone, useForm } from '@/lib/form';
import { hasOrganizerAccess } from '@/lib/permissions';
import { Button, Card, Field, Input, Segmented, Toggle } from '@/components/ui';
import type { AppUser } from '@/types';
import { DEMO, signIn, signUp } from '@/services/api';
import { ApiError } from '@/lib/errors';

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path fill="#4285F4" d="M22.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-7.9Z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8l3.7-2.8Z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4Z" />
    </svg>
  );
}

/** Comptes de démonstration, un par rôle, pour tester les permissions. */
const demoAccounts = [
  { id: 'u1', label: 'Participant' },
  { id: 'u2', label: 'Organisateur (admin)' },
  { id: 'u8', label: 'Staff d’entrée' },
  { id: 'u9', label: 'Comptable' },
  { id: 'u7', label: 'Admin plateforme' },
];

export default function Auth({ mode }: { mode: 'login' | 'signup' }) {
  const { login, startSession, updateUser, toast, t } = useApp();
  const signup = mode === 'signup';
  useTitle(signup ? t('Créer un compte') : t('Connexion'));
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next');
  const [via, setVia] = useState<'email' | 'phone'>('email');
  const [otpSent, setOtpSent] = useState(false);
  const [organizer, setOrganizer] = useState(params.get('organisateur') === '1');
  const [loading, setLoading] = useState(false);

  const form = useForm(
    { name: '', email: '', password: '', phone: '', otp: '' },
    {
      name: (v) => (signup && !String(v).trim() ? t('Indiquez votre nom') : undefined),
      email: (v) => (via === 'email' && !isEmail(v) ? t('Saisissez une adresse comme nom@domaine.com') : undefined),
      password: (v) => (via === 'email' && (signup ? String(v).length < 8 : !v) ? (signup ? t('Choisissez au moins 8 caractères') : t('Saisissez votre mot de passe')) : undefined),
      phone: (v) => (via === 'phone' && !isPhone(v) ? t('Saisissez un numéro comme +509 3712 3456') : undefined),
      otp: (v) => (via === 'phone' && otpSent && !/^\d{6}$/.test(String(v)) ? t('Saisissez les 6 chiffres reçus par SMS') : undefined),
    },
  );

  const finish = (u: AppUser) => {
    toast(signup ? t('Compte créé, bienvenue !') : t('Bonjour {name} !', { name: u.name.split(' ')[0] }));
    nav(next ?? (hasOrganizerAccess(u) ? '/organisateur' : u.role === 'admin' ? '/admin' : '/'), { replace: true });
  };

  /** Mode serveur : vraie connexion ou inscription par email et mot de passe. */
  const submitReal = async () => {
    setLoading(true);
    try {
      const s = signup
        ? await signUp({ name: form.values.name.trim(), email: form.values.email.trim(), password: form.values.password, organizer })
        : await signIn(form.values.email.trim(), form.values.password);
      await startSession(s);
      finish(s.user);
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      if (status === 401) form.setErrors({ password: t('Email ou mot de passe incorrect') });
      else if (status === 409) form.setErrors({ email: t('Un compte existe déjà avec cet email. Connectez-vous.') });
      else if (status === 403) toast(t('Ce compte est suspendu. Contactez le support.'), 'error');
      else toast(t('La connexion a échoué. Vérifiez votre réseau et réessayez.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const done = (who?: string) => {
    setLoading(true);
    setTimeout(() => {
      let u = login(who ?? (organizer ? 'u2' : 'u1'));
      if (signup && form.values.name) {
        updateUser({ name: form.values.name, email: form.values.email || u.email });
        u = { ...u, name: form.values.name };
      }
      setLoading(false);
      finish(u);
    }, 500);
  };

  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 pt-8 sm:px-6 lg:grid-cols-2 lg:pt-16">
      <div className="hidden flex-col justify-between rounded-4xl bg-navy p-10 text-white dark:ring-1 dark:ring-line lg:flex">
        <img src="/logo-mark.png" alt="" className="h-14 w-auto self-start brightness-[1.8] contrast-75" />
        <div>
          <p className="text-4xl font-extrabold leading-tight tracking-tight">
            {t('Découvrez des événements.')}<br />{t('Obtenez votre billet.')}<br /><span className="text-[#93B3FF]">{t('Soyez là.')}</span>
          </p>
          <p className="mt-4 text-white/70">{t('Vos billets QR dans l’app, par email et sur WhatsApp. Paiement MonCash, NatCash, carte ou PayPal.')}</p>
        </div>
      </div>

      <Card className="p-6 sm:p-8">
        <h1 className="text-2xl font-extrabold tracking-tight">{signup ? t('Créer un compte') : t('Bon retour !')}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {signup ? t('Déjà inscrit ?') : t('Pas encore de compte ?')}{' '}
          <Link to={`${signup ? '/connexion' : '/inscription'}${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-brand-ink">{signup ? t('Se connecter') : t('S’inscrire')}</Link>
        </p>

        {DEMO ? (
          <>
            <Button variant="outline" size="lg" className="mt-6 w-full" onClick={() => done()} loading={loading}>
              <GoogleIcon /> {t('Continuer avec Google')}
            </Button>

            <div className="my-6 flex items-center gap-3 text-xs text-ink-muted" aria-hidden>
              <span className="h-px flex-1 bg-line" /> {t('ou')} <span className="h-px flex-1 bg-line" />
            </div>
          </>
        ) : (
          <div className="mt-6" />
        )}

        {DEMO && <Segmented
          label={t('Méthode de connexion')}
          className="mb-5 flex w-full [&>button]:flex-1"
          value={via}
          onChange={(v) => {
            setVia(v);
            setOtpSent(false);
            form.setErrors({});
          }}
          options={[
            { value: 'email', label: <span className="flex items-center justify-center gap-2"><Mail className="h-4 w-4" aria-hidden /> {t('Email')}</span> },
            { value: 'phone', label: <span className="flex items-center justify-center gap-2"><Phone className="h-4 w-4" aria-hidden /> {t('Téléphone')}</span> },
          ]}
        />}

        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.validate()) return;
            if (via === 'phone' && !otpSent) {
              setOtpSent(true);
              toast(t('Code envoyé par SMS au {phone}', { phone: form.values.phone }), 'info');
              return;
            }
            if (DEMO) done();
            else void submitReal();
          }}
        >
          {signup && <Field label={t('Nom complet')} error={form.errors.name} required><Input autoComplete="name" {...form.bind('name')} /></Field>}
          {via === 'email' ? (
            <>
              <Field label={t('Email')} error={form.errors.email} required><Input type="email" inputMode="email" autoComplete="email" {...form.bind('email')} /></Field>
              <Field label={t('Mot de passe')} error={form.errors.password} hint={signup ? t('8 caractères minimum') : undefined} required>
                <Input type="password" autoComplete={signup ? 'new-password' : 'current-password'} {...form.bind('password')} />
              </Field>
              {!signup && <Link to="/mot-de-passe-oublie" className="inline-block text-sm font-semibold text-brand-ink">{t('Mot de passe oublié ?')}</Link>}
            </>
          ) : (
            <>
              <Field label={t('Numéro de téléphone')} error={form.errors.phone} required><Input type="tel" inputMode="tel" placeholder="+509 3712 3456" autoComplete="tel" {...form.bind('phone')} /></Field>
              {otpSent && (
                <Field label={t('Code reçu par SMS')} error={form.errors.otp} hint={t('Démo : n’importe quel code à 6 chiffres')} required>
                  <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" className="text-center text-lg tracking-[0.5em]" {...form.bind('otp')} onChange={(e) => form.set('otp', e.target.value.replace(/\D/g, '').slice(0, 6))} />
                </Field>
              )}
            </>
          )}
          {signup && <Toggle checked={organizer} onChange={setOrganizer} label={t('Je suis organisateur')} description={t('Accédez à la billetterie et au tableau de bord')} />}
          <Button type="submit" size="lg" className="w-full" loading={loading}>
            {via === 'phone' && !otpSent ? t('Recevoir un code') : signup ? t('Créer mon compte') : t('Se connecter')}
          </Button>
        </form>

        {!signup && DEMO && (
          <details className="mt-6 rounded-2xl bg-canvas p-4 text-sm">
            <summary className="cursor-pointer font-semibold">{t('Comptes de démonstration')}</summary>
            <p className="mt-2 text-xs text-ink-muted">{t('Connectez-vous avec un rôle pour tester les permissions.')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {demoAccounts.map((a) => (
                <Button key={a.id} size="sm" variant="outline" onClick={() => done(a.id)}>{t(a.label)}</Button>
              ))}
            </div>
          </details>
        )}
        <p className="mt-6 text-center text-xs text-ink-muted">
          {t('En continuant, vous acceptez les')} <Link to="/cgu" className="underline">{t('conditions d’utilisation')}</Link> {t('et la')} <Link to="/confidentialite" className="underline">{t('politique de confidentialité')}</Link>.
        </p>
      </Card>
    </div>
  );
}

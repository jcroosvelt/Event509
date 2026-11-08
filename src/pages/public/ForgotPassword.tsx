import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { requestPasswordReset, DEMO } from '@/services/api';
import { useApp } from '@/store/app';
import { useTitle } from '@/lib/hooks';
import { isEmail, useForm } from '@/lib/form';
import { Button, Card, Field, IconBadge, Input } from '@/components/ui';

export default function ForgotPassword() {
  const { t, toast } = useApp();
  useTitle(t('Mot de passe oublié'));
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
        {sent ? (
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

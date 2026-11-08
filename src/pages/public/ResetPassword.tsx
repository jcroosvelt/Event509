import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { resetPassword } from '@/services/api';
import { useApp } from '@/store/app';
import { useTitle } from '@/lib/hooks';
import { useForm } from '@/lib/form';
import { Button, Card, Field, Input } from '@/components/ui';

export default function ResetPassword() {
  const { t, toast } = useApp();
  useTitle(t('Nouveau mot de passe'));
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const form = useForm(
    { password: '', confirm: '' },
    {
      password: (v) => (String(v).length < 8 ? t('Choisissez au moins 8 caractères') : undefined),
      confirm: (v, all) => (v !== all.password ? t('Les deux mots de passe doivent être identiques') : undefined),
    },
  );

  if (!token)
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-xl font-bold">{t('Ce lien n’est plus valable')}</h1>
        <p className="mt-2 text-sm text-ink-soft">{t('Les liens expirent après 1 heure. Demandez-en un nouveau.')}</p>
        <Link to="/mot-de-passe-oublie" className="mt-4 inline-block font-semibold text-brand-ink">{t('Recevoir un nouveau lien')}</Link>
      </div>
    );

  const submit = async () => {
    if (!form.validate()) return;
    setLoading(true);
    try {
      await resetPassword(token, form.values.password);
      toast(t('Mot de passe modifié. Connectez-vous avec le nouveau.'));
      nav('/connexion', { replace: true });
    } catch {
      setLoading(false);
      toast(t('Ce lien n’est plus valable. Demandez-en un nouveau.'), 'error');
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 pt-10">
      <Card className="p-6 sm:p-8">
        <form noValidate onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
          <h1 className="text-2xl font-extrabold tracking-tight">{t('Nouveau mot de passe')}</h1>
          <Field label={t('Nouveau mot de passe')} error={form.errors.password} hint={t('8 caractères minimum')} required>
            <Input type="password" autoComplete="new-password" {...form.bind('password')} />
          </Field>
          <Field label={t('Confirmer le mot de passe')} error={form.errors.confirm} required>
            <Input type="password" autoComplete="new-password" {...form.bind('confirm')} />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={loading}>{t('Enregistrer')}</Button>
        </form>
      </Card>
    </div>
  );
}

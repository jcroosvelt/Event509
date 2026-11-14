import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';
import { verifyEmail } from '@/services/api';
import { useApp } from '@/store/app';
import { useTitle } from '@/lib/hooks';
import { Card, Spinner } from '@/components/ui';

/** Page ouverte depuis le lien de l'email de confirmation. */
export default function VerifyEmail() {
  const { t, user, updateUser } = useApp();
  useTitle(t('Confirmation de l’adresse email'));
  const token = useSearchParams()[0].get('token') ?? '';
  const [state, setState] = useState<'wait' | 'ok' | 'bad'>(token ? 'wait' : 'bad');

  useEffect(() => {
    if (!token) return;
    verifyEmail(token)
      .then(() => {
        setState('ok');
        if (user) updateUser({ emailVerified: true });
      })
      .catch(() => setState('bad'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <Card className="p-8">
        {state === 'wait' && <Spinner />}
        {state === 'ok' && (
          <>
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" aria-hidden />
            <h1 className="mt-3 text-xl font-extrabold">{t('Adresse confirmée')}</h1>
            <p className="mt-2 text-sm text-ink-soft">{t('Merci ! Vous pouvez maintenant publier vos événements et demander vos versements.')}</p>
            <Link to="/organisateur" className="mt-5 inline-block font-semibold text-brand-ink">{t('Aller à mon espace')}</Link>
          </>
        )}
        {state === 'bad' && (
          <>
            <XCircle className="mx-auto h-12 w-12 text-red-600" aria-hidden />
            <h1 className="mt-3 text-xl font-extrabold">{t('Ce lien n’est plus valable')}</h1>
            <p className="mt-2 text-sm text-ink-soft">{t('Connectez-vous et demandez un nouveau lien depuis votre espace organisateur.')}</p>
            <Link to="/connexion" className="mt-5 inline-block font-semibold text-brand-ink">{t('Se connecter')}</Link>
          </>
        )}
      </Card>
    </div>
  );
}

import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '@/store/app';
import { useAsync, useTitle } from '@/lib/hooks';
import { signupComplete, signupPending, type SignupPending } from '@/services/api';
import { Card, Loading } from '@/components/ui';
import { ProfileWizard } from './ProfileWizard';

/** Après Google, pour un nouvel utilisateur : inscription provisoire à terminer (le compte n'existe pas encore). */
export default function CompleteSignup() {
  const { t, startSession } = useApp();
  useTitle(t('Créer mon compte'));
  const nav = useNavigate();
  const { data, loading } = useAsync(() => signupPending().catch((): SignupPending => ({ pending: false })), []);
  if (loading) return <Loading />;
  if (!data?.pending)
    return (
      <div className="mx-auto max-w-md px-4 pt-16 text-center">
        <Card className="p-8">
          <h1 className="text-xl font-extrabold">{t('Votre inscription a expiré')}</h1>
          <p className="mt-2 text-sm text-ink-soft">{t('Recommencez avec Google : cela ne prend qu’un instant.')}</p>
          <Link to="/inscription" className="mt-4 inline-block font-semibold text-brand-ink">{t('Continuer avec Google')}</Link>
        </Card>
      </div>
    );
  return (
    <ProfileWizard
      askType
      title={t('Terminez votre inscription')}
      email={data.email ?? ''}
      initial={{ givenName: data.givenName, familyName: data.familyName, country: data.country, city: data.city }}
      onSubmit={async (d) => {
        const s = await signupComplete(d);
        await startSession(s);
        nav('/organisateur', { replace: true });
      }}
    />
  );
}

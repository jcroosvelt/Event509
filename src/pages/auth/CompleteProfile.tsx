import { useNavigate } from 'react-router-dom';
import { useApp } from '@/store/app';
import { useTitle } from '@/lib/hooks';
import { profileComplete } from '@/services/api';
import { ProfileWizard } from './ProfileWizard';

/** Compte d'avant la refonte (ou profil incomplet) : questions de sécurité et conditions à enregistrer, sans créer de doublon. */
export default function CompleteProfile() {
  const { t, user, updateUser } = useApp();
  useTitle(t('Compléter mon profil'));
  const nav = useNavigate();
  const [given = '', ...rest] = (user?.name ?? '').split(' ');
  return (
    <ProfileWizard
      title={t('Complétez votre profil')}
      email={user?.email ?? ''}
      initial={{ givenName: given, familyName: rest.join(' '), city: user?.city }}
      onSubmit={async (d) => {
        const r = await profileComplete(d);
        updateUser(r.user);
        nav('/organisateur', { replace: true });
      }}
    />
  );
}

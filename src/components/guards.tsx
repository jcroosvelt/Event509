import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useApp } from '@/store/app';
import { UNAUTHORIZED_EVENT } from '@/services/api';
import { ButtonLink, EmptyState } from './ui';

/** Exige une session ; sinon renvoie vers la connexion puis revient ici. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useApp();
  const loc = useLocation();
  if (!user) return <Navigate to={`/connexion?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return <>{children}</>;
}

export function AccessDenied({ body }: { body?: string }) {
  const { t } = useApp();
  return (
    <div className="mx-auto max-w-lg py-10">
      <EmptyState
        icon={<Lock className="h-5 w-5" aria-hidden />}
        title={t('Accès réservé')}
        body={body ?? t('Votre compte n’a pas les droits pour cette page. Demandez l’accès à l’administrateur de votre équipe.')}
        action={<ButtonLink to="/">{t('Retour à l’accueil')}</ButtonLink>}
      />
    </div>
  );
}

/** Réagit aux réponses 401 de l'API : déconnexion et retour à la connexion. */
export function SessionWatcher() {
  const { logout, toast, t } = useApp();
  const nav = useNavigate();
  useEffect(() => {
    const onUnauthorized = () => {
      logout();
      toast(t('Votre session a expiré. Reconnectez-vous pour continuer.'), 'info');
      nav(`/connexion?next=${encodeURIComponent(location.pathname)}`);
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [logout, toast, t, nav]);
  return null;
}

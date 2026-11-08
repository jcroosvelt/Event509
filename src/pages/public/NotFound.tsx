import { ButtonLink } from '@/components/ui';
import { useApp } from '@/store/app';
import { useTitle } from '@/lib/hooks';

export default function NotFound() {
  const { t } = useApp();
  useTitle(t('Page introuvable'));
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <div aria-hidden className="text-7xl font-extrabold tracking-tight text-ink">4<span className="text-brand">0</span>4</div>
      <h1 className="mt-4 text-xl font-bold">{t('Cette page n’existe pas')}</h1>
      <p className="mt-2 text-ink-soft">{t('Le lien est peut-être expiré ou l’événement a été retiré.')}</p>
      <div className="mt-6 flex justify-center gap-2">
        <ButtonLink to="/">{t('Retour à l’accueil')}</ButtonLink>
        <ButtonLink to="/explorer" variant="outline">{t('Explorer')}</ButtonLink>
      </div>
    </div>
  );
}

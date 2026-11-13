import { Link } from 'react-router-dom';
import { Smartphone } from 'lucide-react';
import { AppInstallInfo, useRelease } from '@/components/AppInstall';
import { APK_RAW_URL, isNewer } from '@/lib/appRelease';
import { inApp, postApp, useAppBuild } from '@/lib/appBridge';
import { useApp } from '@/store/app';
import { useTitle } from '@/lib/hooks';
import { Button, Card, Loading } from '@/components/ui';

/**
 * Page de téléchargement de l'application Android. Ouverte aussi par la notification « Mise à jour disponible » :
 * dans l'application, elle propose la mise à jour (le fichier s'ouvre dans le navigateur du téléphone).
 */
export default function DownloadApp() {
  const { t } = useApp();
  useTitle(t('Application Android'));
  const release = useRelease();
  const installed = useAppBuild();
  const inside = inApp();

  if (!release)
    return (
      <div className="mx-auto max-w-xl px-4 pt-12 text-center">
        <Loading />
        <p className="mt-3 text-sm text-ink-soft">{t('L’application Android n’est pas encore disponible au téléchargement.')}</p>
      </div>
    );

  // Dans l'application : une ancienne version ne répond pas à « update:open », on ouvre alors l'adresse externe du fichier
  const update = () => {
    if (installed) postApp('update:open');
    else window.location.assign(APK_RAW_URL);
  };

  return (
    <div className="mx-auto max-w-xl px-4 pt-8 sm:px-6 lg:pt-12">
      <h1 className="mb-1 flex items-center gap-2 text-3xl font-extrabold tracking-tight"><Smartphone className="h-7 w-7 text-brand-ink" aria-hidden /> {t('Application Android')}</h1>
      <p className="mb-6 text-ink-soft">{t('Installez EVENT509 sur votre téléphone Android.')}</p>
      <Card className="p-5 sm:p-6">
        {inside ? (
          <div className="space-y-4">
            <p className="font-bold">
              {installed && !isNewer(release, installed.build) ? t('Votre application est à jour (version {v}).', { v: installed.name || release.versionName }) : t('Une nouvelle version est disponible : {v}.', { v: release.versionName })}
            </p>
            {(!installed || isNewer(release, installed.build)) && <Button size="lg" className="w-full" onClick={update}>{t('Mettre à jour')}</Button>}
            <p className="text-xs text-ink-muted">{t('Le fichier s’ouvre dans le navigateur du téléphone, qui le télécharge et lance l’installation par-dessus l’application actuelle : vos billets et vos réglages sont conservés.')}</p>
          </div>
        ) : (
          <AppInstallInfo release={release} />
        )}
      </Card>
      <p className="mt-6 text-center text-sm"><Link to="/" className="font-semibold text-brand-ink">{t('Retour à l’accueil')}</Link></p>
    </div>
  );
}

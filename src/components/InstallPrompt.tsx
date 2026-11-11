import { Download, Share, SquarePlus, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { useApp } from '@/store/app';
import { useInstallPrompt } from '@/lib/install';

/** Bandeau d'invitation à installer l'application (écran d'accueil), en bas de l'écran. */
export function InstallPrompt() {
  const { t } = useApp();
  const { mode, install, dismiss } = useInstallPrompt();
  if (!mode) return null;
  return (
    <section
      aria-label={t('Installer l’application')}
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-[90] mx-auto max-w-md rounded-3xl bg-surface p-4 shadow-card ring-1 ring-line lg:bottom-4 lg:left-auto lg:right-4 lg:mx-0"
    >
      <div className="flex items-start gap-3">
        <img src="/icon-192.png" alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-2xl" />
        <div className="min-w-0 flex-1">
          <p className="font-extrabold text-ink">{t('Installez Event509')}</p>
          <p className="mt-0.5 text-sm text-ink-soft">{t('Vos billets sur l’écran d’accueil, même sans connexion.')}</p>
        </div>
        <button type="button" aria-label={t('Fermer')} onClick={dismiss} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-soft hover:text-ink">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {mode === 'native' ? (
        <div className="mt-3 flex gap-2">
          <Button className="flex-1" onClick={install}>
            <Download className="h-4 w-4" aria-hidden />
            {t('Installer l’application')}
          </Button>
          <Button variant="ghost" onClick={dismiss}>{t('Plus tard')}</Button>
        </div>
      ) : (
        <ol className="mt-3 space-y-2 rounded-2xl bg-canvas p-3 text-sm text-ink">
          <li className="flex items-center gap-2">
            <Share className="h-4 w-4 shrink-0 text-brand" aria-hidden />
            <span>{t('Touchez « Partager » dans Safari')}</span>
          </li>
          <li className="flex items-center gap-2">
            <SquarePlus className="h-4 w-4 shrink-0 text-brand" aria-hidden />
            <span>{t('Puis « Sur l’écran d’accueil »')}</span>
          </li>
        </ol>
      )}
    </section>
  );
}

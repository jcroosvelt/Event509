import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { BellRing, CloudOff, Download, Fingerprint, ScanLine, ShieldAlert, X } from 'lucide-react';
import { useApp } from '@/store/app';
import { APK_PATH, fetchRelease, isAndroidBrowser, isNewer, promptAllowed, rememberInstalled, rememberLater, sizeMo, type AppRelease } from '@/lib/appRelease';
import { postApp, useAppBuild } from '@/lib/appBridge';
import { Button, Modal } from '@/components/ui';

/** Dernière version publiée de l'application (null tant qu'elle n'est pas connue, ou si aucun APK n'est publié). */
export function useRelease() {
  const [release, setRelease] = useState<AppRelease | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchRelease().then((r) => alive && setRelease(r));
    return () => {
      alive = false;
    };
  }, []);
  return release;
}

/** Fenêtre d'informations avant l'installation : version, taille, étapes, avertissement Android, téléchargement. */
export function AppInstallInfo({ release, onDownload }: { release: AppRelease; onDownload?: () => void }) {
  const { t, lang } = useApp();
  const date = release.date ? new Date(release.date).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR', { dateStyle: 'long' }) : '';
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <img src="/icon-192.png" alt="" width={56} height={56} className="h-14 w-14 shrink-0 rounded-2xl" />
        <div className="min-w-0">
          <p className="font-extrabold">EVENT509 {t('pour Android')}</p>
          <p className="text-sm text-ink-soft">
            {t('Version {v}', { v: release.versionName })} · {sizeMo(release.size)} · {t('Android {v} ou plus récent', { v: release.minAndroid })}
            {date && <> · {date}</>}
          </p>
        </div>
      </div>

      <ul className="grid gap-2 text-sm sm:grid-cols-2">
        {[
          [CloudOff, t('Vos billets disponibles sans connexion')],
          [BellRing, t('Notifications de vos billets et événements')],
          [ScanLine, t('Scanner de QR codes pour le contrôle d’entrée')],
          [Fingerprint, t('Verrouillage par empreinte, facultatif')],
        ].map(([Icon, label], i) => {
          const I = Icon as typeof BellRing;
          return (
            <li key={i} className="flex items-center gap-2 rounded-2xl bg-canvas px-3 py-2.5">
              <I className="h-4 w-4 shrink-0 text-brand-ink" aria-hidden /> <span>{label as string}</span>
            </li>
          );
        })}
      </ul>

      <ol className="space-y-2 text-sm">
        {[
          t('Touchez « Télécharger » : le fichier EVENT509.apk arrive dans vos téléchargements.'),
          t('Ouvrez-le depuis la notification de téléchargement ou le dossier « Téléchargements ».'),
          t('Si Android le demande, autorisez l’installation depuis ce navigateur (Paramètres > Installer des applis inconnues).'),
          t('Touchez « Installer », puis « Ouvrir ».'),
        ].map((s, i) => (
          <li key={i} className="flex gap-3">
            <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-contrast text-xs font-bold text-on-contrast">{i + 1}</span>
            <span className="pt-0.5">{s}</span>
          </li>
        ))}
      </ol>

      <p className="flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>{t('L’application n’est pas sur Google Play. Android ou Play Protect peut afficher un avertissement : choisissez « Installer quand même » si vous avez téléchargé le fichier depuis ce site.')}</span>
      </p>

      <details className="text-xs text-ink-muted">
        <summary className="cursor-pointer font-semibold">{t('Vérifier le fichier (empreinte SHA-256)')}</summary>
        <code className="mt-2 block break-all rounded-xl bg-canvas p-2 font-mono">{release.sha256}</code>
      </details>
      <p className="text-xs text-ink-muted">{t('Les mises à jour : vous êtes prévenu par une notification dès qu’une nouvelle version est publiée.')}</p>

      <a
        href={release.file || APK_PATH}
        download="EVENT509.apk"
        onClick={onDownload}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-contrast px-6 text-sm font-semibold text-on-contrast"
      >
        <Download className="h-4 w-4" aria-hidden /> {t('Télécharger l’application ({size})', { size: sizeMo(release.size) })}
      </a>
    </div>
  );
}

/** Pages où l'invitation ne s'affiche pas : achat, paiement, commande. */
const QUIET = [/^\/e\/[^/]+\/achat/, /^\/commande/, /^\/retour-paiement/, /^\/telecharger/, /^\/connexion/, /^\/inscription/, /^\/organisateur/, /^\/admin/];

/**
 * Invitation à installer l'application Android (APK, pas la PWA), à l'arrivée sur le site depuis un téléphone Android.
 * Elle ne s'affiche jamais dans l'application elle-même ni sur un autre appareil (l'APK ne s'installe que sur Android).
 */
export function AppInstallPopup() {
  const { t } = useApp();
  const { pathname } = useLocation();
  const release = useRelease();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'invite' | 'info'>('invite');
  const [downloaded, setDownloaded] = useState(false);
  const eligible = !!release && isAndroidBrowser() && !QUIET.some((q) => q.test(pathname));

  useEffect(() => {
    if (!eligible || !promptAllowed()) return;
    const id = window.setTimeout(() => setOpen(true), 1500);
    return () => window.clearTimeout(id);
  }, [eligible]);

  if (!release || !open) return null;
  const later = () => {
    rememberLater();
    setOpen(false);
  };
  const installed = () => {
    rememberInstalled();
    setOpen(false);
  };
  return (
    <Modal
      open
      onClose={later}
      size="sm"
      title={step === 'invite' ? t('Installez l’application EVENT509') : t('Installer EVENT509')}
      description={step === 'invite' ? t('Plus rapide, vos billets sans connexion, et des notifications pour ne rien manquer.') : undefined}
      footer={
        step === 'invite' ? (
          <div className="flex w-full flex-col gap-2">
            <Button size="lg" onClick={() => setStep('info')}><Download className="h-4 w-4" aria-hidden /> {t('Installer')}</Button>
            <Button variant="ghost" onClick={later}>{t('Plus tard')}</Button>
          </div>
        ) : undefined
      }
    >
      {step === 'invite' ? (
        <div className="space-y-3 text-sm">
          <p className="text-ink-soft">{t('Version {v} · {size} · gratuite', { v: release.versionName, size: sizeMo(release.size) })}</p>
          <button type="button" onClick={installed} className="text-xs font-semibold text-ink-muted underline">{t('J’ai déjà l’application')}</button>
        </div>
      ) : (
        <div className="space-y-4">
          <AppInstallInfo release={release} onDownload={() => setDownloaded(true)} />
          {downloaded && (
            <p role="status" className="flex items-start gap-2 rounded-2xl bg-brand-50 p-3 text-sm text-brand-dark">
              {t('Téléchargement lancé. Ouvrez le fichier EVENT509.apk depuis vos notifications ou vos téléchargements.')}{' '}
              <button type="button" onClick={installed} className="font-semibold underline">{t('C’est installé')}</button>
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

/**
 * Dans l'application : une version plus récente est publiée. Le bandeau propose la mise à jour (l'APK s'ouvre dans le
 * navigateur du téléphone, qui le télécharge et lance l'installation).
 */
export function AppUpdateBanner() {
  const { t } = useApp();
  const installed = useAppBuild();
  const release = useRelease();
  const [hidden, setHidden] = useState(false);
  if (hidden || !installed || !release || !isNewer(release, installed.build)) return null;
  return (
    <section aria-label={t('Mise à jour disponible')} className="fixed inset-x-3 top-3 z-[95] mx-auto flex max-w-md items-center gap-3 rounded-3xl bg-contrast p-3 pl-4 text-on-contrast shadow-card">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold">{t('Nouvelle version disponible')}</p>
        <p className="text-xs opacity-80">{t('Version {v} · {size}', { v: release.versionName, size: sizeMo(release.size) })}</p>
      </div>
      <Button size="sm" variant="outline" className="!border-white/40 !bg-white !text-navy" onClick={() => postApp('update:open')}>{t('Mettre à jour')}</Button>
      <button type="button" aria-label={t('Fermer')} onClick={() => setHidden(true)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-white/10">
        <X className="h-4 w-4" aria-hidden />
      </button>
    </section>
  );
}

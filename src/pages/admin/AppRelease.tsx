import { useRef, useState } from 'react';
import { CheckCircle2, Smartphone, Trash2, Upload } from 'lucide-react';
import { getHostedApp, removeHostedApp, uploadApk, type AppReleaseInfo } from '@/services/api';
import { ApiError } from '@/lib/errors';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { sizeMo } from '@/lib/appRelease';
import { Button, Card, Loading, PageHeader, ProgressBar, Toggle } from '@/components/ui';

/**
 * Application Android : l'administrateur téléverse l'APK ici. Il est stocké par la plateforme, remplace l'ancien (effacé) et devient le
 * téléchargement et la mise à jour proposés aux utilisateurs. Version et identifiant sont lus dans le fichier, jamais saisis.
 */
export default function AppRelease() {
  const { t, toast } = useApp();
  useTitle(t('Application Android'));
  const { data, loading, reload } = useAsync(() => getHostedApp(), []);
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [announce, setAnnounce] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ release: AppReleaseInfo; notified: number } | null>(null);

  if (loading || !data) return <Loading />;
  const current = data.release ?? data.fallback;
  const busy = progress !== null;

  const send = async () => {
    if (!file || busy) return;
    setError('');
    setDone(null);
    setProgress(0);
    try {
      const out = await uploadApk(file, announce, setProgress);
      setDone(out);
      setFile(null);
      if (input.current) input.current.value = '';
      toast(t('Application publiée'));
      reload();
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : t('Échec de l’envoi'));
    } finally {
      setProgress(null);
    }
  };

  const remove = async () => {
    if (!window.confirm(t('Retirer le fichier hébergé ? Le téléchargement reviendra à l’ancienne version publiée sur GitHub.'))) return;
    try {
      await removeHostedApp();
      toast(t('Fichier retiré'));
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Échec'));
    }
  };

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={t('Application Android')}
        subtitle={t('Téléversez ici l’APK : il remplace l’ancien et devient le téléchargement et la mise à jour de la plateforme.')}
      />

      <Card className="mb-4 p-5">
        <h2 className="mb-3 flex items-center gap-2 font-bold"><Smartphone className="h-5 w-5 text-brand-ink" aria-hidden /> {t('Version en ligne')}</h2>
        {current ? (
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div><dt className="text-ink-muted">{t('Version')}</dt><dd className="font-semibold" data-testid="app-version">{current.versionName} ({current.versionCode})</dd></div>
            <div><dt className="text-ink-muted">{t('Taille')}</dt><dd className="font-semibold">{sizeMo(current.size)}</dd></div>
            <div><dt className="text-ink-muted">{t('Publiée le')}</dt><dd className="font-semibold">{current.date}</dd></div>
            <div><dt className="text-ink-muted">{t('Hébergement')}</dt><dd className="font-semibold">{data.hosted ? t('Plateforme') : t('GitHub (ancien)')}</dd></div>
            <div className="sm:col-span-2"><dt className="text-ink-muted">SHA-256</dt><dd className="break-all font-mono text-xs">{current.sha256}</dd></div>
          </dl>
        ) : (
          <p className="text-sm text-ink-soft">{t('Aucune version publiée.')}</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <a href="/app/event509.apk" className="inline-flex h-10 items-center rounded-full border border-line px-4 text-sm font-semibold hover:bg-canvas">{t('Télécharger le fichier')}</a>
          {data.hosted && (
            <Button variant="outline" size="sm" onClick={remove}><Trash2 className="h-4 w-4" aria-hidden /> {t('Retirer le fichier')}</Button>
          )}
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="font-bold">{t('Publier une nouvelle version')}</h2>
        <div>
          <label htmlFor="apk-file" className="mb-1 block text-sm font-semibold">{t('Fichier APK')}</label>
          <input
            ref={input}
            id="apk-file"
            type="file"
            accept=".apk,application/vnd.android.package-archive"
            disabled={busy}
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(''); setDone(null); }}
            className="block w-full rounded-2xl border border-line bg-canvas p-3 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-brand-100 file:px-4 file:py-2 file:font-semibold file:text-brand-ink"
          />
          {file && <p className="mt-1 text-xs text-ink-muted">{file.name} · {sizeMo(file.size)}</p>}
          <p className="mt-1 text-xs text-ink-muted">{t('Le numéro de version est lu dans le fichier. Une version plus récente que celle en ligne est exigée.')}</p>
        </div>
        <Toggle checked={announce} onChange={setAnnounce} disabled={busy} label={t('Prévenir les utilisateurs')} description={t('Notification « Mise à jour disponible » envoyée aux téléphones qui ont l’application.')} />
        {busy && <ProgressBar value={progress ?? 0} label={t('Envoi en cours')} />}
        {error && <p role="alert" className="rounded-2xl bg-rose-500/10 p-3 text-sm font-semibold text-rose-600">{error}</p>}
        {done && (
          <p role="status" className="flex items-start gap-2 rounded-2xl bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {t('Version {v} publiée.', { v: done.release.versionName })} {done.notified > 0 ? t('{n} appareils prévenus.', { n: done.notified }) : ''}
          </p>
        )}
        <Button size="lg" onClick={send} disabled={!file || busy} loading={busy}><Upload className="h-4 w-4" aria-hidden /> {t('Envoyer et publier')}</Button>
      </Card>
    </div>
  );
}

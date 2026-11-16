import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Fingerprint, LifeBuoy } from 'lucide-react';
import { useApp } from '@/store/app';
import { useAsync, useTitle } from '@/lib/hooks';
import { authConfig, googleUrl, passkeyLoginOptions, passkeyLoginVerify } from '@/services/api';
import { passkeyCancelled, passkeysSupported, getPasskeyAssertion } from '@/lib/webauthn';
import { inApp, postApp } from '@/lib/appBridge';
import { safeInternalPath } from '@/lib/safeUrl';
import { Button, Card, Loading } from '@/components/ui';
import Auth from '@/pages/public/Auth';

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path fill="#4285F4" d="M22.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-7.9Z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8l3.7-2.8Z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4Z" />
    </svg>
  );
}

/** Page unique de connexion et d'inscription : un seul bouton « Continuer avec Google » (plus de formulaire e-mail / mot de passe). */
function GoogleAuthPage() {
  const { t, startSession, toast } = useApp();
  useTitle(t('Continuer avec Google'));
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = safeInternalPath(params.get('next'));
  const err = params.get('error');
  const [busy, setBusy] = useState(false);

  const errors: Record<string, string> = {
    cancelled: t('Connexion annulée. Vous pouvez réessayer quand vous voulez.'),
    google: t('La connexion avec Google a échoué. Réessayez.'),
    email_not_verified: t('Votre adresse Google n’est pas vérifiée. Vérifiez-la chez Google puis réessayez.'),
    legacy_account: t('Un ancien compte EVENT509 existe avec cette adresse. Connectez-vous avec votre ancienne méthode, puis associez Google dans « Sécurité ».'),
    suspended: t('Ce compte est suspendu. Contactez le support.'),
    unavailable: t('La connexion Google n’est pas disponible pour le moment.'),
    login_required: t('Connectez-vous pour continuer.'),
  };

  const withPasskey = async () => {
    setBusy(true);
    try {
      const o = await passkeyLoginOptions();
      const response = await getPasskeyAssertion(o.options);
      const s = await passkeyLoginVerify(o.challengeId, response);
      await startSession(s);
      nav(next ?? (s.user.role === 'admin' ? '/admin' : '/organisateur'), { replace: true });
    } catch (e) {
      if (!passkeyCancelled(e)) toast(t('Connexion impossible avec cette passkey.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 pt-10 sm:pt-16">
      <Card className="p-6 sm:p-8">
        <h1 className="text-2xl font-extrabold tracking-tight">{t('Bienvenue sur EVENT509')}</h1>
        <p className="mt-1 text-sm text-ink-soft">{t('Connexion et création de compte se font avec le même bouton. Pour acheter un billet, aucun compte n’est nécessaire.')}</p>
        {err && <p role="alert" className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errors[err] ?? t('Une erreur est survenue. Réessayez.')}</p>}
        {inApp() ? (
          // Google refuse la connexion dans une WebView : l'application ouvre la connexion dans le navigateur du téléphone
          // (onglet Chrome), puis revient ici avec une session. Aucun contournement du navigateur de la WebView.
          <>
            <button type="button" onClick={() => postApp(`auth-google:${JSON.stringify({ next: next ?? null })}`)} className="mt-6 flex h-12 w-full items-center justify-center gap-3 rounded-full border border-line bg-surface text-sm font-bold shadow-sm transition hover:bg-canvas">
              <GoogleIcon /> {t('Continuer avec Google')}
            </button>
            <p className="mt-2 text-center text-xs text-ink-muted">{t('La connexion Google s’ouvre dans votre navigateur, puis vous revenez dans l’application.')}</p>
          </>
        ) : (
          <a href={googleUrl('login', next)} className="mt-6 flex h-12 w-full items-center justify-center gap-3 rounded-full border border-line bg-surface text-sm font-bold shadow-sm transition hover:bg-canvas">
            <GoogleIcon /> {t('Continuer avec Google')}
          </a>
        )}
        {passkeysSupported() && (
          <Button variant="outline" size="lg" className="mt-3 w-full" onClick={withPasskey} loading={busy}>
            <Fingerprint className="h-4 w-4" aria-hidden /> {t('Se connecter avec une passkey')}
          </Button>
        )}
        <p className="mt-6 text-center text-xs text-ink-muted">
          {t('En continuant, vous acceptez les')} <Link to="/cgu" className="underline">{t('conditions d’utilisation')}</Link> {t('et la')} <Link to="/confidentialite" className="underline">{t('politique de confidentialité')}</Link>.
        </p>
        <div className="mt-5 flex flex-col gap-2 border-t border-line pt-4 text-sm">
          <Link to="/connexion/recuperation" className="inline-flex items-center gap-2 font-semibold text-brand-ink"><LifeBuoy className="h-4 w-4" aria-hidden /> {t('Je n’ai plus accès à mon compte Google')}</Link>
          <Link to="/connexion/ancien" className="text-ink-soft hover:text-ink">{t('J’ai un ancien compte (e-mail et mot de passe)')}</Link>
        </div>
      </Card>
    </div>
  );
}

/** Entrée /connexion et /inscription : Google seul dès qu'il est configuré sur le serveur ; sinon, les formulaires d'origine (démonstration). */
export default function AuthEntry({ mode }: { mode: 'login' | 'signup' }) {
  const { data, loading } = useAsync(() => authConfig(), []);
  if (loading) return <Loading />;
  return data?.google ? <GoogleAuthPage /> : <Auth mode={mode} />;
}

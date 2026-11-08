import { Component, useState, type ReactNode } from 'react';
import { Check, Copy, RefreshCw, WifiOff } from 'lucide-react';
import { Button, Card, IconBadge } from './ui';
import { ApiError } from '@/lib/errors';
import { useApp } from '@/store/app';

function ErrorView({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const { t } = useApp();
  const [copied, setCopied] = useState(false);
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  const ref = error instanceof ApiError ? error.ref : 'LOCAL';
  const copy = () => {
    const details = { message: error.message, status: error instanceof ApiError ? error.status : undefined, ref, route: location.pathname, at: new Date().toISOString() };
    navigator.clipboard?.writeText(JSON.stringify(details, null, 2)).then(() => setCopied(true));
  };
  return (
    <div className="mx-auto max-w-lg px-4 py-16" role="alert">
      <Card className="flex flex-col items-center px-6 py-12 text-center">
        <IconBadge size="lg" tone={offline ? 'amber' : 'red'}>{offline ? <WifiOff className="h-5 w-5" /> : <RefreshCw className="h-5 w-5" />}</IconBadge>
        <h1 className="mt-4 text-lg font-bold">{offline ? t('Pas de connexion') : t('Cette page n’a pas pu se charger')}</h1>
        <p className="mt-1 max-w-sm text-sm text-ink-soft">
          {offline ? t('Vos billets restent disponibles dans le portefeuille. Reconnectez-vous puis réessayez.') : t('Un problème est survenu de notre côté. Réessayez dans un instant.')}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button onClick={onRetry}><RefreshCw className="h-4 w-4" aria-hidden /> {t('Réessayer')}</Button>
          {!offline && (
            <Button variant="outline" onClick={copy}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? t('Détails copiés') : t('Copier les détails')}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

/** Attrape les erreurs de rendu et de chargement ; « Réessayer » remonte la page, ce qui relance les requêtes. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null; attempt: number }> {
  state = { error: null as Error | null, attempt: 0 };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  componentDidCatch(error: Error) {
    if (import.meta.env.DEV) console.error('[ErrorBoundary]', error);
  }

  render() {
    if (this.state.error)
      return <ErrorView error={this.state.error} onRetry={() => this.setState((s) => ({ error: null, attempt: s.attempt + 1 }))} />;
    return <div key={this.state.attempt} className="contents">{this.props.children}</div>;
  }
}

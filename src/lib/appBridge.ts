/**
 * Pont avec l'application Android EVENT509 (WebView) : l'application expose `window.AppBridge`.
 * Dans un navigateur ordinaire, rien de tout cela n'existe : les fonctions ne font alors rien.
 */
import { useEffect, useState } from 'react';

interface LockState {
  enabled: boolean;
  supported: boolean;
  error?: 'unsupported' | 'failed';
}

declare global {
  interface Window {
    onLockState?: (state: LockState) => void;
    /** Résultat du scanner natif de l'application (message « scan:start »). */
    onQrScanned?: (code: string) => void;
    onQrScanCancelled?: () => void;
    /** Réponse de l'application à « app:version » : numéro de version installé. */
    onAppVersion?: (v: { build: number; name: string }) => void;
  }
}

/** Vrai quand le site tourne dans l'application Android. */
export const inApp = () => typeof window !== 'undefined' && !!window.AppBridge;

export function postApp(message: string) {
  try {
    window.AppBridge?.postMessage(message);
  } catch {
    /* hors application */
  }
}

/**
 * Page de billet : l'application garde l'écran allumé, monte la luminosité au maximum et bloque les captures
 * d'écran tant que `active` est vrai (messages « ticket:open » / « ticket:close »).
 */
export function useTicketScreen(active = true) {
  useEffect(() => {
    if (!active || !inApp()) return;
    postApp('ticket:open');
    return () => postApp('ticket:close');
  }, [active]);
}

/** Verrouillage de l'application par empreinte ou code du téléphone (réglage, application seulement). */
export function useAppLock() {
  const [state, setState] = useState<LockState | null>(null);
  useEffect(() => {
    if (!inApp()) return;
    window.onLockState = (s) => setState(s);
    postApp('lock:status');
    return () => {
      window.onLockState = undefined;
    };
  }, []);
  return {
    available: inApp(),
    state,
    set: (on: boolean) => postApp(on ? 'lock:on' : 'lock:off'),
  };
}

/**
 * Version de l'application installée (numéro de build) : null hors application ou avec une ancienne version qui ne répond pas.
 * Sert à proposer la mise à jour quand une version plus récente est publiée.
 */
export function useAppBuild() {
  const [v, setV] = useState<{ build: number; name: string } | null>(null);
  useEffect(() => {
    if (!inApp()) return;
    window.onAppVersion = (x) => setV(x);
    postApp('app:version');
    return () => {
      window.onAppVersion = undefined;
    };
  }, []);
  return v;
}

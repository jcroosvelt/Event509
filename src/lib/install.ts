import { useEffect, useState } from 'react';

/** Événement Chromium/Android : permet de déclencher la fenêtre d'installation native. */
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

const DISMISS_KEY = 'e509.install.dismissed';
const DISMISS_DAYS = 7;

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** À appeler tôt (main.tsx) : l'événement peut partir avant le premier rendu React. */
export function captureInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** iPhone/iPad (Safari) : pas d'événement d'installation, il faut passer par « Partager ». */
export function isIos() {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function recentlyDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return at > 0 && Date.now() - at < DISMISS_DAYS * 86400000;
  } catch {
    return false;
  }
}

export type InstallState = { mode: 'native' | 'ios' | null; install: () => Promise<void>; dismiss: () => void };

export function useInstallPrompt(): InstallState {
  const [, tick] = useState(0);
  const [hidden, setHidden] = useState(() => isStandalone() || recentlyDismissed());
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* stockage indisponible */
    }
    setHidden(true);
  };

  const install = async () => {
    if (!deferred) return;
    const ev = deferred;
    deferred = null;
    await ev.prompt();
    const { outcome } = await ev.userChoice;
    if (outcome === 'dismissed') dismiss();
    else setHidden(true);
    notify();
  };

  const mode = hidden ? null : deferred ? 'native' : isIos() ? 'ios' : null;
  return { mode, install, dismiss };
}

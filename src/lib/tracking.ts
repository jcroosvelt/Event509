import { DEMO, http } from '@/services/api';

const KEY = 'e509.src';

/**
 * Lien de suivi d'un organisateur (?src=CODE) : le clic est compté une fois par session, et le code est gardé pour
 * être rattaché à l'achat. Seul un code reconnu par le serveur est conservé sur la commande.
 */
export function captureTrackingCode(code: string | null) {
  if (DEMO || !code || !/^[A-Z0-9]{4,12}$/i.test(code)) return;
  try {
    if (sessionStorage.getItem(KEY) === code.toUpperCase()) return;
    sessionStorage.setItem(KEY, code.toUpperCase());
  } catch {
    /* stockage indisponible */
  }
  void http('/track/click', { method: 'POST', body: JSON.stringify({ code: code.toUpperCase() }) }).catch(() => {});
}

export function trackingCode(): string | undefined {
  try {
    return sessionStorage.getItem(KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

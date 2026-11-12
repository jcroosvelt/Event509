/**
 * Notifications push (application Android EVENT509).
 * L'application appelle `window.onFcmToken(token)` au chargement de chaque page et à chaque renouvellement du
 * jeton ; elle accepte aussi le message « fcm:request » pour le redemander. Le jeton est envoyé au serveur avec
 * le compte connecté et/ou la clé de la commande ouverte (participants sans compte).
 */
import { API_URL, http } from '@/services/api';

declare global {
  interface Window {
    onFcmToken?: (token: string) => void;
    AppBridge?: { postMessage: (message: string) => void };
  }
}

let token: string | null = null;
let orderCtx: { orderId: string; key: string } | null = null;
const done = new Set<string>();

/** Dernier jeton reçu de l'application (null dans un navigateur ordinaire). */
export const currentFcmToken = () => token;

async function send() {
  if (!token || !API_URL) return;
  const hasSession = !!localStorage.getItem('e509.token');
  const order = orderCtx;
  if (!hasSession && !order) return;
  // Un même (jeton, compte, commande) n'est envoyé qu'une fois par chargement de page
  const sig = `${token}|${hasSession ? 'u' : ''}|${order?.orderId ?? ''}`;
  if (done.has(sig)) return;
  done.add(sig);
  try {
    await http('/devices', { method: 'POST', body: JSON.stringify({ token, ...(order ?? {}) }) });
  } catch {
    done.delete(sig);
  }
}

/** À appeler quand le compte se connecte, ou quand une commande est ouverte avec sa clé. */
export function registerPush(order?: { orderId: string; key: string }) {
  if (order?.orderId && order.key) orderCtx = order;
  void send();
}

/** Déconnexion : retire l'appareil du compte (les notifications de commande restent actives). */
export async function unregisterPush() {
  if (!token || !API_URL) return;
  try {
    await http(`/devices?token=${encodeURIComponent(token)}`, { method: 'DELETE' });
  } catch {
    /* hors ligne ou session déjà expirée */
  }
  for (const s of [...done]) if (s.includes('|u|')) done.delete(s);
}

/** Définit window.onFcmToken (à appeler une fois, avant l'affichage de l'interface). */
export function initPush() {
  window.onFcmToken = (t: string) => {
    if (typeof t !== 'string' || t.length < 20) return;
    token = t;
    void send();
  };
  window.AppBridge?.postMessage('fcm:request');
}

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as db from '@/data/mock';
import { becomeOrganizer, claimOrder, DEMO, fetchMe, fetchMyOrders, fetchMyTickets, refreshCatalog, updateProfile, type Session_ } from '@/services/api';
import { translate, type Vars } from '@/lib/i18n';
import { registerPush, unregisterPush } from '@/lib/push';
import type { AppUser, Currency, IssuedTicket, Lang, NotificationItem, Order } from '@/types';

/** Lecture/écriture localStorage tolérante aux erreurs (navigation privée, quota…). */
export function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function persist(key: string, value: unknown) {
  try {
    // null est enregistré tel quel (ex. « déconnecté ») ; seul undefined efface la clé
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* stockage indisponible : l'état reste en mémoire */
  }
}

/** Commandes passées sans compte sur cet appareil : leur clé permet de les rattacher à un compte plus tard. */
const GUEST_KEY = 'e509.guestOrders';
export function rememberGuestOrder(id: string, key: string) {
  const all = load<{ id: string; key: string }[]>(GUEST_KEY, []);
  persist(GUEST_KEY, [...all.filter((x) => x.id !== id), { id, key }].slice(-50));
}

/** Clé du lien d'une commande passée sans compte sur cet appareil (retour du paiement en ligne). */
export function guestOrderKey(id: string) {
  return load<{ id: string; key: string }[]>(GUEST_KEY, []).find((x) => x.id === id)?.key ?? '';
}

function usePersisted<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => load(key, initial));
  useEffect(() => {
    persist(key, v);
  }, [key, v]);
  return [v, setV] as const;
}

export interface OfflineScan {
  code: string;
  eventId: string;
  at: string;
  synced: boolean;
}

export type Theme = 'system' | 'light' | 'dark';

export interface Referral {
  code: string;
  expiresAt: string;
}

export interface Toast {
  id: number;
  msg: string;
  kind: 'success' | 'error' | 'info';
  action?: { label: string; run: () => void };
}

interface AppState {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Traduit une phrase française (voir src/lib/i18n.ts). */
  t: (fr: string, vars?: Vars) => string;
  currency: Currency;
  setCurrency: (c: Currency) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;

  user: AppUser | null;
  /** Connexion de démo : par identifiant d'utilisateur ou par rôle. */
  login: (who?: string) => AppUser;
  /** Mode API : ouvre la session renvoyée par le serveur et charge billets et commandes. */
  startSession: (s: Session_) => Promise<void>;
  /** Mode serveur : recharge profil, billets et commandes du compte. */
  refresh: () => Promise<void>;
  logout: () => void;
  updateUser: (patch: Partial<AppUser>) => void;

  favorites: string[];
  toggleFavorite: (eventId: string) => void;
  reminders: string[];
  toggleReminder: (eventId: string) => void;
  follows: string[];
  toggleFollow: (organizerId: string) => void;

  tickets: IssuedTicket[];
  addTickets: (t: IssuedTicket[]) => void;
  updateTicket: (id: string, patch: Partial<IssuedTicket>) => void;
  orders: Order[];
  addOrder: (o: Order) => void;
  updateOrder: (id: string, patch: Partial<Order>) => void;

  notifications: NotificationItem[];
  markRead: (id?: string) => void;
  pushNotification: (n: Omit<NotificationItem, 'id' | 'date' | 'read'>) => void;

  offlineScans: OfflineScan[];
  setOfflineScans: (fn: (s: OfflineScan[]) => OfflineScan[]) => void;

  referral: Referral | null;
  setReferral: (r: Referral | null) => void;

  toasts: Toast[];
  toast: (msg: string, kind?: Toast['kind'], action?: Toast['action']) => void;
  dismissToast: (id: number) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = usePersisted<Lang>('e509.lang', navigator.language?.startsWith('en') ? 'en' : 'fr');
  const [currency, setCurrency] = usePersisted<Currency>('e509.currency', 'HTG');
  const [theme, setTheme] = usePersisted<Theme>('e509.theme', 'system');
  const [user, setUser] = usePersisted<AppUser | null>('e509.user', DEMO ? db.users[0] : null);
  const [favorites, setFavorites] = usePersisted<string[]>('e509.favs', DEMO ? ['e2', 'e4'] : []);
  const [reminders, setReminders] = usePersisted<string[]>('e509.reminders', DEMO ? ['e2'] : []);
  const [follows, setFollows] = usePersisted<string[]>('e509.follows', DEMO ? ['org2'] : []);
  const [tickets, setTickets] = usePersisted<IssuedTicket[]>('e509.tickets', DEMO ? db.myTickets : []);
  const [orders, setOrders] = usePersisted<Order[]>('e509.orders', DEMO ? db.myOrders : []);
  const [notifications, setNotifications] = usePersisted<NotificationItem[]>('e509.notifs', DEMO ? db.notifications : []);
  const [offlineScans, setOfflineScansRaw] = usePersisted<OfflineScan[]>('e509.offline', []);
  const [referral, setReferral] = usePersisted<Referral | null>('e509.ref', null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, number>());

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // Thème : classe `dark` sur <html>, en suivant le système si demandé
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0A1022' : '#F1F3F8');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  // Le lien de parrainage expire après 30 jours
  useEffect(() => {
    if (referral && new Date(referral.expiresAt) < new Date()) setReferral(null);
  }, [referral, setReferral]);

  const t = useCallback((fr: string, vars?: Vars) => translate(lang, fr, vars), [lang]);

  const dismissToast = useCallback((id: number) => {
    setToasts((s) => s.filter((x) => x.id !== id));
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  }, []);

  const toast = useCallback(
    (msg: string, kind: Toast['kind'] = 'success', action?: Toast['action']) => {
      const id = Date.now() + Math.random();
      setToasts((s) => [...s.slice(-2), { id, msg, kind, action }]);
      // Les messages avec action restent plus longtemps (temps de lecture + clic)
      timers.current.set(id, window.setTimeout(() => dismissToast(id), action || kind === 'error' ? 7000 : 3500));
    },
    [dismissToast],
  );

  const login = useCallback(
    (who = 'participant') => {
      const u = db.users.find((x) => x.id === who) ?? db.users.find((x) => x.role === who) ?? db.users[0];
      // Écriture immédiate : la session survit à un rechargement juste après la connexion
      persist('e509.user', u);
      setUser(u);
      try {
        localStorage.setItem('e509.token', `demo.${u.id}`);
      } catch {
        /* ignore */
      }
      return u;
    },
    [setUser],
  );

  /** Mode API : profil, billets et commandes à jour depuis le serveur. */
  const sync = useCallback(async () => {
    if (DEMO) return;
    try {
      const [me, tk, od] = await Promise.all([fetchMe(), fetchMyTickets(), fetchMyOrders()]);
      persist('e509.user', me);
      setUser(me);
      setTickets(tk);
      setOrders(od);
    } catch {
      /* hors ligne : on garde la copie locale ; une session expirée déclenche la déconnexion */
    }
  }, [setUser, setTickets, setOrders]);

  const startSession = useCallback(
    async (s: Session_) => {
      try {
        localStorage.setItem('e509.token', s.token);
      } catch {
        /* ignore */
      }
      persist('e509.user', s.user);
      setUser(s.user);
      // Les commandes passées sans compte sur cet appareil rejoignent le compte (leur clé prouve qu'elles sont bien à vous)
      const guest = load<{ id: string; key: string }[]>(GUEST_KEY, []);
      if (guest.length) {
        await Promise.all(guest.map((g) => claimOrder(g.id, g.key).catch(() => {})));
        persist(GUEST_KEY, []);
      }
      await Promise.all([sync(), refreshCatalog()]);
    },
    [setUser, sync],
  );

  useEffect(() => {
    if (!DEMO && user) void sync();
    // Une seule fois au démarrage
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Application Android : l'appareil rejoint le compte connecté pour recevoir ses notifications push
  useEffect(() => {
    if (!DEMO && user) registerPush();
  }, [user]);

  const logout = useCallback(() => {
    // Avant d'effacer la session : le serveur doit encore reconnaître le compte pour retirer l'appareil
    void unregisterPush();
    persist('e509.user', null);
    setUser(null);
    if (!DEMO) {
      // Les billets et commandes appartiennent au compte : on ne les laisse pas sur l'appareil
      setTickets([]);
      setOrders([]);
      void refreshCatalog();
    }
    try {
      localStorage.removeItem('e509.token');
    } catch {
      /* ignore */
    }
  }, [setUser, setTickets, setOrders]);

  const toggle = (set: (fn: (s: string[]) => string[]) => void) => (id: string) =>
    set((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));

  const value = useMemo<AppState>(
    () => ({
      lang, setLang, t, currency, setCurrency, theme, setTheme,
      user, login, startSession, refresh: sync, logout,
      updateUser: (patch) => {
        setUser((u) => (u ? { ...u, ...patch } : u));
        if (DEMO) return;
        const save = patch.role === 'organizer' ? becomeOrganizer() : updateProfile({ name: patch.name, phone: patch.phone, city: patch.city });
        save
          .then((u) => {
            setUser(u);
            persist('e509.user', u);
            return refreshCatalog();
          })
          .catch(() => toast(translate(lang, 'L’enregistrement a échoué. Réessayez.'), 'error'));
      },
      favorites, toggleFavorite: toggle(setFavorites),
      reminders, toggleReminder: toggle(setReminders),
      follows, toggleFollow: toggle(setFollows),
      tickets,
      addTickets: (n) => setTickets((s) => [...n, ...s]),
      updateTicket: (id, patch) => setTickets((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x))),
      orders,
      addOrder: (o) => setOrders((s) => [o, ...s]),
      updateOrder: (id, patch) => setOrders((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x))),
      notifications,
      markRead: (id) => setNotifications((s) => s.map((n) => (!id || n.id === id ? { ...n, read: true } : n))),
      pushNotification: (n) => setNotifications((s) => [{ ...n, id: `n${Date.now()}`, date: new Date().toISOString(), read: false }, ...s]),
      offlineScans,
      setOfflineScans: (fn) => setOfflineScansRaw((s) => fn(s)),
      referral, setReferral,
      toasts, toast, dismissToast,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang, t, currency, theme, user, login, startSession, logout, favorites, reminders, follows, tickets, orders, notifications, offlineScans, referral, toasts, toast, dismissToast],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp hors AppProvider');
  return c;
}

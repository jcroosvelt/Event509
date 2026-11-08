import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as db from '@/data/mock';
import { dictionaries, type TKey } from '@/lib/i18n';
import type { AppUser, Currency, IssuedTicket, Lang, NotificationItem, Order } from '@/types';

/** Lecture/écriture localStorage tolérante aux erreurs (navigation privée, quota…). */
function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function persist(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
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
  at: string;
  synced: boolean;
}

interface AppState {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: TKey) => string;
  currency: Currency;
  setCurrency: (c: Currency) => void;

  user: AppUser | null;
  login: (role?: AppUser['role']) => void;
  logout: () => void;
  updateUser: (patch: Partial<AppUser>) => void;

  favorites: string[];
  toggleFavorite: (eventId: string) => void;
  reminders: string[];
  toggleReminder: (eventId: string) => void;

  tickets: IssuedTicket[];
  addTickets: (t: IssuedTicket[]) => void;
  updateTicket: (id: string, patch: Partial<IssuedTicket>) => void;
  orders: Order[];
  addOrder: (o: Order) => void;

  notifications: NotificationItem[];
  markAllRead: () => void;

  feePercent: number;
  setFeePercent: (n: number) => void;

  offlineScans: OfflineScan[];
  setOfflineScans: (fn: (s: OfflineScan[]) => OfflineScan[]) => void;

  toast: (msg: string, kind?: Toast['kind']) => void;
}

interface Toast {
  id: number;
  msg: string;
  kind: 'success' | 'error' | 'info';
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = usePersisted<Lang>('e509.lang', 'fr');
  const [currency, setCurrency] = usePersisted<Currency>('e509.currency', 'HTG');
  const [user, setUser] = usePersisted<AppUser | null>('e509.user', db.users[0]);
  const [favorites, setFavorites] = usePersisted<string[]>('e509.favs', ['e2', 'e4']);
  const [reminders, setReminders] = usePersisted<string[]>('e509.reminders', ['e2']);
  const [tickets, setTickets] = usePersisted<IssuedTicket[]>('e509.tickets', db.myTickets);
  const [orders, setOrders] = usePersisted<Order[]>('e509.orders', db.myOrders);
  const [notifications, setNotifications] = usePersisted<NotificationItem[]>('e509.notifs', db.notifications);
  const [feePercent, setFeePercent] = usePersisted<number>('e509.fee', 5);
  const [offlineScans, setOfflineScansRaw] = usePersisted<OfflineScan[]>('e509.offline', []);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback((k: TKey) => dictionaries[lang][k] ?? k, [lang]);

  const toast = useCallback((msg: string, kind: Toast['kind'] = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((s) => [...s, { id, msg, kind }]);
    setTimeout(() => setToasts((s) => s.filter((x) => x.id !== id)), 3200);
  }, []);

  const value = useMemo<AppState>(
    () => ({
      lang, setLang, t, currency, setCurrency,
      user,
      login: (role = 'participant') => setUser(db.users.find((u) => u.role === role) ?? db.users[0]),
      logout: () => setUser(null),
      updateUser: (patch) => setUser((u) => (u ? { ...u, ...patch } : u)),
      favorites,
      toggleFavorite: (id) => setFavorites((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id])),
      reminders,
      toggleReminder: (id) => setReminders((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id])),
      tickets,
      addTickets: (n) => setTickets((s) => [...n, ...s]),
      updateTicket: (id, patch) => setTickets((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x))),
      orders,
      addOrder: (o) => setOrders((s) => [o, ...s]),
      notifications,
      markAllRead: () => setNotifications((s) => s.map((n) => ({ ...n, read: true }))),
      feePercent, setFeePercent,
      offlineScans,
      setOfflineScans: (fn) => setOfflineScansRaw((s) => fn(s)),
      toast,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang, t, currency, user, favorites, reminders, tickets, orders, notifications, feePercent, offlineScans, toast],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4">
        {toasts.map((x) => (
          <div
            key={x.id}
            role="status"
            className={`pointer-events-auto animate-[toast_.25s_ease-out] rounded-2xl px-4 py-3 text-sm font-semibold shadow-card ${
              x.kind === 'error' ? 'bg-red-600 text-white' : x.kind === 'info' ? 'bg-white text-ink' : 'bg-ink text-white'
            }`}
          >
            {x.msg}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useApp() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp hors AppProvider');
  return c;
}

import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell, Compass, Heart, Home, LayoutDashboard, LogOut, Megaphone, Receipt, Search, Settings, ShieldCheck, Ticket, User,
} from 'lucide-react';
import { Logo } from '@/components/brand';
import { Avatar, IconButton } from '@/components/ui';
import { useApp } from '@/store/app';
import { cx, relative } from '@/lib/format';
import { languages } from '@/lib/i18n';
import type { Currency, Lang } from '@/types';

function Prefs() {
  const { lang, setLang, currency, setCurrency } = useApp();
  return (
    <div className="hidden items-center gap-1 rounded-full bg-canvas p-1 lg:flex">
      <select
        aria-label="Langue"
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        className="cursor-pointer rounded-full bg-transparent px-2 py-1 text-xs font-bold text-ink outline-none"
      >
        {languages.map((l) => (
          <option key={l.id} value={l.id}>{l.flag}</option>
        ))}
      </select>
      <select
        aria-label="Devise"
        value={currency}
        onChange={(e) => setCurrency(e.target.value as Currency)}
        className="cursor-pointer rounded-full bg-white px-2 py-1 text-xs font-bold text-ink shadow-sm outline-none"
      >
        <option value="HTG">HTG</option>
        <option value="USD">USD</option>
      </select>
    </div>
  );
}

function NotificationsMenu() {
  const { notifications, markAllRead, lang } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = notifications.filter((n) => !n.read).length;
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <IconButton label="Notifications" onClick={() => setOpen((o) => !o)}>
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-brand ring-2 ring-white" />}
      </IconButton>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 rounded-3xl bg-white p-2 shadow-2xl ring-1 ring-line">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="font-bold">Notifications</span>
            <button className="text-xs font-semibold text-brand" onClick={markAllRead}>Tout marquer comme lu</button>
          </div>
          {notifications.map((n) => (
            <div key={n.id} className={cx('rounded-2xl px-3 py-2.5', !n.read && 'bg-brand-50')}>
              <div className="text-sm font-semibold text-ink">{n.title}</div>
              <div className="text-xs text-ink-soft">{n.body}</div>
              <div className="mt-1 text-[11px] text-ink-muted">{relative(n.date, lang)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { user, logout, t } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  if (!user)
    return (
      <Link to="/connexion" className="inline-flex h-11 items-center rounded-full bg-ink px-5 text-sm font-semibold text-white">
        {t('nav.login')}
      </Link>
    );
  const items = [
    { to: '/compte', icon: User, label: t('nav.profile') },
    { to: '/billets', icon: Ticket, label: t('nav.tickets') },
    { to: '/compte/achats', icon: Receipt, label: t('nav.orders') },
    { to: '/favoris', icon: Heart, label: t('nav.favorites') },
    { to: '/ambassadeurs', icon: Megaphone, label: t('nav.ambassador') },
    { to: '/organisateur', icon: LayoutDashboard, label: t('nav.organizer') },
    { to: '/admin', icon: ShieldCheck, label: t('nav.admin') },
    { to: '/compte/parametres', icon: Settings, label: t('nav.settings') },
  ];
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="hidden rounded-full lg:block ring-2 ring-white transition hover:ring-brand-200" aria-label="Menu du compte">
        <Avatar name={user.name} size={44} />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-64 rounded-3xl bg-white p-2 shadow-2xl ring-1 ring-line" onClick={() => setOpen(false)}>
          <div className="px-3 py-2">
            <div className="font-bold">{user.name}</div>
            <div className="text-xs text-ink-muted">{user.email}</div>
          </div>
          {items.map((i) => (
            <Link key={i.to} to={i.to} className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium hover:bg-canvas">
              <i.icon className="h-4 w-4 text-ink-soft" /> {i.label}
            </Link>
          ))}
          <button
            onClick={() => {
              logout();
              nav('/');
            }}
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" /> {t('nav.logout')}
          </button>
        </div>
      )}
    </div>
  );
}

/** Barre de navigation basse mobile avec bouton central surélevé (comme la maquette). */
export function BottomNav({
  items, center,
}: {
  items: { to: string; icon: ComponentType<{ className?: string }>; label: string; end?: boolean }[];
  center: { to: string; icon: ComponentType<{ className?: string }>; label: string };
}) {
  const left = items.slice(0, 2);
  const right = items.slice(2, 4);
  const Item = ({ i }: { i: (typeof items)[number] }) => (
    <NavLink
      to={i.to}
      end={i.end}
      className={({ isActive }) => cx('flex flex-1 flex-col items-center gap-1 py-1 text-[11px] font-medium', isActive ? 'text-ink' : 'text-ink-muted')}
    >
      {({ isActive }) => (
        <>
          <i.icon className={cx('h-[22px] w-[22px]', isActive && 'stroke-[2.4]')} />
          <span className={cx(isActive && 'font-bold')}>{i.label}</span>
        </>
      )}
    </NavLink>
  );
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-2 pt-2 backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-md items-end">
        {left.map((i) => <Item key={i.to} i={i} />)}
        <div className="flex flex-1 justify-center">
          <NavLink
            to={center.to}
            aria-label={center.label}
            className="-mt-8 grid h-16 w-16 place-items-center rounded-full bg-brand text-white shadow-float ring-[6px] ring-white transition active:scale-95"
          >
            <center.icon className="h-7 w-7" />
          </NavLink>
        </div>
        {right.map((i) => <Item key={i.to} i={i} />)}
      </div>
    </nav>
  );
}

export default function PublicLayout() {
  const { t, user } = useApp();
  const loc = useLocation();
  const nav = useNavigate();
  const [q, setQ] = useState('');

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  const links = [
    { to: '/', label: t('nav.discover'), end: true },
    { to: '/explorer', label: t('nav.explore') },
    { to: '/billets', label: t('nav.tickets') },
    { to: '/organisateur', label: t('nav.organizer') },
  ];

  return (
    <div className="min-h-screen pb-28 lg:pb-0">
      <header className="sticky top-0 z-30 border-b border-line/60 bg-canvas/85 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Logo />
          <nav className="ml-6 hidden items-center gap-1 lg:flex">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) => cx('rounded-full px-4 py-2 text-sm font-semibold transition', isActive ? 'bg-white text-ink shadow-sm' : 'text-ink-soft hover:text-ink')}
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <form
            className="ml-auto hidden max-w-xs flex-1 md:block"
            onSubmit={(e) => {
              e.preventDefault();
              nav(`/explorer?q=${encodeURIComponent(q)}`);
            }}
          >
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('common.search')}
                className="h-11 w-full rounded-full border border-line bg-white pl-10 pr-4 text-sm outline-none focus:border-brand"
              />
            </div>
          </form>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <Prefs />
            {user && <NotificationsMenu />}
            <UserMenu />
          </div>
        </div>
      </header>

      <main>
        <Outlet />
      </main>

      <footer className="mt-20 hidden border-t border-line bg-white lg:block">
        <div className="mx-auto grid max-w-7xl grid-cols-4 gap-8 px-6 py-12 text-sm">
          <div>
            <img src="/logo-full.png" alt="Event509" className="h-12 w-auto" />
          </div>
          <div>
            <div className="mb-3 font-bold">Participants</div>
            <ul className="space-y-2 text-ink-soft">
              <li><Link to="/explorer">Explorer les événements</Link></li>
              <li><Link to="/billets">Mes billets</Link></li>
              <li><Link to="/ambassadeurs">Devenir ambassadeur</Link></li>
            </ul>
          </div>
          <div>
            <div className="mb-3 font-bold">Organisateurs</div>
            <ul className="space-y-2 text-ink-soft">
              <li><Link to="/organisateur/evenements/nouveau">Créer un événement</Link></li>
              <li><Link to="/organisateur">Tableau de bord</Link></li>
              <li><Link to="/organisateur/checkin">Check-in QR</Link></li>
            </ul>
          </div>
          <div>
            <div className="mb-3 font-bold">Paiements acceptés</div>
            <p className="text-ink-soft">Cartes bancaires, MonCash, NatCash, PayPal, virement — en HTG ou USD.</p>
          </div>
        </div>
        <div className="border-t border-line py-5 text-center text-xs text-ink-muted">© 2026 Event509 — Discover events. Get your pass. Show up.</div>
      </footer>

      <BottomNav
        items={[
          { to: '/', icon: Home, label: 'Accueil', end: true },
          { to: '/explorer', icon: Compass, label: t('nav.explore') },
          { to: '/favoris', icon: Heart, label: t('nav.favorites') },
          { to: user ? '/compte' : '/connexion', icon: User, label: t('nav.profile') },
        ]}
        center={{ to: '/billets', icon: Ticket, label: t('nav.tickets') }}
      />
    </div>
  );
}

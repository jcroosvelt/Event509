import { useEffect, useId, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Bell, Compass, Heart, Home, LayoutDashboard, LogOut, Megaphone, Moon, Receipt, Repeat2, Search, Settings, ShieldCheck, Sun, Ticket, User, WifiOff, type LucideIcon,
} from 'lucide-react';
import { Logo } from '@/components/brand';
import { Avatar } from '@/components/ui';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ambassadors } from '@/data/mock';
import { useApp } from '@/store/app';
import { useOnline } from '@/lib/hooks';
import { captureTrackingCode } from '@/lib/tracking';
import { cx, relative } from '@/lib/format';
import { languages } from '@/lib/i18n';
import { can, hasOrganizerAccess } from '@/lib/permissions';
import type { Currency, Lang } from '@/types';

/** Ferme un menu au clic extérieur et à Échap, puis rend le focus au bouton. */
function useMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return { open, setOpen, ref, btn };
}

function Prefs() {
  const { lang, setLang, currency, setCurrency, theme, setTheme, t } = useApp();
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  return (
    <div className="hidden items-center gap-1 rounded-full bg-surface p-1 shadow-sm ring-1 ring-line lg:flex">
      <label className="sr-only" htmlFor="pref-lang">{t('Langue')}</label>
      <select id="pref-lang" value={lang} onChange={(e) => setLang(e.target.value as Lang)} className="cursor-pointer rounded-full bg-transparent px-2 py-1 text-xs font-bold text-ink outline-none">
        {languages.map((l) => <option key={l.id} value={l.id}>{l.short}</option>)}
      </select>
      <label className="sr-only" htmlFor="pref-cur">{t('Devise')}</label>
      <select id="pref-cur" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} className="cursor-pointer rounded-full bg-transparent px-2 py-1 text-xs font-bold text-ink outline-none">
        <option value="HTG">HTG</option>
        <option value="USD">USD</option>
      </select>
      <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label={dark ? t('Passer en mode clair') : t('Passer en mode sombre')} className="grid h-7 w-7 place-items-center rounded-full text-ink-soft hover:text-ink">
        {dark ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
      </button>
    </div>
  );
}

export function NotificationsMenu() {
  const { notifications, markRead, lang, t } = useApp();
  const { open, setOpen, ref, btn } = useMenu();
  const id = useId();
  const unread = notifications.filter((n) => !n.read).length;
  return (
    <div className="relative" ref={ref}>
      <button
        ref={btn}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={unread ? t('Notifications ({n} non lues)', { n: unread }) : t('Notifications')}
        onClick={() => setOpen((o) => !o)}
        className="relative grid h-11 w-11 place-items-center rounded-full border border-line bg-surface text-ink transition hover:border-ink/20"
      >
        <Bell className="h-[18px] w-[18px]" aria-hidden />
        {unread > 0 && <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-brand ring-2 ring-surface" />}
      </button>
      {open && (
        <div id={id} className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-3xl bg-surface p-2 shadow-2xl ring-1 ring-line">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="font-bold">{t('Notifications')}</span>
            {unread > 0 && <button type="button" className="text-xs font-semibold text-brand-ink" onClick={() => markRead()}>{t('Tout marquer comme lu')}</button>}
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {notifications.slice(0, 5).map((n) => (
              <li key={n.id} className={cx('rounded-2xl px-3 py-2.5', !n.read && 'bg-brand-50')}>
                <div className="text-sm font-semibold text-ink">{n.title}</div>
                <div className="text-xs text-ink-soft">{n.body}</div>
                <div className="mt-1 text-[11px] text-ink-muted">{relative(n.date, lang)}</div>
              </li>
            ))}
          </ul>
          <Link to="/notifications" onClick={() => setOpen(false)} className="mt-1 block rounded-2xl px-3 py-2.5 text-center text-sm font-semibold text-brand-ink hover:bg-canvas">
            {t('Voir toutes les notifications')}
          </Link>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { user, logout, t } = useApp();
  const { open, setOpen, ref, btn } = useMenu();
  const nav = useNavigate();
  const id = useId();
  // Visiteur : pas de bouton en haut (la connexion organisateur se trouve via « Créer un événement »)
  if (!user) return null;
  const items = [
    { to: '/compte', icon: User, label: t('Profil') },
    { to: '/billets', icon: Ticket, label: t('Mes billets') },
    { to: '/compte/achats', icon: Receipt, label: t('Historique des achats') },
    { to: '/favoris', icon: Heart, label: t('Favoris') },
    { to: '/revente', icon: Repeat2, label: t('Billets en revente') },
    { to: '/ambassadeurs', icon: Megaphone, label: t('Ambassadeurs') },
    ...(hasOrganizerAccess(user) ? [{ to: '/organisateur', icon: LayoutDashboard, label: t('Espace organisateur') }] : []),
    ...(can(user, 'admin') ? [{ to: '/admin', icon: ShieldCheck, label: t('Administration') }] : []),
    { to: '/compte/parametres', icon: Settings, label: t('Paramètres') },
  ];
  return (
    <div className="relative hidden lg:block" ref={ref}>
      <button ref={btn} type="button" aria-expanded={open} aria-controls={id} aria-label={t('Menu du compte')} onClick={() => setOpen((o) => !o)} className="rounded-full ring-2 ring-surface transition hover:ring-brand-200">
        <Avatar name={user.name} size={44} />
      </button>
      {open && (
        <div id={id} className="absolute right-0 z-40 mt-2 w-64 rounded-3xl bg-surface p-2 shadow-2xl ring-1 ring-line">
          <div className="px-3 py-2">
            <div className="font-bold">{user.name}</div>
            <div className="truncate text-xs text-ink-muted">{user.email}</div>
          </div>
          <nav aria-label={t('Menu du compte')}>
            {items.map((i) => (
              <Link key={i.to} to={i.to} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium hover:bg-canvas">
                <i.icon className="h-4 w-4 text-ink-soft" aria-hidden /> {i.label}
              </Link>
            ))}
          </nav>
          <button
            type="button"
            onClick={() => {
              logout();
              nav('/');
            }}
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" aria-hidden /> {t('Déconnexion')}
          </button>
        </div>
      )}
    </div>
  );
}

type NavIcon = LucideIcon;

/** Barre de navigation basse mobile avec bouton central surélevé (comme la maquette). */
export function BottomNav({
  items, center, label,
}: {
  items: { to: string; icon: NavIcon; label: string; end?: boolean }[];
  center?: { to: string; icon: NavIcon; label: string };
  label: string;
}) {
  const Item = ({ i }: { i: (typeof items)[number] }) => (
    <NavLink
      to={i.to}
      end={i.end}
      className={({ isActive }) => cx('flex min-w-0 flex-1 flex-col items-center gap-1 py-1 text-[11px] font-medium', isActive ? 'text-ink' : 'text-ink-muted')}
    >
      {({ isActive }) => (
        <>
          <i.icon className={cx('h-[22px] w-[22px]', isActive && 'stroke-[2.4]')} aria-hidden />
          <span className={cx('max-w-full truncate', isActive && 'font-bold')}>{i.label}</span>
        </>
      )}
    </NavLink>
  );
  const half = Math.ceil(items.length / 2);
  return (
    <nav aria-label={label} className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-2 pt-2 backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-md items-end">
        {(center ? items.slice(0, half) : items).map((i) => <Item key={i.to} i={i} />)}
        {center && (
          <div className="flex flex-1 justify-center">
            <NavLink
              to={center.to}
              aria-label={center.label}
              className="-mt-8 grid h-16 w-16 place-items-center rounded-full bg-brand text-white shadow-float ring-[6px] ring-surface transition active:scale-95"
            >
              <center.icon className="h-7 w-7" aria-hidden />
            </NavLink>
          </div>
        )}
        {center && items.slice(half).map((i) => <Item key={i.to} i={i} />)}
      </div>
    </nav>
  );
}

export function OfflineBanner() {
  const online = useOnline();
  const { t } = useApp();
  if (online) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-center text-xs font-semibold text-amber-800">
      <WifiOff className="h-3.5 w-3.5" aria-hidden /> {t('Vous êtes hors ligne. Vos billets restent accessibles.')}
    </div>
  );
}

export function SkipLink() {
  const { t } = useApp();
  return (
    <a href="#contenu" className="sr-only z-[200] rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
      {t('Aller au contenu')}
    </a>
  );
}

/** Mémorise un lien de suivi d'organisateur (?src=CODE) puis nettoie l'adresse. */
function useTrackingCapture() {
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const code = params.get('src');
    if (!code) return;
    captureTrackingCode(code);
    const p = new URLSearchParams(params);
    p.delete('src');
    setParams(p, { replace: true });
  }, [params, setParams]);
}

/** Mémorise un lien de parrainage (?ref=CODE) pendant 30 jours. */
function useReferralCapture() {
  const [params, setParams] = useSearchParams();
  const { setReferral, toast, t } = useApp();
  useEffect(() => {
    const code = params.get('ref')?.toUpperCase();
    if (!code) return;
    const am = ambassadors.find((a) => a.code === code);
    if (am) {
      const exp = new Date();
      exp.setDate(exp.getDate() + 30);
      setReferral({ code, expiresAt: exp.toISOString() });
      toast(t('Invitation de {name} enregistrée', { name: am.name }), 'info');
    }
    const p = new URLSearchParams(params);
    p.delete('ref');
    setParams(p, { replace: true });
  }, [params, setParams, setReferral, toast, t]);
}

export default function PublicLayout() {
  const { t, user } = useApp();
  const loc = useLocation();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  useReferralCapture();
  useTrackingCapture();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  const links = [
    { to: '/', label: t('Découvrir'), end: true },
    { to: '/explorer', label: t('Explorer') },
    ...(user ? [{ to: '/billets', label: t('Mes billets') }] : []),
    hasOrganizerAccess(user) ? { to: '/organisateur', label: t('Espace organisateur') } : { to: '/organisateur/evenements/nouveau', label: t('Créer un événement') },
  ];

  return (
    <div className="min-h-screen pb-28 lg:pb-0">
      <SkipLink />
      <OfflineBanner />
      <header className="sticky top-0 z-30 border-b border-line/60 bg-canvas/85 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Logo />
          <nav aria-label={t('Navigation principale')} className="ml-6 hidden items-center gap-1 lg:flex">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) => cx('rounded-full px-4 py-2 text-sm font-semibold transition', isActive ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft hover:text-ink')}
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <form
            role="search"
            className="ml-auto hidden max-w-xs flex-1 md:block"
            onSubmit={(e) => {
              e.preventDefault();
              nav(`/explorer?q=${encodeURIComponent(q)}`);
            }}
          >
            <label htmlFor="top-search" className="sr-only">{t('Rechercher')}</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden />
              <input
                id="top-search"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('Rechercher')}
                className="h-11 w-full rounded-full border border-line bg-surface pl-10 pr-4 text-sm outline-none focus:border-brand"
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

      <main id="contenu" tabIndex={-1} className="outline-none">
        <ErrorBoundary resetKey={loc.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>

      <footer className="mt-20 hidden border-t border-line bg-surface lg:block">
        <div className="mx-auto grid max-w-7xl grid-cols-4 gap-8 px-6 py-12 text-sm">
          <div>
            <Logo />
            <p className="mt-3 text-ink-soft">Discover events. Get your pass. Show up.</p>
          </div>
          <div>
            <h2 className="mb-3 font-bold">{t('Participants')}</h2>
            <ul className="space-y-2 text-ink-soft">
              <li><Link to="/explorer">{t('Explorer les événements')}</Link></li>
              <li><Link to="/revente">{t('Billets en revente')}</Link></li>
              <li><Link to="/ambassadeurs">{t('Devenir ambassadeur')}</Link></li>
            </ul>
          </div>
          <div>
            <h2 className="mb-3 font-bold">{t('Organisateurs')}</h2>
            <ul className="space-y-2 text-ink-soft">
              <li><Link to="/organisateur/evenements/nouveau">{t('Créer un événement')}</Link></li>
              <li><Link to="/organisateur">{t('Tableau de bord')}</Link></li>
              <li><Link to="/organisateur/checkin">{t('Check-in QR')}</Link></li>
            </ul>
          </div>
          <div>
            <h2 className="mb-3 font-bold">{t('Paiements acceptés')}</h2>
            <p className="text-ink-soft">{t('Cartes bancaires, MonCash, NatCash, PayPal, virement — en HTG ou USD.')}</p>
          </div>
        </div>
        <div className="flex justify-center gap-6 border-t border-line py-5 text-xs text-ink-muted">
          <span>© {new Date().getFullYear()} Event509</span>
          <Link to="/cgu" className="hover:text-ink">{t('Conditions d’utilisation')}</Link>
          <Link to="/confidentialite" className="hover:text-ink">{t('Confidentialité')}</Link>
        </div>
      </footer>

      <BottomNav
        label={t('Navigation principale')}
        items={[
          { to: '/', icon: Home, label: t('Accueil'), end: true },
          { to: '/explorer', icon: Compass, label: t('Explorer') },
          { to: '/favoris', icon: Heart, label: t('Favoris') },
          { to: user ? '/compte' : '/connexion', icon: User, label: user ? t('Profil') : t('Organisateur') },
        ]}
        center={user ? { to: '/billets', icon: Ticket, label: t('Mes billets') } : undefined}
      />
    </div>
  );
}

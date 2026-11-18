import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Heart, LayoutDashboard, LogOut, Rocket, Settings, ShieldCheck, Ticket, User, type LucideIcon } from 'lucide-react';
import { Avatar } from '@/components/ui';
import { useApp } from '@/store/app';
import { cx } from '@/lib/format';
import { can, hasOrganizerAccess } from '@/lib/permissions';

export interface BarItem { to: string; icon: LucideIcon; label: string; end?: boolean }

const isOn = (path: string, i: BarItem) => (i.end ? path === i.to : path === i.to || path.startsWith(`${i.to}/`));

/**
 * Barre de navigation flottante (mobile) : pilule avec onglets (icône + libellé, l'onglet actif dans une pastille).
 * Toucher l'onglet actif la replie : bouton rond de l'onglet · pilule du contexte · avatar. L'avatar (toucher ou appui long)
 * ouvre un menu qui surgit au-dessus. Toucher le bouton rond redéploie les onglets. Mêmes mouvements dans l'application.
 */
export function FloatingBar({ items, label, subtitle }: { items: BarItem[]; label: string; subtitle?: string }) {
  const { user, logout, t } = useApp();
  const { pathname } = useLocation();
  const nav = useNavigate();
  const [compact, setCompact] = useState(false);
  const [menu, setMenu] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const press = useRef<number>();
  const active = [...items].filter((i) => isOn(pathname, i)).sort((a, b) => b.to.length - a.to.length)[0];

  // Nouvelle page : la barre se redéploie et le menu se ferme
  useEffect(() => { setCompact(false); setMenu(false); }, [pathname]);
  useEffect(() => {
    if (!menu) return;
    const down = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setMenu(false); };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key); };
  }, [menu]);

  const entries: { to: string; icon: LucideIcon; label: string; tone: string }[] = user ? [
    { to: '/compte', icon: User, label: t('Mon espace'), tone: 'bg-brand text-white' },
    { to: '/billets', icon: Ticket, label: t('Mes billets'), tone: 'bg-emerald-500 text-white' },
    { to: '/favoris', icon: Heart, label: t('Favoris'), tone: 'bg-rose-500 text-white' },
    hasOrganizerAccess(user)
      ? { to: '/organisateur', icon: LayoutDashboard, label: t('Espace organisateur'), tone: 'bg-violet-600 text-white' }
      : { to: '/compte/devenir-organisateur', icon: Rocket, label: t('Devenir organisateur'), tone: 'bg-violet-600 text-white' },
    ...(can(user, 'admin') ? [{ to: '/admin', icon: ShieldCheck, label: t('Administration'), tone: 'bg-amber-500 text-white' }] : []),
    { to: '/compte/parametres', icon: Settings, label: t('Paramètres'), tone: 'bg-ink-muted text-white' },
  ] : [];

  const spring = 'transition-all duration-500 ease-[cubic-bezier(.34,1.35,.5,1)] motion-reduce:transition-none';
  const hide = 'pointer-events-none scale-90 opacity-0 blur-[3px]';
  const show = 'scale-100 opacity-100 blur-0';

  const onTab = (e: React.MouseEvent, i: BarItem) => {
    if (user && active?.to === i.to) { e.preventDefault(); setCompact(true); }
  };

  return (
    <nav aria-label={label} ref={box} className="fixed inset-x-3 z-30 mx-auto max-w-md lg:hidden" style={{ bottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
      {/* Menu surgissant */}
      <div
        role="menu"
        aria-hidden={!menu}
        className={cx('absolute bottom-[calc(100%+10px)] right-0 w-64 origin-bottom-right rounded-[28px] bg-surface/95 p-2 shadow-2xl ring-1 ring-line backdrop-blur-xl', spring, menu ? show : hide)}
      >
        {entries.map((e, n) => (
          <Link
            key={e.to}
            to={e.to}
            role="menuitem"
            tabIndex={menu ? 0 : -1}
            onClick={() => setMenu(false)}
            style={{ transitionDelay: menu ? `${n * 35}ms` : '0ms' }}
            className={cx('flex items-center gap-3 rounded-2xl px-2 py-2 text-sm font-semibold hover:bg-canvas', spring, menu ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0')}
          >
            <span className={cx('grid h-9 w-9 place-items-center rounded-full', e.tone)}><e.icon className="h-[18px] w-[18px]" aria-hidden /></span>
            {e.label}
          </Link>
        ))}
        {user && (
          <button
            type="button"
            role="menuitem"
            tabIndex={menu ? 0 : -1}
            onClick={() => { setMenu(false); logout(); nav('/'); }}
            className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-red-500 text-white"><LogOut className="h-[18px] w-[18px]" aria-hidden /></span>
            {t('Déconnexion')}
          </button>
        )}
      </div>

      <div className="relative h-[72px] rounded-[32px] bg-surface/90 shadow-[0_16px_40px_-12px_rgba(8,8,8,0.35)] ring-1 ring-line backdrop-blur-xl">
        {/* Onglets */}
        <div className={cx('absolute inset-0 flex items-center justify-around px-2', spring, compact ? hide : show)} aria-hidden={compact}>
          {items.map((i) => {
            const on = active?.to === i.to;
            return (
              <Link
                key={i.to}
                to={i.to}
                tabIndex={compact ? -1 : 0}
                aria-current={on ? 'page' : undefined}
                onClick={(e) => onTab(e, i)}
                className={cx('flex h-[58px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-semibold transition-colors duration-300', on ? 'mx-0.5 bg-brand-100 text-brand-ink' : 'text-ink-muted')}
              >
                <i.icon className={cx('h-[22px] w-[22px] transition-transform duration-300', on && 'scale-110')} aria-hidden />
                <span className="max-w-full truncate px-1">{i.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Repliée : bouton rond · contexte · avatar */}
        <div className={cx('absolute inset-0 flex items-center gap-2 px-2.5', spring, compact ? show : hide)} aria-hidden={!compact}>
          <button
            type="button"
            tabIndex={compact ? 0 : -1}
            aria-label={t('Afficher les onglets')}
            onClick={() => { setMenu(false); setCompact(false); }}
            className="grid h-[54px] w-[54px] shrink-0 place-items-center rounded-full bg-canvas text-ink transition active:scale-95"
          >
            {active ? <active.icon className="h-[22px] w-[22px]" aria-hidden /> : <User className="h-[22px] w-[22px]" aria-hidden />}
          </button>
          <Link to="/compte" tabIndex={compact ? 0 : -1} className="flex h-[54px] min-w-0 flex-1 items-center gap-2.5 rounded-full bg-canvas px-2 pr-4 transition active:scale-[.98]">
            {user && <Avatar name={user.name} size={38} />}
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-bold">{user?.name}</span>
              <span className="block truncate text-xs text-ink-muted">{subtitle ?? active?.label}</span>
            </span>
          </Link>
          <button
            type="button"
            tabIndex={compact ? 0 : -1}
            aria-label={t('Menu du compte')}
            aria-haspopup="menu"
            aria-expanded={menu}
            onClick={() => setMenu((m) => !m)}
            onPointerDown={() => { press.current = window.setTimeout(() => setMenu(true), 450); }}
            onPointerUp={() => window.clearTimeout(press.current)}
            onPointerLeave={() => window.clearTimeout(press.current)}
            className="relative grid h-[54px] w-[54px] shrink-0 place-items-center rounded-full bg-canvas transition active:scale-95"
          >
            {user && <Avatar name={user.name} size={42} />}
            <span aria-hidden className="absolute bottom-1 right-1 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-surface" />
          </button>
        </div>
      </div>
    </nav>
  );
}

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Heart, LayoutDashboard, LogOut, Rocket, Settings, ShieldCheck, Ticket, User, type LucideIcon } from 'lucide-react';
import { Avatar } from '@/components/ui';
import { useApp } from '@/store/app';
import { cx } from '@/lib/format';
import { can, hasOrganizerAccess } from '@/lib/permissions';

export interface BarItem { to: string; icon: LucideIcon; label: string; end?: boolean }

const isOn = (path: string, i: BarItem) => (i.end ? path === i.to : path === i.to || path.startsWith(`${i.to}/`));

/** Ressort : léger dépassement puis retour, comme sur la vidéo de référence. */
const SPRING = 'cubic-bezier(.34,1.45,.5,1)';
const MS = 520;
const FADE = 'transition-[opacity,transform,filter] duration-300 ease-out motion-reduce:transition-none';

/**
 * Barre de navigation flottante (mobile) : pilule d'onglets (icône + libellé, l'onglet actif dans une pastille).
 * Toucher l'onglet actif la replie en « bouton rond de l'onglet · pilule du contexte · avatar avec point de statut » ;
 * toucher le bouton rond la redéploie. L'avatar (toucher ou appui long) fait surgir un menu de pastilles de couleur.
 * Les formes se transforment les unes dans les autres (largeurs en ressort) avec fondu et flou.
 */
export function FloatingBar({ items, label, title, subtitle }: { items: BarItem[]; label: string; title: string; subtitle?: string }) {
  const { user, logout, t } = useApp();
  const { pathname } = useLocation();
  const nav = useNavigate();
  const [compact, setCompact] = useState(false);
  const [menu, setMenu] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const press = useRef<number>();
  const longPressed = useRef(false);
  const active = [...items].filter((i) => isOn(pathname, i)).sort((a, b) => b.to.length - a.to.length)[0];
  const ActiveIcon = active?.icon ?? items[0]?.icon ?? User;
  // Avec 5 onglets ou plus, la mini-pilule du contexte laisse sa place aux onglets
  const mini = items.length <= 4;

  // Nouvelle page : la barre se redéploie et le menu se ferme
  useEffect(() => { setCompact(false); setMenu(false); }, [pathname]);
  useEffect(() => () => window.clearTimeout(press.current), []);
  useEffect(() => {
    if (!menu) return;
    const down = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setMenu(false); };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key); };
  }, [menu]);

  const entries: { to: string; icon: LucideIcon; label: string; tone: string }[] = user ? [
    { to: '/compte', icon: User, label: t('Mon espace'), tone: 'bg-brand-grad' },
    { to: '/billets', icon: Ticket, label: t('Mes billets'), tone: 'bg-emerald-500' },
    { to: '/favoris', icon: Heart, label: t('Favoris'), tone: 'bg-rose-500' },
    hasOrganizerAccess(user)
      ? { to: '/organisateur', icon: LayoutDashboard, label: t('Espace organisateur'), tone: 'bg-violet-600' }
      : { to: '/compte/devenir-organisateur', icon: Rocket, label: t('Devenir organisateur'), tone: 'bg-violet-600' },
    ...(can(user, 'admin') ? [{ to: '/admin', icon: ShieldCheck, label: t('Administration'), tone: 'bg-amber-500' }] : []),
    { to: '/compte/parametres', icon: Settings, label: t('Paramètres'), tone: 'bg-slate-500' },
  ] : [];

  const hidden = 'pointer-events-none scale-90 opacity-0 blur-[4px]';
  const shown = 'scale-100 opacity-100 blur-0';
  const cell = 'relative min-w-0 overflow-hidden rounded-full bg-surface/90 shadow-[0_14px_36px_-12px_rgba(8,8,8,0.45)] ring-1 ring-line backdrop-blur-xl';
  const grid: CSSProperties = {
    gridTemplateColumns: compact ? '60px minmax(0,1fr) 60px' : `minmax(0,1fr) ${mini ? 48 : 0}px 60px`,
    transition: `grid-template-columns ${MS}ms ${SPRING}`,
  };

  const onTab = (e: React.MouseEvent, i: BarItem) => {
    if (active?.to === i.to) { e.preventDefault(); setMenu(false); setCompact(true); }
  };

  return (
    <nav aria-label={label} className="fixed inset-x-3 z-30 lg:hidden" style={{ bottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
      <div ref={box} className="relative mx-auto max-w-md">
        {/* Menu qui surgit de l'avatar : pastilles de couleur */}
        <div
          role="menu"
          aria-hidden={!menu}
          style={{ transition: `transform ${MS}ms ${SPRING}, opacity 260ms ease-out, filter 320ms ease-out` }}
          className={cx('absolute bottom-[calc(100%+10px)] right-0 w-64 origin-bottom-right rounded-[28px] bg-surface/95 p-2 shadow-2xl ring-1 ring-line backdrop-blur-xl motion-reduce:transition-none', menu ? 'translate-y-0 scale-100 opacity-100 blur-0' : 'pointer-events-none translate-y-3 scale-75 opacity-0 blur-[6px]')}
        >
          {entries.map((e, n) => (
            <Link
              key={e.to}
              to={e.to}
              role="menuitem"
              tabIndex={menu ? 0 : -1}
              onClick={() => setMenu(false)}
              style={{ transition: `transform ${MS}ms ${SPRING} ${menu ? n * 40 : 0}ms, opacity 240ms ease-out ${menu ? n * 40 : 0}ms, filter 300ms ease-out ${menu ? n * 40 : 0}ms` }}
              className={cx('flex items-center gap-3 rounded-2xl px-2 py-2 text-sm font-semibold hover:bg-canvas motion-reduce:transition-none', menu ? 'translate-y-0 opacity-100 blur-0' : 'translate-y-3 opacity-0 blur-[4px]')}
            >
              <span className={cx('grid h-9 w-9 place-items-center rounded-full text-white', e.tone)}><e.icon className="h-[18px] w-[18px]" aria-hidden /></span>
              {e.label}
            </Link>
          ))}
          {user && (
            <button
              type="button"
              role="menuitem"
              tabIndex={menu ? 0 : -1}
              onClick={() => { setMenu(false); logout(); nav('/'); }}
              style={{ transition: `transform ${MS}ms ${SPRING} ${menu ? entries.length * 40 : 0}ms, opacity 240ms ease-out ${menu ? entries.length * 40 : 0}ms, filter 300ms ease-out ${menu ? entries.length * 40 : 0}ms` }}
              className={cx('flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-sm font-semibold text-red-600 hover:bg-red-500/10 motion-reduce:transition-none', menu ? 'translate-y-0 opacity-100 blur-0' : 'translate-y-3 opacity-0 blur-[4px]')}
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-red-500 text-white"><LogOut className="h-[18px] w-[18px]" aria-hidden /></span>
              {t('Déconnexion')}
            </button>
          )}
        </div>

        <div className="grid h-[60px] gap-2" style={grid}>
          {/* Cellule 1 : pilule d'onglets ⇄ bouton rond de l'onglet actif */}
          <div className={cell}>
            <div className={cx('absolute inset-0 flex items-center px-1.5', FADE, compact ? hidden : shown)} aria-hidden={compact}>
              {items.map((i) => {
                const on = active?.to === i.to;
                return (
                  <Link
                    key={i.to}
                    to={i.to}
                    tabIndex={compact ? -1 : 0}
                    aria-current={on ? 'page' : undefined}
                    onClick={(e) => onTab(e, i)}
                    className={cx('flex h-[48px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[10.5px] font-semibold leading-none transition-colors duration-300', on ? 'bg-brand-100 text-brand-ink' : 'text-ink-muted')}
                  >
                    <i.icon className={cx('h-[20px] w-[20px] transition-transform duration-300', on && 'scale-110')} aria-hidden />
                    <span className="max-w-full truncate whitespace-nowrap px-0.5">{i.label}</span>
                  </Link>
                );
              })}
            </div>
            <button
              type="button"
              tabIndex={compact ? 0 : -1}
              aria-hidden={!compact}
              aria-label={t('Afficher les onglets')}
              onClick={() => { setMenu(false); setCompact(false); }}
              className={cx('absolute inset-0 grid place-items-center text-brand-ink active:scale-90', FADE, compact ? shown : hidden)}
            >
              <span className="grid h-[44px] w-[44px] place-items-center rounded-full bg-brand-100"><ActiveIcon className="h-[22px] w-[22px]" aria-hidden /></span>
            </button>
          </div>

          {/* Cellule 2 : mini-pastille de la marque ⇄ pilule du contexte */}
          <Link
            to={items[0]?.to ?? '/'}
            tabIndex={compact || mini ? 0 : -1}
            aria-hidden={!compact && !mini}
            aria-label={title}
            className={cx(cell, 'flex items-center gap-2.5 px-[7px] transition-opacity duration-300 active:scale-[.98]', !compact && !mini && 'pointer-events-none opacity-0')}
          >
            <span className="grid h-[44px] w-[44px] shrink-0 place-items-center rounded-full bg-canvas">
              <img src="/logo-mark.png" alt="" width={20} height={24} className="h-6 w-auto dark:brightness-[1.8] dark:contrast-75" />
            </span>
            <span className={cx('min-w-0 whitespace-nowrap leading-tight', FADE, compact ? shown : hidden)}>
              <span className="block truncate text-sm font-extrabold">{title}</span>
              <span className="block truncate text-xs text-ink-muted">{subtitle ?? active?.label}</span>
            </span>
          </Link>

          {/* Cellule 3 : avatar avec point de statut ; toucher ou appui long = menu */}
          {user ? (
            <button
              type="button"
              aria-label={t('Menu du compte')}
              aria-haspopup="menu"
              aria-expanded={menu}
              onClick={() => { if (longPressed.current) { longPressed.current = false; return; } setMenu((m) => !m); }}
              onPointerDown={() => { longPressed.current = false; press.current = window.setTimeout(() => { longPressed.current = true; setMenu(true); }, 380); }}
              onPointerUp={() => window.clearTimeout(press.current)}
              onPointerLeave={() => window.clearTimeout(press.current)}
              onContextMenu={(e) => e.preventDefault()}
              className={cx(cell, 'grid place-items-center transition active:scale-90')}
            >
              <Avatar name={user.name} size={46} />
              <span aria-hidden className="absolute bottom-[7px] right-[7px] h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-surface" />
            </button>
          ) : (
            <Link to="/connexion" aria-label={t('Se connecter')} className={cx(cell, 'grid place-items-center text-ink transition active:scale-90')}>
              <span className="grid h-[46px] w-[46px] place-items-center rounded-full bg-canvas"><User className="h-[22px] w-[22px]" aria-hidden /></span>
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}

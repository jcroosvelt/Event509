import { useEffect, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, LogOut, X } from 'lucide-react';
import { Badge, IconButton } from '@/components/ui';
import { ApkMenuLink } from '@/components/AppInstall';
import { useApp } from '@/store/app';
import { cx } from '@/lib/format';
import { can, hasOrganizerAccess, homePath } from '@/lib/permissions';
import { A, O, adminSections, buyerSections, organizerSections, type MenuSection } from '@/lib/spaces';

/** Pastilles de couleur du menu : une teinte stable par entrée. */
export const MENU_TONES = ['bg-brand-grad', 'bg-emerald-500', 'bg-rose-500', 'bg-violet-600', 'bg-amber-500', 'bg-sky-500', 'bg-teal-500', 'bg-orange-500', 'bg-indigo-500', 'bg-slate-500'];

/** Liste des entrées d'un espace : pastille de couleur + libellé, la page ouverte sur fond clair. */
export function AccountNav({ sections, title, onNavigate }: { sections: MenuSection[]; title: string; onNavigate?: () => void }) {
  const { user } = useApp();
  const all = sections.flatMap((s) => s.items);
  return (
    <nav aria-label={title} className="flex flex-col gap-5">
      {sections.map((s, i) => {
        const items = s.items.filter((it) => can(user, it.perm));
        if (!items.length) return null;
        return (
          <div key={i}>
            {s.title && <div className="mb-2 px-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">{s.title}</div>}
            <ul className="flex flex-col gap-0.5">
              {items.map((it) => (
                <li key={it.to}>
                  <NavLink
                    to={it.to}
                    end={it.end}
                    onClick={onNavigate}
                    className={({ isActive }) => cx('flex items-center gap-3 rounded-2xl px-2 py-1.5 text-sm font-semibold transition', isActive ? 'bg-brand-100 text-brand-ink' : 'text-ink hover:bg-canvas')}
                  >
                    <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-full text-white', MENU_TONES[Math.max(0, all.findIndex((x) => x.to === it.to)) % MENU_TONES.length])}>
                      <it.icon className="h-[18px] w-[18px]" aria-hidden />
                    </span>
                    <span className="flex-1">{it.label}</span>
                    {it.badge && <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-white">{it.badge}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

/** Pied du menu : retour au site, application Android, déconnexion (mêmes pastilles que les entrées). */
export function AccountFooter({ onNavigate }: { onNavigate?: () => void }) {
  const { t, logout } = useApp();
  const nav = useNavigate();
  const row = 'flex w-full items-center gap-3 rounded-2xl px-2 py-1.5 text-left text-sm font-semibold hover:bg-canvas';
  return (
    <div className="mt-5 border-t border-line pt-3">
      <Link to="/" onClick={onNavigate} className={cx(row, 'text-ink')}>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-500 text-white"><ArrowLeft className="h-[18px] w-[18px]" aria-hidden /></span> {t('Retour au site')}
      </Link>
      <ApkMenuLink className={cx(row, 'text-ink')}>
        {(label) => <><span className="grid h-9 w-9 place-items-center rounded-full bg-brand-grad text-white"><Download className="h-[18px] w-[18px]" aria-hidden /></span> {label}</>}
      </ApkMenuLink>
      <button type="button" onClick={() => { onNavigate?.(); logout(); nav('/'); }} className={cx(row, 'text-red-600 hover:bg-red-500/10')}>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-red-500 text-white"><LogOut className="h-[18px] w-[18px]" aria-hidden /></span> {t('Déconnexion')}
      </button>
    </div>
  );
}

/**
 * LE menu du compte : un seul, le même sur toutes les pages (site public, espace acheteur, organisateur, administration).
 * Il s'ouvre depuis la photo de profil ; sans réglage, il montre l'espace de la page ouverte (sinon celui du compte).
 */
export function AccountSheet({ open, onClose, sections, base, title }: { open: boolean; onClose: () => void; sections?: MenuSection[]; base?: string; title?: string }) {
  const { user, t } = useApp();
  const { pathname } = useLocation();
  useEffect(() => { onClose(); /* nouvelle page : le menu se ferme */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [open, onClose]);
  if (!open || !user) return null;

  // Espaces du compte : acheteur pour tous, organisateur et administration selon les droits
  const spaces: { to: string; label: string }[] = [
    { to: '/compte', label: t('Mon espace') },
    ...(hasOrganizerAccess(user) ? [{ to: O, label: t('Organisateur') }] : []),
    ...(can(user, 'admin') ? [{ to: A, label: t('Administration') }] : []),
  ];
  const current = base ?? (pathname.startsWith(A) && can(user, 'admin') ? A : pathname.startsWith(O) && hasOrganizerAccess(user) ? O : pathname.startsWith('/compte') ? '/compte' : homePath(user));
  const own = current === A ? adminSections(t) : current === O ? organizerSections(t) : buyerSections(t, !hasOrganizerAccess(user));
  const menu: ReactNode = <AccountNav sections={sections ?? own} title={title ?? spaces.find((s) => s.to === current)?.label ?? t('Mon espace')} onNavigate={onClose} />;
  return (
    <div role="presentation" className="fixed inset-0 z-50 bg-navy/50" onKeyDown={(e) => e.key === 'Escape' && onClose()} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={t('Menu du compte')} className="absolute inset-y-2 right-2 w-[85%] max-w-sm overflow-y-auto rounded-[28px] bg-surface p-4 shadow-2xl ring-1 ring-line">
        <div className="mb-5 flex items-center justify-between gap-3">
          {spaces.length > 1 ? (
            <div role="group" aria-label={t('Changer d’espace')} className="flex flex-1 gap-1 rounded-2xl bg-canvas p-1">
              {spaces.map((x) => (
                <Link key={x.to} to={x.to} onClick={onClose} aria-current={x.to === current ? 'page' : undefined} className={cx('flex-1 rounded-xl px-2 py-2 text-center text-xs font-bold transition', x.to === current ? 'bg-brand-100 text-brand-ink' : 'text-ink-soft hover:text-ink')}>
                  {x.label}
                </Link>
              ))}
            </div>
          ) : <Badge tone="brand">{title ?? t('Mon espace')}</Badge>}
          <IconButton label={t('Fermer')} tone="soft" onClick={onClose} autoFocus>
            <X className="h-5 w-5" aria-hidden />
          </IconButton>
        </div>
        {menu}
        <AccountFooter onNavigate={onClose} />
      </div>
    </div>
  );
}

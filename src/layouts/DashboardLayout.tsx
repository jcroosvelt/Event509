import { useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarPlus, LogOut, Menu, X, type LucideIcon } from 'lucide-react';
import { Logo } from '@/components/brand';
import { Avatar, Badge, Button, EmptyState, IconButton } from '@/components/ui';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AccessDenied } from '@/components/guards';
import { BottomNav, NotificationsMenu, OfflineBanner, SkipLink } from './PublicLayout';
import { useApp } from '@/store/app';
import { cx } from '@/lib/format';
import { resendVerification } from '@/services/api';
import { can, hasOrganizerAccess, teamRoleLabel, type Perm } from '@/lib/permissions';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  perm: Perm;
  end?: boolean;
  badge?: string;
}

/**
 * Layout commun aux espaces organisateur et administration.
 * La navigation n'affiche que les pages autorisées pour l'utilisateur, et une
 * page ouverte sans permission redirige vers la première page autorisée.
 */
/** Rappel tant que l'adresse email n'est pas confirmée (publication et versements bloqués côté serveur). */
function VerifyBanner() {
  const { t, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const resend = async () => {
    setBusy(true);
    try {
      const r = await resendVerification();
      toast(r.sent ? t('Lien envoyé. Vérifiez votre boîte email.') : t('Envoi impossible pour le moment.'), r.sent ? 'success' : 'error');
    } catch {
      toast(t('Trop de demandes. Réessayez plus tard.'), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div role="status" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <span>{t('Confirmez votre adresse email pour publier des événements et demander vos versements.')}</span>
      <Button size="sm" variant="outline" onClick={resend} loading={busy}>{t('Renvoyer le lien')}</Button>
    </div>
  );
}

export default function DashboardLayout({
  title, base, sections, bottom, center,
}: {
  title: string;
  base: string;
  sections: { title?: string; items: NavItem[] }[];
  bottom: NavItem[];
  center: NavItem;
}) {
  const { user, t, updateUser, toast, logout } = useApp();
  const nav = useNavigate();
  const signOut = () => {
    logout();
    nav('/');
  };
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => {
    setOpen(false);
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  const all = sections.flatMap((s) => s.items);
  const allowed = all.filter((i) => can(user, i.perm));

  // Permission de la page courante : entrée de menu au préfixe le plus long
  const current = [...all]
    .filter((i) => (i.end ? loc.pathname === i.to || loc.pathname === `${i.to}/` : loc.pathname.startsWith(i.to)))
    .sort((a, b) => b.to.length - a.to.length)[0];
  const denied = current && !can(user, current.perm);

  if (!allowed.length)
    return (
      <main id="contenu" tabIndex={-1} className="min-h-screen px-4 py-10 outline-none">
        <div className="mx-auto max-w-lg"><Logo /></div>
        {base === '/organisateur' && user?.role === 'participant' ? (
          <div className="mx-auto max-w-lg py-10">
            <EmptyState
              icon={<CalendarPlus className="h-5 w-5" aria-hidden />}
              title={t('Organisez votre premier événement')}
              body={t('Activez l’espace organisateur pour créer des événements, vendre des billets et scanner les entrées. C’est gratuit : Event509 prélève une commission uniquement sur les billets payants.')}
              action={
                <Button onClick={() => { updateUser({ role: 'organizer', teamRole: 'admin' }); toast(t('Espace organisateur activé')); }}>
                  {t('Activer l’espace organisateur')}
                </Button>
              }
            />
          </div>
        ) : (
          <AccessDenied />
        )}
      </main>
    );
  if (denied) return <Navigate to={allowed[0].to} replace />;

  const Nav = (
    <nav aria-label={title} className="flex flex-col gap-6">
      {sections.map((s, i) => {
        const items = s.items.filter((it) => can(user, it.perm));
        if (!items.length) return null;
        return (
          <div key={i}>
            {s.title && <div className="mb-2 px-3 text-[11px] font-bold uppercase tracking-wider text-ink-muted">{s.title}</div>}
            <ul className="flex flex-col gap-0.5">
              {items.map((it) => (
                <li key={it.to}>
                  <NavLink
                    to={it.to}
                    end={it.end}
                    className={({ isActive }) =>
                      cx('flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition', isActive ? 'bg-contrast text-on-contrast' : 'text-ink-soft hover:bg-canvas hover:text-ink')
                    }
                  >
                    <it.icon className="h-[18px] w-[18px]" aria-hidden />
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

  // Un administrateur a deux facettes dans le même espace : organisateur et administration
  const both = can(user, 'admin') && hasOrganizerAccess(user);
  const Switch = both ? (
    <div role="group" aria-label={t('Changer d’espace')} className="flex gap-1 rounded-2xl bg-canvas p-1">
      {[{ to: '/organisateur', label: t('Organisateur') }, { to: '/admin', label: t('Administration') }].map((x) => (
        <Link
          key={x.to}
          to={x.to}
          aria-current={x.to === base ? 'page' : undefined}
          className={cx('flex-1 rounded-xl px-3 py-2 text-center text-sm font-bold transition', x.to === base ? 'bg-contrast text-on-contrast' : 'text-ink-soft hover:text-ink')}
        >
          {x.label}
        </Link>
      ))}
    </div>
  ) : null;

  const roleLabel = user?.role === 'admin' ? t('Admin plateforme') : user?.teamRole ? t(teamRoleLabel[user.teamRole]) : '';
  const bottomItems = bottom.filter((i) => can(user, i.perm));

  return (
    <div className="min-h-screen pb-28 lg:pb-0 lg:pl-72">
      <SkipLink />
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-line bg-surface px-4 py-6 lg:flex">
        <div className="mb-2 px-2"><Logo to={base} /></div>
        {Switch ? <div className="mb-6">{Switch}</div> : <div className="mb-6 px-2"><Badge tone="brand">{title}</Badge></div>}
        <div className="no-scrollbar flex-1 overflow-y-auto">{Nav}</div>
        <Link to="/" className="mt-4 flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold text-ink-soft hover:bg-canvas">
          <ArrowLeft className="h-4 w-4" aria-hidden /> {t('Retour au site')}
        </Link>
        {user && (
          <Link to="/compte" className="mt-2 flex items-center gap-3 rounded-2xl bg-canvas p-3 hover:bg-line/60">
            <Avatar name={user.name} size={36} />
            <div className="min-w-0">
              <div className="truncate text-sm font-bold">{user.name}</div>
              <div className="truncate text-xs text-ink-muted">{roleLabel}</div>
            </div>
          </Link>
        )}
        <button type="button" onClick={signOut} className="mt-2 flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50">
          <LogOut className="h-4 w-4" aria-hidden /> {t('Déconnexion')}
        </button>
      </aside>

      <OfflineBanner />
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b border-line/60 bg-canvas/90 px-4 backdrop-blur lg:hidden">
        <Logo to={base} />
        <div className="flex items-center gap-2">
          {user && <NotificationsMenu />}
          <IconButton label={t('Déconnexion')} tone="soft" onClick={signOut}>
            <LogOut className="h-5 w-5 text-red-600" aria-hidden />
          </IconButton>
          <IconButton label={t('Ouvrir le menu')} onClick={() => setOpen(true)} aria-expanded={open}>
            <Menu className="h-5 w-5" aria-hidden />
          </IconButton>
        </div>
      </header>

      {open && (
        <div role="presentation" className="fixed inset-0 z-50 bg-navy/50 lg:hidden" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)} onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label={title} className="absolute inset-y-0 right-0 w-[85%] max-w-sm overflow-y-auto bg-surface p-5">
            <div className="mb-6 flex items-center justify-between gap-3">
              {Switch ? <div className="flex-1">{Switch}</div> : <Badge tone="brand">{title}</Badge>}
              <IconButton label={t('Fermer')} tone="soft" onClick={() => setOpen(false)} autoFocus>
                <X className="h-5 w-5" aria-hidden />
              </IconButton>
            </div>
            {Nav}
            <Link to="/" className="mt-6 flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold text-ink-soft">
              <ArrowLeft className="h-4 w-4" aria-hidden /> {t('Retour au site')}
            </Link>
            <button type="button" onClick={signOut} className="mt-2 flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50">
          <LogOut className="h-4 w-4" aria-hidden /> {t('Déconnexion')}
        </button>
          </div>
        </div>
      )}

      <main id="contenu" tabIndex={-1} className="mx-auto max-w-7xl px-4 py-6 outline-none sm:px-6 lg:px-10 lg:py-10">
        {user?.emailVerified === false && <VerifyBanner />}
        <ErrorBoundary resetKey={loc.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>

      <BottomNav label={title} items={bottomItems} center={can(user, center.perm) ? center : undefined} />
    </div>
  );
}

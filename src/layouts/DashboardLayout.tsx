import { useNoIndex } from '@/lib/hooks';
import { useEffect, useState } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarPlus, Download, LogOut, type LucideIcon } from 'lucide-react';
import { Logo } from '@/components/brand';
import { Avatar, Badge, Button, ButtonLink, EmptyState } from '@/components/ui';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AccessDenied } from '@/components/guards';
import { BottomNav, NotificationsMenu, OfflineBanner, SkipLink } from './PublicLayout';
import { useApp } from '@/store/app';
import { cx } from '@/lib/format';
import { DEMO, resendVerification } from '@/services/api';
import { ApkMenuLink } from '@/components/AppInstall';
import { AccountNav, AccountSheet } from '@/components/AccountSheet';
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
  useNoIndex(); // espace connecté : jamais indexé
  const { user, t, logout } = useApp();
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
                <ButtonLink to="/compte/devenir-organisateur">{t('Devenir organisateur')}</ButtonLink>
              }
            />
          </div>
        ) : (
          <AccessDenied />
        )}
      </main>
    );
  if (denied) return <Navigate to={allowed[0].to} replace />;

  const Nav = <AccountNav sections={sections} title={title} />;

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
        <Link to="/" className="mt-4 flex items-center gap-3 rounded-2xl px-2 py-1.5 text-sm font-semibold text-ink hover:bg-canvas">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-500 text-white"><ArrowLeft className="h-[18px] w-[18px]" aria-hidden /></span> {t('Retour au site')}
        </Link>
        <ApkMenuLink className="mt-1 flex items-center gap-3 rounded-2xl px-2 py-1.5 text-sm font-semibold text-ink hover:bg-canvas">
          {(label) => <><span className="grid h-9 w-9 place-items-center rounded-full bg-brand-grad text-white"><Download className="h-[18px] w-[18px]" aria-hidden /></span> {label}</>}
        </ApkMenuLink>
        {user && (
          <Link to="/compte" className="mt-2 flex items-center gap-3 rounded-2xl bg-canvas p-3 hover:bg-line/60">
            <Avatar name={user.name} src={user.avatarUrl} size={36} />
            <div className="min-w-0">
              <div className="truncate text-sm font-bold">{user.name}</div>
              <div className="truncate text-xs text-ink-muted">{roleLabel}</div>
            </div>
          </Link>
        )}
        <button type="button" onClick={signOut} className="mt-2 flex w-full items-center gap-3 rounded-2xl px-2 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-500/10">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-red-500 text-white"><LogOut className="h-[18px] w-[18px]" aria-hidden /></span> {t('Déconnexion')}
        </button>
      </aside>

      <OfflineBanner />
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b border-line/60 bg-canvas/90 px-4 backdrop-blur lg:hidden">
        <Logo to={base} />
        <div className="flex items-center gap-2">
          {user && <NotificationsMenu />}
        </div>
      </header>

      <AccountSheet open={open} onClose={() => setOpen(false)} sections={sections} base={base} title={title} />

      <main id="contenu" tabIndex={-1} className="mx-auto max-w-7xl px-4 py-6 outline-none sm:px-6 lg:px-10 lg:py-10">
        {user?.emailVerified === false && <VerifyBanner />}
        {user && user.hasGoogle === false && !DEMO && (
          <div role="status" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-ink">
            <span>{t('Associez votre compte Google pour sécuriser votre compte et vous connecter plus simplement.')}</span>
            <Link to="/compte/securite" className="font-bold text-brand-ink underline">{t('Associer Google')}</Link>
          </div>
        )}
        <ErrorBoundary resetKey={loc.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>

      <BottomNav label={title} title={title} items={bottomItems} center={can(user, center.perm) ? center : undefined} onProfile={() => setOpen(true)} />
    </div>
  );
}

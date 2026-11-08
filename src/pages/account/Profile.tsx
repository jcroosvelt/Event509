import { Link, useNavigate } from 'react-router-dom';
import { Bell, ChevronRight, Heart, LayoutDashboard, LogOut, Megaphone, Receipt, Repeat2, Settings, ShieldCheck, Ticket } from 'lucide-react';
import { useApp } from '@/store/app';
import { useTitle } from '@/lib/hooks';
import { can, hasOrganizerAccess, teamRoleLabel } from '@/lib/permissions';
import { Avatar, Badge, Card, IconBadge, StatCard, type Tone } from '@/components/ui';

export default function Profile() {
  const { user, tickets, favorites, orders, logout, t } = useApp();
  useTitle(t('Profil'));
  const nav = useNavigate();
  if (!user) return null;

  const links: { to: string; i: typeof Ticket; l: string; tone: Tone }[] = [
    { to: '/billets', i: Ticket, l: t('Mes billets'), tone: 'orange' },
    { to: '/compte/achats', i: Receipt, l: t('Historique des achats'), tone: 'brand' },
    { to: '/favoris', i: Heart, l: t('Favoris'), tone: 'red' },
    { to: '/notifications', i: Bell, l: t('Notifications'), tone: 'amber' },
    { to: '/revente', i: Repeat2, l: t('Billets en revente'), tone: 'green' },
    { to: '/ambassadeurs', i: Megaphone, l: t('Ambassadeurs'), tone: 'violet' },
    { to: '/compte/parametres', i: Settings, l: t('Paramètres'), tone: 'gray' },
  ];
  const role = user.role === 'admin' ? t('Admin plateforme') : user.role === 'organizer' ? t(teamRoleLabel[user.teamRole ?? 'admin']) : t('Participant');

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 sm:px-6 lg:pt-10">
      <Card className="flex items-center gap-4">
        <Avatar name={user.name} size={64} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-extrabold">{user.name}</h1>
          <p className="truncate text-sm text-ink-muted">{user.email}</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <Badge tone="brand">{role}</Badge>
            <Badge>{user.city}</Badge>
          </div>
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <StatCard label={t('Billets')} value={tickets.length} />
        <StatCard label={t('Favoris')} value={favorites.length} />
        <StatCard label={t('Commandes')} value={orders.length} />
      </div>

      <Card className="mt-4 p-2">
        <nav aria-label={t('Mon compte')}>
          <ul className="divide-y divide-line">
            {links.map((x) => (
              <li key={x.to}>
                <Link to={x.to} className="flex items-center gap-3 rounded-2xl px-3 py-3 hover:bg-canvas">
                  <IconBadge tone={x.tone} size="sm"><x.i className="h-4 w-4" /></IconBadge>
                  <span className="flex-1 text-sm font-semibold">{x.l}</span>
                  <ChevronRight className="h-4 w-4 text-ink-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Card>

      <Card className="mt-4 p-2">
        <ul className="divide-y divide-line">
          <li>
            <Link to="/organisateur" className="flex items-center gap-3 rounded-2xl px-3 py-3 hover:bg-canvas">
              <IconBadge tone="ink" size="sm"><LayoutDashboard className="h-4 w-4" /></IconBadge>
              <span className="flex-1 text-sm font-semibold">{hasOrganizerAccess(user) ? t('Espace organisateur') : t('Organiser un événement')}</span>
              <ChevronRight className="h-4 w-4 text-ink-muted" aria-hidden />
            </Link>
          </li>
          {can(user, 'admin') && (
            <li>
              <Link to="/admin" className="flex items-center gap-3 rounded-2xl px-3 py-3 hover:bg-canvas">
                <IconBadge tone="ink" size="sm"><ShieldCheck className="h-4 w-4" /></IconBadge>
                <span className="flex-1 text-sm font-semibold">{t('Administration')}</span>
                <ChevronRight className="h-4 w-4 text-ink-muted" aria-hidden />
              </Link>
            </li>
          )}
          <li>
            <button type="button" onClick={() => { logout(); nav('/'); }} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-red-600 hover:bg-red-50">
              <IconBadge tone="red" size="sm"><LogOut className="h-4 w-4" /></IconBadge>
              <span className="text-sm font-semibold">{t('Déconnexion')}</span>
            </button>
          </li>
        </ul>
      </Card>
    </div>
  );
}

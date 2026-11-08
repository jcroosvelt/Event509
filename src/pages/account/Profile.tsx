import { Link, useNavigate } from 'react-router-dom';
import { Bell, ChevronRight, Heart, LayoutDashboard, LogOut, Megaphone, Receipt, Settings, ShieldCheck, Ticket, User } from 'lucide-react';
import { useApp } from '@/store/app';
import { Avatar, Badge, ButtonLink, Card, EmptyState, IconBadge, StatCard } from '@/components/ui';

export default function Profile() {
  const { user, tickets, favorites, orders, logout, t } = useApp();
  const nav = useNavigate();
  if (!user)
    return (
      <div className="mx-auto max-w-xl px-4 pt-10">
        <EmptyState icon={<User className="h-5 w-5" />} title="Vous n’êtes pas connecté" action={<ButtonLink to="/connexion">{t('nav.login')}</ButtonLink>} />
      </div>
    );

  const links = [
    { to: '/billets', i: Ticket, l: t('nav.tickets'), tone: 'orange' as const },
    { to: '/compte/achats', i: Receipt, l: t('nav.orders'), tone: 'brand' as const },
    { to: '/favoris', i: Heart, l: t('nav.favorites'), tone: 'red' as const },
    { to: '/ambassadeurs', i: Megaphone, l: t('nav.ambassador'), tone: 'violet' as const },
    { to: '/compte/parametres', i: Settings, l: t('nav.settings'), tone: 'gray' as const },
    { to: '/compte/parametres#notifications', i: Bell, l: t('nav.notifications'), tone: 'amber' as const },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 sm:px-6 lg:pt-10">
      <Card className="flex items-center gap-4">
        <Avatar name={user.name} size={64} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-extrabold">{user.name}</h1>
          <p className="truncate text-sm text-ink-muted">{user.email}</p>
          <div className="mt-1.5 flex gap-2">
            <Badge tone="brand">{user.role === 'organizer' ? 'Organisateur' : user.role === 'admin' ? 'Admin' : 'Participant'}</Badge>
            <Badge>{user.city}</Badge>
          </div>
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <StatCard label="Billets" value={tickets.length} />
        <StatCard label="Favoris" value={favorites.length} />
        <StatCard label="Commandes" value={orders.length} />
      </div>

      <Card className="mt-4 divide-y divide-line p-2">
        {links.map((x) => (
          <Link key={x.l} to={x.to} className="flex items-center gap-3 rounded-2xl px-3 py-3 hover:bg-canvas">
            <IconBadge tone={x.tone} size="sm"><x.i className="h-4 w-4" /></IconBadge>
            <span className="flex-1 text-sm font-semibold">{x.l}</span>
            <ChevronRight className="h-4 w-4 text-ink-muted" />
          </Link>
        ))}
      </Card>

      <Card className="mt-4 divide-y divide-line p-2">
        <Link to="/organisateur" className="flex items-center gap-3 rounded-2xl px-3 py-3 hover:bg-canvas">
          <IconBadge tone="ink" size="sm"><LayoutDashboard className="h-4 w-4" /></IconBadge>
          <span className="flex-1 text-sm font-semibold">{t('nav.organizer')}</span>
          <ChevronRight className="h-4 w-4 text-ink-muted" />
        </Link>
        <Link to="/admin" className="flex items-center gap-3 rounded-2xl px-3 py-3 hover:bg-canvas">
          <IconBadge tone="ink" size="sm"><ShieldCheck className="h-4 w-4" /></IconBadge>
          <span className="flex-1 text-sm font-semibold">{t('nav.admin')}</span>
          <ChevronRight className="h-4 w-4 text-ink-muted" />
        </Link>
        <button onClick={() => { logout(); nav('/'); }} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-red-600 hover:bg-red-50">
          <IconBadge tone="red" size="sm"><LogOut className="h-4 w-4" /></IconBadge>
          <span className="text-sm font-semibold">{t('nav.logout')}</span>
        </button>
      </Card>
    </div>
  );
}

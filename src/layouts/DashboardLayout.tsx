import { useEffect, useState, type ComponentType } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ArrowLeft, Menu, X } from 'lucide-react';
import { Logo } from '@/components/brand';
import { Avatar, Badge } from '@/components/ui';
import { BottomNav } from './PublicLayout';
import { useApp } from '@/store/app';
import { cx } from '@/lib/format';

export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  end?: boolean;
  badge?: string;
}

/** Layout commun aux espaces organisateur et administration. */
export default function DashboardLayout({
  title, sections, bottom, center, accent,
}: {
  title: string;
  sections: { title?: string; items: NavItem[] }[];
  bottom: NavItem[];
  center: NavItem;
  accent?: string;
}) {
  const { user } = useApp();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => {
    setOpen(false);
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  const Nav = (
    <nav className="flex flex-col gap-6">
      {sections.map((s, i) => (
        <div key={i}>
          {s.title && <div className="mb-2 px-3 text-[11px] font-bold uppercase tracking-wider text-ink-muted">{s.title}</div>}
          <div className="flex flex-col gap-0.5">
            {s.items.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.end}
                className={({ isActive }) =>
                  cx('flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition', isActive ? 'bg-ink text-white' : 'text-ink-soft hover:bg-canvas hover:text-ink')
                }
              >
                <it.icon className="h-[18px] w-[18px]" />
                <span className="flex-1">{it.label}</span>
                {it.badge && <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-white">{it.badge}</span>}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen pb-28 lg:pb-0 lg:pl-72">
      {/* Barre latérale (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-line bg-white px-4 py-6 lg:flex">
        <div className="mb-2 flex items-center justify-between px-2">
          <Logo />
        </div>
        <div className="mb-6 px-2">
          <Badge tone="brand" className={accent}>{title}</Badge>
        </div>
        <div className="flex-1 overflow-y-auto no-scrollbar">{Nav}</div>
        <Link to="/" className="mt-4 flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold text-ink-soft hover:bg-canvas">
          <ArrowLeft className="h-4 w-4" /> Retour au site
        </Link>
        {user && (
          <div className="mt-2 flex items-center gap-3 rounded-2xl bg-canvas p-3">
            <Avatar name={user.name} size={36} />
            <div className="min-w-0">
              <div className="truncate text-sm font-bold">{user.name}</div>
              <div className="truncate text-xs text-ink-muted">{user.email}</div>
            </div>
          </div>
        )}
      </aside>

      {/* En-tête mobile */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line/60 bg-canvas/90 px-4 backdrop-blur lg:hidden">
        <Logo />
        <button onClick={() => setOpen(true)} aria-label="Ouvrir le menu" className="grid h-11 w-11 place-items-center rounded-full border border-line bg-white">
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 bg-ink/40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-y-0 right-0 w-[85%] max-w-sm overflow-y-auto bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between">
              <Badge tone="brand">{title}</Badge>
              <button onClick={() => setOpen(false)} aria-label="Fermer" className="grid h-10 w-10 place-items-center rounded-full bg-canvas">
                <X className="h-5 w-5" />
              </button>
            </div>
            {Nav}
            <Link to="/" className="mt-6 flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold text-ink-soft">
              <ArrowLeft className="h-4 w-4" /> Retour au site
            </Link>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <Outlet />
      </main>

      <BottomNav items={bottom} center={center} />
    </div>
  );
}

import { Link } from 'react-router-dom';
import { cx } from '@/lib/format';

export function Logo({ className, to = '/', compact }: { className?: string; to?: string; compact?: boolean }) {
  return (
    <Link to={to} className={cx('flex items-center gap-2', className)} aria-label="Event509 — accueil">
      <img src="/logo-mark.png" alt="" className="h-8 w-auto" />
      {!compact && (
        <span className="text-[1.35rem] font-extrabold leading-none tracking-tight text-ink">
          Event<span className="text-brand">509</span>
        </span>
      )}
    </Link>
  );
}

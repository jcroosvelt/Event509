import { Link } from 'react-router-dom';
import { cx } from '@/lib/format';
import { useApp } from '@/store/app';

export function Logo({ className, to = '/', compact }: { className?: string; to?: string; compact?: boolean }) {
  const { t } = useApp();
  return (
    <Link to={to} className={cx('flex items-center gap-2', className)} aria-label={t('Event509 — accueil')}>
      <img src="/logo-mark.png" alt="" width={27} height={32} className="h-8 w-auto dark:brightness-[1.8] dark:contrast-75" />
      {!compact && (
        <span aria-hidden className="text-[1.35rem] font-extrabold leading-none tracking-tight text-ink">
          Event<span className="text-brand-ink">509</span>
        </span>
      )}
    </Link>
  );
}

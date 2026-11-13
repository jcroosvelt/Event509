import { useApp } from '@/store/app';
import { cx } from '@/lib/format';

/**
 * Coche bleue officielle. Elle n'est jamais décidée par l'interface : `verified` vient du serveur, qui le calcule
 * à partir de l'état réel (demande approuvée, abonnement actif, certification valable).
 */
export function VerifiedBadge({ className, size = 18 }: { className?: string; size?: number }) {
  const { t } = useApp();
  const label = t('Organisateur dont l’identité et les informations professionnelles ont été vérifiées par notre plateforme.');
  return (
    <span className={cx('group relative inline-flex shrink-0 align-middle', className)}>
      <span role="img" aria-label={`${t('Organisateur vérifié')} — ${label}`} className="inline-flex cursor-help">
        <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
          <path
            fill="#1F5EFF"
            d="M12 1.5l2.6 1.9 3.2-.2 1 3.1 2.6 1.9-1 3.1 1 3.1-2.6 1.9-1 3.1-3.2-.2L12 22.5l-2.6-1.9-3.2.2-1-3.1L2.6 15.8l1-3.1-1-3.1 2.6-1.9 1-3.1 3.2.2z"
          />
          <path d="M7.6 12.3l3 3 5.8-6" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-full z-40 mt-2 hidden w-60 -translate-x-1/2 rounded-xl bg-contrast px-3 py-2 text-xs font-medium leading-snug text-on-contrast shadow-card group-hover:block"
      >
        {label}
      </span>
    </span>
  );
}

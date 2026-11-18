import { Store, Ticket } from 'lucide-react';
import { useApp } from '@/store/app';
import { cx } from '@/lib/format';

export type AccountType = 'buyer' | 'organizer';

/** Choix du type de compte à l'inscription : acheteur (par défaut) ou organisateur. */
export function AccountTypePicker({ value, onChange }: { value: AccountType; onChange: (v: AccountType) => void }) {
  const { t } = useApp();
  const options: { v: AccountType; icon: typeof Ticket; title: string; body: string }[] = [
    { v: 'buyer', icon: Ticket, title: t('J’achète des billets'), body: t('Compte acheteur : vos billets, commandes et favoris au même endroit.') },
    { v: 'organizer', icon: Store, title: t('J’organise des événements'), body: t('Compte organisateur : billetterie, contrôle d’entrée et versements.') },
  ];
  return (
    <fieldset>
      <legend className="mb-2 block text-sm font-semibold">{t('Type de compte')}</legend>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t('Type de compte')}>
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={value === o.v}
            onClick={() => onChange(o.v)}
            className={cx('flex items-start gap-3 rounded-2xl border p-3 text-left transition', value === o.v ? 'border-brand bg-brand-50 ring-1 ring-brand' : 'border-line bg-surface hover:bg-canvas')}
          >
            <o.icon className={cx('mt-0.5 h-5 w-5 shrink-0', value === o.v ? 'text-brand-ink' : 'text-ink-muted')} aria-hidden />
            <span className="min-w-0">
              <span className="block text-sm font-bold">{o.title}</span>
              <span className="block text-xs text-ink-soft">{o.body}</span>
            </span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

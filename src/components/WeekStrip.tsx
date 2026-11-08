import { useMemo } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useApp } from '@/store/app';
import { cx } from '@/lib/format';
import { Card } from './ui';

/** Bandeau semaine avec jour sélectionné en pilule (repris de la maquette). */
export function WeekStrip({
  selected, onSelect, weekStart, onWeekChange, marked = [],
}: {
  selected: Date;
  onSelect: (d: Date) => void;
  weekStart: Date;
  onWeekChange: (d: Date) => void;
  marked?: string[]; // dates ISO yyyy-mm-dd qui ont des événements
}) {
  const { lang, t } = useApp();
  const loc = lang === 'en' ? 'en-US' : 'fr-FR';
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i)),
    [weekStart],
  );
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const shift = (n: number) => onWeekChange(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + n * 7));
  const title = weekStart.toLocaleDateString(loc, { month: 'long', year: 'numeric' });

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold capitalize text-ink" aria-live="polite">{title}</h2>
        <div className="flex gap-2">
          <button onClick={() => shift(-1)} aria-label={t('Semaine précédente')} className="grid h-8 w-8 place-items-center rounded-full bg-canvas text-ink-soft hover:text-ink">
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </button>
          <button onClick={() => shift(1)} aria-label={t('Semaine suivante')} className="grid h-8 w-8 place-items-center rounded-full bg-canvas text-ink-soft hover:text-ink">
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const active = key(d) === key(selected);
          const has = marked.includes(key(d));
          return (
            <button
              key={key(d)}
              type="button"
              aria-pressed={active}
              aria-label={`${d.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' })}${has ? ` — ${t('événements prévus')}` : ''}`}
              onClick={() => onSelect(d)}
              className={cx(
                'relative flex flex-col items-center gap-2 rounded-full py-3 transition',
                active ? 'bg-brand-100 text-ink' : 'text-ink-soft hover:bg-canvas',
              )}
            >
              <span aria-hidden className="text-xs uppercase">{d.toLocaleDateString(loc, { weekday: 'narrow' })}</span>
              <span className={cx('text-sm font-semibold', active && 'font-extrabold text-ink')}>{String(d.getDate()).padStart(2, '0')}</span>
              <span className={cx('h-1.5 w-1.5 rounded-full', has ? (active ? 'bg-brand' : 'bg-brand-300') : 'bg-transparent')} />
            </button>
          );
        })}
      </div>
    </Card>
  );
}

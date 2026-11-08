import { rowLetter } from '@/services/api';
import { useApp } from '@/store/app';
import { cx } from '@/lib/format';
import type { SeatMapConfig, TicketType } from '@/types';

const zoneColors = ['bg-violet-200 hover:bg-violet-300', 'bg-brand-100 hover:bg-brand-200', 'bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-500/25', 'bg-amber-100 hover:bg-amber-200'];

/**
 * Plan de salle : rangs, allée, scène en haut et zones tarifaires.
 * Seules les places de la zone du billet en cours de sélection (`activeTicketId`) sont cliquables.
 */
export function SeatMap({
  config, tickets, taken, selected, activeTicketId, max, onChange, editable, onToggleBlocked,
}: {
  config: SeatMapConfig;
  tickets: TicketType[];
  taken: Set<string>;
  selected: string[];
  activeTicketId?: string;
  max: number;
  onChange?: (s: string[]) => void;
  /** Mode éditeur (organisateur) : un clic neutralise / libère une place. */
  editable?: boolean;
  onToggleBlocked?: (seat: string) => void;
}) {
  const { t } = useApp();
  const zoneOfRow = (r: number) => config.zones.findIndex((z) => r >= z.fromRow && r <= z.toRow);
  const activeZone = config.zones.find((z) => z.ticketTypeId === activeTicketId);

  const toggle = (id: string, row: number) => {
    if (editable) return onToggleBlocked?.(id);
    if (taken.has(id) || !onChange) return;
    if (activeZone && (row < activeZone.fromRow || row > activeZone.toRow)) return;
    if (selected.includes(id)) onChange(selected.filter((s) => s !== id));
    else if (selected.length < max) onChange([...selected, id]);
    else onChange([...selected.slice(1), id]);
  };

  return (
    <div>
      <div aria-hidden className="mx-auto mb-6 h-10 max-w-md rounded-b-[50%] bg-gradient-to-b from-navy to-navy/70 pt-2 text-center text-xs font-bold uppercase tracking-[0.3em] text-white">
        {t('Scène')}
      </div>
      <div className="overflow-x-auto pb-2">
        <div className="mx-auto w-max space-y-1.5" role="group" aria-label={t('Plan de salle')}>
          {Array.from({ length: config.rows }, (_, ri) => {
            const r = rowLetter(ri);
            const zi = zoneOfRow(ri);
            const inActive = !activeZone || (ri >= activeZone.fromRow && ri <= activeZone.toRow);
            return (
              <div key={r} role="group" aria-label={t('Rang {r}', { r })} className={cx('flex items-center gap-1.5 transition', !inActive && !editable && 'opacity-35')}>
                <span aria-hidden className="w-5 text-center text-[11px] font-bold text-ink-muted">{r}</span>
                {Array.from({ length: config.cols }, (_, i) => {
                  const id = `${r}-${i + 1}`;
                  const blocked = config.blocked.includes(id);
                  const isTaken = taken.has(id);
                  const isSel = selected.includes(id);
                  const zoneName = zi >= 0 ? tickets.find((x) => x.id === config.zones[zi].ticketTypeId)?.name : undefined;
                  const disabled = !editable && (isTaken || !inActive);
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={disabled}
                      onClick={() => toggle(id, ri)}
                      aria-label={`${t('Rang {r}, place {n}', { r, n: i + 1 })}${zoneName ? ` — ${zoneName}` : ''}${blocked ? ` (${t('neutralisée')})` : isTaken ? ` (${t('occupée')})` : ''}`}
                      aria-pressed={editable ? blocked : isSel}
                      className={cx(
                        'h-6 w-6 rounded-b-sm rounded-t-lg text-[9px] font-bold transition sm:h-7 sm:w-7',
                        config.aisleAfter > 0 && i === config.aisleAfter && 'ml-4',
                        editable
                          ? blocked ? 'hatch ring-1 ring-red-400' : zi >= 0 ? zoneColors[zi % zoneColors.length] : 'bg-canvas ring-1 ring-line'
                          : isTaken ? 'hatch cursor-not-allowed' : isSel ? 'bg-brand text-white' : zi >= 0 ? zoneColors[zi % zoneColors.length] : 'bg-canvas',
                      )}
                    >
                      {isSel ? i + 1 : ''}
                    </button>
                  );
                })}
                <span aria-hidden className="w-5 text-center text-[11px] font-bold text-ink-muted">{r}</span>
              </div>
            );
          })}
        </div>
      </div>
      <ul className="mt-4 flex flex-wrap justify-center gap-4 text-xs text-ink-soft">
        {config.zones.map((z, i) => (
          <li key={z.ticketTypeId + i} className="flex items-center gap-1.5">
            <span className={cx('h-3 w-3 rounded', zoneColors[i % zoneColors.length].split(' ')[0])} />
            {tickets.find((x) => x.id === z.ticketTypeId)?.name ?? '—'} ({rowLetter(z.fromRow)}–{rowLetter(z.toRow)})
          </li>
        ))}
        {!editable && <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-brand" /> {t('Votre choix')}</li>}
        <li className="flex items-center gap-1.5"><span className="hatch h-3 w-3 rounded" /> {editable ? t('Neutralisée') : t('Occupée')}</li>
      </ul>
    </div>
  );
}

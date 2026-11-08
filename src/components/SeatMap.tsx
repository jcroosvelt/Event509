import { cx } from '@/lib/format';

const ROWS = 'ABCDEFGHIJ'.split('');
const COLS = 16;

/** Plan de salle : places numérotées, allée centrale, scène en haut. */
export function SeatMap({
  taken, selected, max, onChange,
}: { taken: Set<string>; selected: string[]; max: number; onChange: (s: string[]) => void }) {
  const toggle = (id: string) => {
    if (taken.has(id)) return;
    if (selected.includes(id)) onChange(selected.filter((s) => s !== id));
    else if (selected.length < max) onChange([...selected, id]);
    else onChange([...selected.slice(1), id]);
  };
  return (
    <div>
      <div className="mx-auto mb-6 h-10 max-w-md rounded-b-[50%] bg-gradient-to-b from-ink to-ink/70 pt-2 text-center text-xs font-bold uppercase tracking-[0.3em] text-white">Scène</div>
      <div className="overflow-x-auto pb-2">
        <div className="mx-auto w-max space-y-1.5">
          {ROWS.map((r) => (
            <div key={r} className="flex items-center gap-1.5">
              <span className="w-4 text-center text-[11px] font-bold text-ink-muted">{r}</span>
              {Array.from({ length: COLS }, (_, i) => {
                const id = `${r}-${i + 1}`;
                const isTaken = taken.has(id);
                const isSel = selected.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={isTaken}
                    onClick={() => toggle(id)}
                    aria-label={`Rang ${r}, place ${i + 1}${isTaken ? ', occupée' : ''}`}
                    aria-pressed={isSel}
                    className={cx(
                      'h-6 w-6 rounded-t-lg rounded-b-sm text-[9px] font-bold transition sm:h-7 sm:w-7',
                      i === COLS / 2 && 'ml-4',
                      isTaken ? 'hatch cursor-not-allowed' : isSel ? 'bg-brand text-white' : r < 'D' ? 'bg-violet-200 hover:bg-violet-300' : 'bg-brand-100 hover:bg-brand-200',
                    )}
                  >
                    {isSel ? i + 1 : ''}
                  </button>
                );
              })}
              <span className="w-4 text-center text-[11px] font-bold text-ink-muted">{r}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-4 text-xs text-ink-soft">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-brand-100" /> Disponible</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-violet-200" /> Premiers rangs</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-brand" /> Votre choix</span>
        <span className="flex items-center gap-1.5"><span className="hatch h-3 w-3 rounded" /> Occupée</span>
      </div>
    </div>
  );
}

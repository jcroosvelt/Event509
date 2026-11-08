import {
  createContext, useContext, useEffect, useId, useRef,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type KeyboardEvent, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';
import { Link } from 'react-router-dom';
import { Loader2, X } from 'lucide-react';
import { cx } from '@/lib/format';
import { useApp } from '@/store/app';

// ---------------- Boutons ----------------

type BtnVariant = 'primary' | 'dark' | 'soft' | 'ghost' | 'outline' | 'danger';
const btnBase =
  'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none';
const btnVariants: Record<BtnVariant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-dark dark:hover:bg-brand/90',
  dark: 'bg-contrast text-on-contrast hover:opacity-90',
  soft: 'bg-brand-100 text-brand-dark hover:bg-brand-200',
  ghost: 'text-ink hover:bg-ink/5',
  outline: 'border border-line bg-surface text-ink hover:border-ink/20',
  danger: 'bg-red-50 text-red-700 hover:bg-red-100',
};
const btnSizes = { sm: 'h-9 px-4 text-sm', md: 'h-11 px-5 text-sm', lg: 'h-14 px-7 text-base' };

export function Button({
  variant = 'primary', size = 'md', loading, className, children, type = 'button', ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: keyof typeof btnSizes; loading?: boolean }) {
  return (
    <button type={type} className={cx(btnBase, btnVariants[variant], btnSizes[size], className)} disabled={loading || p.disabled} aria-busy={loading || undefined} {...p}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function ButtonLink({
  to, variant = 'primary', size = 'md', className, children,
}: { to: string; variant?: BtnVariant; size?: keyof typeof btnSizes; className?: string; children: ReactNode }) {
  return (
    <Link to={to} className={cx(btnBase, btnVariants[variant], btnSizes[size], className)}>
      {children}
    </Link>
  );
}

/** Bouton rond (style « cercle » de la maquette). Toujours un libellé accessible. */
export function IconButton({
  className, label, children, tone = 'white', ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tone?: 'white' | 'soft' | 'dark' | 'brand' }) {
  const tones = {
    white: 'bg-surface border border-line text-ink hover:border-ink/20',
    soft: 'bg-canvas text-ink hover:bg-line',
    dark: 'bg-contrast text-on-contrast',
    brand: 'bg-brand text-white hover:bg-brand-dark',
  };
  return (
    <button type="button" aria-label={label} title={label} className={cx('relative grid h-11 w-11 shrink-0 place-items-center rounded-full transition active:scale-95', tones[tone], className)} {...p}>
      {children}
    </button>
  );
}

// ---------------- Surfaces ----------------

export function Card({ className, children, as: As = 'div', ...p }: { className?: string; children: ReactNode; as?: 'div' | 'section' | 'article' } & React.HTMLAttributes<HTMLElement>) {
  return (
    <As className={cx('rounded-3xl bg-surface p-5 shadow-card', className)} {...p}>
      {children}
    </As>
  );
}

export type Tone = 'brand' | 'orange' | 'green' | 'red' | 'violet' | 'ink' | 'gray' | 'amber';
const toneBg: Record<Tone, string> = {
  brand: 'bg-brand-50 text-brand-ink',
  orange: 'bg-orange-50 text-orange-700',
  green: 'bg-emerald-50 text-emerald-700',
  red: 'bg-rose-50 text-rose-700',
  violet: 'bg-violet-50 text-violet-600',
  amber: 'bg-amber-50 text-amber-700',
  ink: 'bg-contrast text-on-contrast',
  gray: 'bg-canvas text-ink-soft',
};

/** Pastille ronde pour icône — reprend les badges colorés de la maquette. */
export function IconBadge({ children, tone = 'brand', size = 'md', className }: { children: ReactNode; tone?: Tone; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const s = { sm: 'h-8 w-8', md: 'h-10 w-10', lg: 'h-12 w-12' }[size];
  return <span aria-hidden className={cx('grid shrink-0 place-items-center rounded-full', s, toneBg[tone], className)}>{children}</span>;
}

export function Badge({ children, tone = 'gray', className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold', toneBg[tone], className)}>{children}</span>;
}

export function SectionHeader({ title, action, className, id }: { title: ReactNode; action?: ReactNode; className?: string; id?: string }) {
  return (
    <div className={cx('mb-3 flex items-center justify-between gap-3', className)}>
      <h2 id={id} className="text-lg font-bold tracking-tight text-ink">{title}</h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Carte statistique — libellé, icône ronde, grand chiffre + unité. */
export function StatCard({
  label, value, unit, icon, tone = 'brand', hint, className,
}: { label: ReactNode; value: ReactNode; unit?: ReactNode; icon?: ReactNode; tone?: Tone; hint?: ReactNode; className?: string }) {
  return (
    <Card className={cx('flex flex-col justify-between gap-4', className)}>
      <div className="flex items-start justify-between gap-3">
        <span className="max-w-[10rem] text-sm font-medium leading-snug text-ink-soft">{label}</span>
        {icon && <IconBadge tone={tone}>{icon}</IconBadge>}
      </div>
      <div>
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-[1.75rem] font-extrabold leading-none tracking-tight text-ink">{value}</span>
          {unit && <span className="text-sm text-ink-muted">{unit}</span>}
        </div>
        {hint && <div className="mt-1.5 text-xs text-ink-muted">{hint}</div>}
      </div>
    </Card>
  );
}

// ---------------- Formulaires ----------------
// <Field> fournit l'id, le message d'aide et l'erreur aux contrôles qu'il contient
// (htmlFor/id, aria-describedby, aria-invalid) — aucun câblage manuel nécessaire.

interface FieldCtx { id: string; describedBy?: string; invalid: boolean; required?: boolean }
const FieldContext = createContext<FieldCtx | null>(null);

function useFieldProps(p: { id?: string; 'aria-describedby'?: string; required?: boolean }) {
  const f = useContext(FieldContext);
  if (!f) return {};
  return {
    id: p.id ?? f.id,
    'aria-describedby': [p['aria-describedby'], f.describedBy].filter(Boolean).join(' ') || undefined,
    'aria-invalid': f.invalid || undefined,
    required: p.required ?? f.required,
  };
}

export function Field({
  label, hint, error, children, className, required,
}: { label?: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; className?: string; required?: boolean }) {
  const id = useId();
  const msgId = `${id}-msg`;
  const hasMsg = !!(error || hint);
  return (
    <FieldContext.Provider value={{ id, describedBy: hasMsg ? msgId : undefined, invalid: !!error, required }}>
      <div className={className}>
        {label && (
          <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">
            {label}
            {required && <span aria-hidden className="text-red-600"> *</span>}
          </label>
        )}
        {children}
        {error ? (
          <p id={msgId} role="alert" className="mt-1.5 text-xs font-medium text-red-600">{error}</p>
        ) : hint ? (
          <p id={msgId} className="mt-1.5 text-xs text-ink-muted">{hint}</p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

const inputCls =
  'w-full rounded-2xl border border-line bg-surface px-4 text-sm text-ink placeholder:text-ink-muted outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15 disabled:bg-canvas disabled:text-ink-muted aria-[invalid=true]:border-red-500';

type ElRef = (el: HTMLElement | null) => void;

export function Input({ className, icon, inputRef, ...p }: InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode; inputRef?: ElRef }) {
  const f = useFieldProps(p);
  if (icon)
    return (
      <div className="relative">
        <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted">{icon}</span>
        <input ref={inputRef} className={cx(inputCls, 'h-12 pl-11', className)} {...p} {...f} />
      </div>
    );
  return <input ref={inputRef} className={cx(inputCls, 'h-12', className)} {...p} {...f} />;
}

export function Textarea({ className, inputRef, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement> & { inputRef?: ElRef }) {
  const f = useFieldProps(p);
  return <textarea ref={inputRef} className={cx(inputCls, 'min-h-[120px] py-3', className)} {...p} {...f} />;
}

export function Select({ className, children, inputRef, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { inputRef?: ElRef }) {
  const f = useFieldProps(p);
  return (
    <select
      ref={inputRef}
      className={cx(inputCls, 'h-12 cursor-pointer appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%2712%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%238A93AB%27 stroke-width=%272.5%27%3E%3Cpath d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E")] bg-[right_1rem_center] bg-no-repeat pr-10', className)}
      {...p}
      {...f}
    >
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  const sw = (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-describedby={description ? `${id}-d` : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx('relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50', checked ? 'bg-brand' : 'bg-line')}
    >
      <span className={cx('absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-6' : 'left-1')} />
    </button>
  );
  if (!label && !description) return sw;
  return (
    <div className="flex items-center justify-between gap-4">
      <span>
        {label && <label htmlFor={id} className="block cursor-pointer text-sm font-semibold text-ink">{label}</label>}
        {description && <span id={`${id}-d`} className="block text-xs text-ink-muted">{description}</span>}
      </span>
      {sw}
    </div>
  );
}

/** Choix exclusif en pilules — groupe radio navigable aux flèches. */
export function Segmented<T extends string>({
  value, onChange, options, className, size = 'md', label,
}: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string; size?: 'sm' | 'md'; label?: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = (i + d + options.length) % options.length;
    onChange(options[n].value);
    refs.current[n]?.focus();
  };
  return (
    <div className={cx('inline-flex max-w-full overflow-x-auto rounded-full bg-canvas p-1 no-scrollbar', className)} role="radiogroup" aria-label={label}>
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => (refs.current[i] = el)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          tabIndex={value === o.value ? 0 : -1}
          onKeyDown={(e) => onKey(e, i)}
          onClick={() => onChange(o.value)}
          className={cx(
            'whitespace-nowrap rounded-full font-semibold transition',
            size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
            value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold transition',
        active ? 'bg-contrast text-on-contrast' : 'bg-surface text-ink shadow-card hover:bg-brand-50',
      )}
    >
      {children}
    </button>
  );
}

// ---------------- Données ----------------

/** Anneau de progression (inspiré de « 6 days » de la maquette). */
export function ProgressRing({
  value, size = 92, stroke = 10, children, track = 'rgb(var(--surface))', color = 'rgb(var(--brand))', label,
}: { value: number; size?: number; stroke?: number; children?: ReactNode; track?: string; color?: string; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label ?? `${Math.round(v * 100)} %`}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} className="transition-[stroke-dashoffset] duration-700" />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center" aria-hidden>{children}</div>
    </div>
  );
}

export function ProgressBar({ value, className, tone = 'brand', label }: { value: number; className?: string; tone?: 'brand' | 'ink' | 'green' | 'red'; label?: string }) {
  const c = { brand: 'bg-brand', ink: 'bg-contrast', green: 'bg-emerald-500', red: 'bg-rose-500' }[tone];
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className={cx('h-2 overflow-hidden rounded-full bg-canvas', className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cx('h-full rounded-full transition-all duration-700', c)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * Histogramme style maquette : piste hachurée (objectif) en fond, barre pleine devant,
 * pourcentage au-dessus, barre active mise en avant.
 */
export function BarChart({
  data, height = 200, activeIndex, onSelect, format, label,
}: {
  data: { label: string; value: number; max: number }[];
  height?: number;
  activeIndex?: number;
  onSelect?: (i: number) => void;
  format?: (pct: number, v: number) => string;
  label: string;
}) {
  const top = Math.max(1, ...data.map((d) => Math.max(d.value, d.max)));
  return (
    <div className="flex items-end justify-between gap-1.5 sm:gap-2" style={{ height: height + 48 }} role="group" aria-label={label}>
      {data.map((d, i) => {
        const pct = d.max ? d.value / d.max : 0;
        const active = i === activeIndex;
        const text = format ? format(pct, d.value) : `${Math.round(pct * 100)}%`;
        return (
          <button
            key={d.label}
            type="button"
            onClick={() => onSelect?.(i)}
            aria-pressed={active}
            aria-label={`${d.label} : ${text}`}
            className="group flex min-w-0 flex-1 flex-col items-center gap-2 rounded-xl"
          >
            <span className={cx('text-[11px] font-semibold sm:text-xs', active ? 'text-ink' : 'text-ink-muted')}>{text}</span>
            <div className="relative flex w-full max-w-[44px] items-end justify-center gap-1" style={{ height }}>
              <div className="hatch w-1/2 rounded-full" style={{ height: `${(d.max / top) * 100}%` }} />
              <div className={cx('w-1/2 rounded-full transition-all duration-700', active ? 'bg-brand' : 'bg-brand-200 group-hover:bg-brand-300')} style={{ height: `${Math.max(4, (d.value / top) * 100)}%` }} />
            </div>
            <span className={cx('truncate text-xs', active ? 'font-bold text-ink' : 'text-ink-muted')}>{d.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Mini barres (comme la carte « Exercise » de la maquette). */
export function SparkBars({ values, className, color = 'bg-emerald-500' }: { values: number[]; className?: string; color?: string }) {
  const m = Math.max(...values, 1);
  return (
    <div className={cx('flex h-10 items-end gap-[3px]', className)} aria-hidden>
      {values.map((v, i) => (
        <span key={i} className={cx('w-[4px] rounded-full', color, i % 3 === 1 && 'opacity-50')} style={{ height: `${Math.max(12, (v / m) * 100)}%` }} />
      ))}
    </div>
  );
}

/** Ligne de tendance (carte « BPM »). */
export function SparkLine({ values, className, stroke = 'rgb(var(--brand))' }: { values: number[]; className?: string; stroke?: string }) {
  const w = 160, h = 40, m = Math.max(...values), n = Math.min(...values);
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${h - ((v - n) / (m - n || 1)) * (h - 6) - 3}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cx('h-10 w-full', className)} preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Avatar({ name, src, size = 40, className }: { name: string; src?: string; size?: number; className?: string }) {
  const ini = name.length <= 3 ? name : name.split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  // Fonds assez foncés pour des initiales blanches lisibles (≥ 4,5:1)
  const hues = ['#1A4FD6', '#0B1533', '#6342E0', '#0B7259', '#B8325A', '#94570A'];
  const bg = hues[name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % hues.length];
  return src ? (
    <img src={src} alt="" className={cx('shrink-0 rounded-full object-cover', className)} style={{ width: size, height: size }} />
  ) : (
    <span aria-hidden className={cx('grid shrink-0 place-items-center rounded-full font-bold text-white', className)} style={{ width: size, height: size, background: bg, fontSize: size * 0.36 }}>
      {ini}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 aria-hidden className={cx('h-6 w-6 animate-spin text-brand-ink', className)} />;
}

export function Loading({ label }: { label?: string }) {
  const { t } = useApp();
  return (
    <div className="grid place-items-center py-20 text-sm text-ink-muted" role="status">
      <Spinner />
      <span className="mt-3">{label ?? t('Chargement…')}</span>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx('animate-pulse rounded-3xl bg-surface/70', className)} />;
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center px-6 py-14 text-center">
      <IconBadge size="lg" tone="brand">{icon}</IconBadge>
      <h2 className="mt-4 text-base font-bold text-ink">{title}</h2>
      {body && <p className="mt-1 max-w-sm text-sm text-ink-soft">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </Card>
  );
}

// ---------------- Fenêtres ----------------

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Fenêtre modale : focus piégé, Échap pour fermer, focus rendu à l'ouvreur. */
export function Modal({
  open, onClose, title, children, footer, size = 'md', description,
}: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg'; description?: ReactNode }) {
  const { t } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const node = ref.current!;
    // Focus initial : premier champ, sinon la fenêtre elle-même
    const first = node.querySelector<HTMLElement>('input,select,textarea') ?? node;
    first.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
      if (e.key !== 'Tab') return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
      if (!items.length) return;
      const a = items[0], b = items[items.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus(); }
      else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  const w = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' }[size];
  return (
    <div role="presentation" className="fixed inset-0 z-50 flex items-end justify-center bg-navy/50 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cx('flex max-h-[92vh] w-full flex-col rounded-t-4xl bg-surface shadow-2xl outline-none sm:rounded-4xl', w, 'animate-[sheet_.25s_ease-out]')}
      >
        <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-6">
          <div>
            <h2 id={titleId} className="text-lg font-bold text-ink">{title}</h2>
            {description && <p id={descId} className="mt-1 text-sm text-ink-soft">{description}</p>}
          </div>
          <IconButton label={t('Fermer')} tone="soft" onClick={onClose} className="h-9 w-9">
            <X className="h-4 w-4" aria-hidden />
          </IconButton>
        </div>
        <div className="overflow-y-auto px-6 pb-6 pt-2">{children}</div>
        {footer && <div className="pb-safe flex gap-2 border-t border-line px-6 pt-4 sm:pb-4">{footer}</div>}
      </div>
    </div>
  );
}

/** Pile de messages courts (toasts), annoncés aux lecteurs d'écran. */
export function Toaster() {
  const { toasts, dismissToast, t } = useApp();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4" aria-live="polite" aria-relevant="additions">
      {toasts.map((x) => (
        <div
          key={x.id}
          role={x.kind === 'error' ? 'alert' : 'status'}
          className={cx(
            'pointer-events-auto flex max-w-md animate-[toast_.25s_ease-out] items-center gap-3 rounded-2xl py-3 pl-4 pr-2 text-sm font-semibold shadow-card',
            x.kind === 'error' ? 'bg-red-600 text-white' : x.kind === 'info' ? 'bg-surface text-ink ring-1 ring-line' : 'bg-contrast text-on-contrast',
          )}
        >
          <span className="flex-1">{x.msg}</span>
          {x.action && (
            <button type="button" className="rounded-full px-3 py-1 underline-offset-2 hover:underline" onClick={() => { x.action!.run(); dismissToast(x.id); }}>
              {x.action.label}
            </button>
          )}
          <button type="button" aria-label={t('Fermer')} className="grid h-7 w-7 place-items-center rounded-full opacity-70 hover:opacity-100" onClick={() => dismissToast(x.id)}>
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------- Tableaux ----------------

export function Table({ head, children, className, caption }: { head: ReactNode[]; children: ReactNode; className?: string; caption?: string }) {
  return (
    // Zone défilante focalisable au clavier (flèches gauche/droite sur petits écrans)
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
    <div className={cx('-mx-5 overflow-x-auto px-5', className)} tabIndex={0} role="region" aria-label={caption}>
      <table className="w-full min-w-[640px] text-left text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
            {head.map((h, i) => (
              <th key={i} scope="col" className="whitespace-nowrap px-4 py-3 font-semibold first:pl-0 last:pr-0">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cx('whitespace-nowrap px-4 py-3.5 text-ink first:pl-0 last:pr-0', className)}>{children}</td>;
}

/** Pagination simple pour les tableaux. */
export function Pager({ page, pages, total, onChange }: { page: number; pages: number; total: number; onChange: (p: number) => void }) {
  const { t } = useApp();
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-ink-soft">
      <span>{t('{n} résultats', { n: total })}{pages > 1 && ` · ${t('page {p} sur {n}', { p: page + 1, n: pages })}`}</span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={page === 0} onClick={() => onChange(page - 1)}>{t('Précédent')}</Button>
        <Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => onChange(page + 1)}>{t('Suivant')}</Button>
      </div>
    </div>
  );
}

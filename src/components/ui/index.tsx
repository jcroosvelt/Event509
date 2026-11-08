import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, X } from 'lucide-react';
import { cx } from '@/lib/format';

// ---------------- Boutons ----------------

type BtnVariant = 'primary' | 'dark' | 'soft' | 'ghost' | 'outline' | 'danger';
const btnBase =
  'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand';
const btnVariants: Record<BtnVariant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-dark',
  dark: 'bg-ink text-white hover:bg-ink/90',
  soft: 'bg-brand-100 text-brand-dark hover:bg-brand-200',
  ghost: 'text-ink hover:bg-ink/5',
  outline: 'border border-line bg-white text-ink hover:border-ink/20',
  danger: 'bg-red-50 text-red-600 hover:bg-red-100',
};
const btnSizes = { sm: 'h-9 px-4 text-sm', md: 'h-11 px-5 text-sm', lg: 'h-14 px-7 text-base' };

export function Button({
  variant = 'primary', size = 'md', loading, className, children, ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: keyof typeof btnSizes; loading?: boolean }) {
  return (
    <button className={cx(btnBase, btnVariants[variant], btnSizes[size], className)} disabled={loading || p.disabled} {...p}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
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

/** Bouton rond (style « cercle » de la maquette : calendrier, cloche, +). */
export function IconButton({
  className, label, children, tone = 'white', ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tone?: 'white' | 'soft' | 'dark' | 'brand' }) {
  const tones = {
    white: 'bg-white border border-line text-ink hover:border-ink/20',
    soft: 'bg-canvas text-ink hover:bg-line',
    dark: 'bg-ink text-white',
    brand: 'bg-brand text-white hover:bg-brand-dark',
  };
  return (
    <button aria-label={label} title={label} className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-full transition active:scale-95', tones[tone], className)} {...p}>
      {children}
    </button>
  );
}

// ---------------- Surfaces ----------------

export function Card({ className, children, as: As = 'div', ...p }: { className?: string; children: ReactNode; as?: 'div' | 'section' | 'article' } & React.HTMLAttributes<HTMLElement>) {
  return (
    <As className={cx('rounded-3xl bg-white p-5 shadow-card', className)} {...p}>
      {children}
    </As>
  );
}

/** Pastille ronde pour icône — reprend les badges colorés de la maquette. */
export function IconBadge({ children, tone = 'brand', size = 'md', className }: { children: ReactNode; tone?: Tone; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const s = { sm: 'h-8 w-8', md: 'h-10 w-10', lg: 'h-12 w-12' }[size];
  return <span className={cx('grid shrink-0 place-items-center rounded-full', s, toneBg[tone], className)}>{children}</span>;
}

type Tone = 'brand' | 'orange' | 'green' | 'red' | 'violet' | 'ink' | 'gray' | 'amber';
const toneBg: Record<Tone, string> = {
  brand: 'bg-brand-50 text-brand',
  orange: 'bg-orange-50 text-orange-500',
  green: 'bg-emerald-50 text-emerald-600',
  red: 'bg-rose-50 text-rose-500',
  violet: 'bg-violet-50 text-violet-600',
  amber: 'bg-amber-50 text-amber-600',
  ink: 'bg-ink text-white',
  gray: 'bg-canvas text-ink-soft',
};

export function Badge({ children, tone = 'gray', className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', toneBg[tone], className)}>{children}</span>;
}

export function SectionHeader({ title, action, className }: { title: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('mb-3 flex items-center justify-between gap-3', className)}>
      <h2 className="text-lg font-bold tracking-tight text-ink">{title}</h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Carte statistique — libellé, icône ronde, grand chiffre + unité (comme « 5,500 steps »). */
export function StatCard({
  label, value, unit, icon, tone = 'brand', hint, className,
}: { label: ReactNode; value: ReactNode; unit?: ReactNode; icon?: ReactNode; tone?: Tone; hint?: ReactNode; className?: string }) {
  return (
    <Card className={cx('flex flex-col justify-between gap-4', className)}>
      <div className="flex items-start justify-between gap-3">
        <span className="max-w-[9rem] text-sm font-medium leading-snug text-ink-soft">{label}</span>
        {icon && <IconBadge tone={tone}>{icon}</IconBadge>}
      </div>
      <div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[1.75rem] font-extrabold leading-none tracking-tight text-ink">{value}</span>
          {unit && <span className="text-sm text-ink-muted">{unit}</span>}
        </div>
        {hint && <div className="mt-1.5 text-xs text-ink-muted">{hint}</div>}
      </div>
    </Card>
  );
}

// ---------------- Formulaires ----------------

export function Field({ label, hint, error, children, className }: { label?: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="mb-1.5 block text-sm font-semibold text-ink">{label}</span>}
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-ink-muted">{hint}</span> : null}
    </label>
  );
}

const inputCls =
  'w-full rounded-2xl border border-line bg-white px-4 text-sm text-ink placeholder:text-ink-muted outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10';

export function Input({ className, icon, ...p }: InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }) {
  if (icon)
    return (
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted">{icon}</span>
        <input className={cx(inputCls, 'h-12 pl-11', className)} {...p} />
      </div>
    );
  return <input className={cx(inputCls, 'h-12', className)} {...p} />;
}

export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(inputCls, 'min-h-[120px] py-3', className)} {...p} />;
}

export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(inputCls, 'h-12 appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%2712%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%238A93AB%27 stroke-width=%272.5%27%3E%3Cpath d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E")] bg-[right_1rem_center] bg-no-repeat pr-10', className)} {...p}>
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; description?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      {(label || description) && (
        <span>
          {label && <span className="block text-sm font-semibold text-ink">{label}</span>}
          {description && <span className="block text-xs text-ink-muted">{description}</span>}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative h-7 w-12 shrink-0 rounded-full transition', checked ? 'bg-brand' : 'bg-line')}
      >
        <span className={cx('absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-6' : 'left-1')} />
      </button>
    </label>
  );
}

/** Sélecteur segmenté en pilules. */
export function Segmented<T extends string>({
  value, onChange, options, className, size = 'md',
}: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div className={cx('inline-flex rounded-full bg-canvas p-1', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'whitespace-nowrap rounded-full font-semibold transition',
            size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
            value === o.value ? 'bg-white text-ink shadow-sm' : 'text-ink-soft hover:text-ink',
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
      onClick={onClick}
      className={cx(
        'inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold transition',
        active ? 'bg-ink text-white' : 'bg-white text-ink shadow-card hover:bg-brand-50',
      )}
    >
      {children}
    </button>
  );
}

// ---------------- Données ----------------

/** Anneau de progression (inspiré de « 6 days » de la maquette). */
export function ProgressRing({
  value, size = 92, stroke = 10, children, track = '#ffffff', color = '#1F5EFF',
}: { value: number; size?: number; stroke?: number; children?: ReactNode; track?: string; color?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} className="transition-[stroke-dashoffset] duration-700" />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

export function ProgressBar({ value, className, tone = 'brand' }: { value: number; className?: string; tone?: 'brand' | 'ink' | 'green' | 'red' }) {
  const c = { brand: 'bg-brand', ink: 'bg-ink', green: 'bg-emerald-500', red: 'bg-rose-500' }[tone];
  return (
    <div className={cx('h-2 overflow-hidden rounded-full bg-canvas', className)}>
      <div className={cx('h-full rounded-full transition-all duration-700', c)} style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
    </div>
  );
}

/**
 * Histogramme style maquette : piste hachurée en fond, barre pleine devant,
 * pourcentage au-dessus, barre active mise en avant.
 */
export function BarChart({
  data, height = 200, activeIndex, onSelect, format,
}: {
  data: { label: string; value: number; max: number }[];
  height?: number;
  activeIndex?: number;
  onSelect?: (i: number) => void;
  format?: (pct: number, v: number) => string;
}) {
  const top = Math.max(...data.map((d) => Math.max(d.value, d.max)));
  return (
    <div className="flex items-end justify-between gap-2" style={{ height: height + 48 }} role="img" aria-label="Graphique des ventes">
      {data.map((d, i) => {
        const pct = d.max ? d.value / d.max : 0;
        const active = i === activeIndex;
        return (
          <button key={d.label} type="button" onClick={() => onSelect?.(i)} className="group flex flex-1 flex-col items-center gap-2 focus:outline-none">
            <span className={cx('text-xs font-semibold', active ? 'text-ink' : 'text-ink-muted')}>{format ? format(pct, d.value) : `${Math.round(pct * 100)}%`}</span>
            <div className="relative flex w-full max-w-[44px] items-end justify-center gap-1" style={{ height }}>
              <div className="hatch w-1/2 rounded-full" style={{ height: `${(d.max / top) * 100}%` }} />
              <div
                className={cx('w-1/2 rounded-full transition-all duration-700', active ? 'bg-brand' : 'bg-brand-200 group-hover:bg-brand-300')}
                style={{ height: `${Math.max(4, (d.value / top) * 100)}%` }}
              />
            </div>
            <span className={cx('text-xs', active ? 'font-bold text-ink' : 'text-ink-muted')}>{d.label}</span>
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

/** Ligne type ECG / tendance (carte « BPM »). */
export function SparkLine({ values, className, stroke = '#1F5EFF' }: { values: number[]; className?: string; stroke?: string }) {
  const w = 160, h = 40, m = Math.max(...values), n = Math.min(...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - n) / (m - n || 1)) * (h - 6) - 3}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cx('h-10 w-full', className)} preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function Avatar({ name, src, size = 40, className }: { name: string; src?: string; size?: number; className?: string }) {
  const ini = name.length <= 3 ? name : name.split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  const hues = ['#1F5EFF', '#0B1533', '#7C5CFF', '#0FA37F', '#E5487A', '#F59E0B'];
  const bg = hues[name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % hues.length];
  return src ? (
    <img src={src} alt={name} className={cx('rounded-full object-cover', className)} style={{ width: size, height: size }} />
  ) : (
    <span className={cx('grid shrink-0 place-items-center rounded-full font-bold text-white', className)} style={{ width: size, height: size, background: bg, fontSize: size * 0.36 }}>
      {ini}
    </span>
  );
}

export function AvatarStack({ names, size = 32 }: { names: string[]; size?: number }) {
  return (
    <div className="flex -space-x-2">
      {names.slice(0, 3).map((n) => (
        <Avatar key={n} name={n} size={size} className="ring-2 ring-white" />
      ))}
      {names.length > 3 && (
        <span className="grid place-items-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-dark ring-2 ring-white" style={{ width: size, height: size }}>
          +{names.length - 3}
        </span>
      )}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('h-6 w-6 animate-spin text-brand', className)} />;
}

export function Loading({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="grid place-items-center py-20 text-sm text-ink-muted">
      <Spinner />
      <span className="mt-3">{label}</span>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-3xl bg-white/70', className)} />;
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center px-6 py-14 text-center">
      <IconBadge size="lg" tone="brand">{icon}</IconBadge>
      <h3 className="mt-4 text-base font-bold text-ink">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-sm text-ink-soft">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </Card>
  );
}

// ---------------- Fenêtres ----------------

export function Modal({
  open, onClose, title, children, footer, size = 'md',
}: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  const w = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={cx('flex max-h-[92vh] w-full flex-col rounded-t-4xl bg-white shadow-2xl sm:rounded-4xl', w, 'animate-[sheet_.25s_ease-out]')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 px-6 pb-2 pt-6">
          <h3 className="text-lg font-bold text-ink">{title}</h3>
          <IconButton label="Fermer" tone="soft" onClick={onClose} className="h-9 w-9">
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="overflow-y-auto px-6 pb-6 pt-2">{children}</div>
        {footer && <div className="flex gap-2 border-t border-line px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

// ---------------- Tableaux ----------------

export function Table({ head, children, className }: { head: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <div className={cx('overflow-x-auto', className)}>
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-4 py-3 font-semibold first:pl-0 last:pr-0">
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

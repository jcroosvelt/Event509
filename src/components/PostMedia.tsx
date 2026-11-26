import type { CSSProperties } from 'react';
import type { PostMedia } from '@/services/social';

/** Filtres de photo (enregistrés à côté de la photo, jamais dans le fichier) : mêmes noms que l'application. */
const FILTERS: Record<string, string> = {
  noir: 'grayscale(1)',
  sepia: 'sepia(1)',
  vif: 'saturate(1.5)',
  froid: 'hue-rotate(10deg) saturate(1.1) brightness(1.02)',
  chaud: 'sepia(0.35) saturate(1.2)',
  fondu: 'contrast(0.85) brightness(1.1)',
  contraste: 'contrast(1.3)',
  vintage: 'sepia(0.45) contrast(0.9) saturate(0.9)',
};

/** Effets de texte : fond dégradé pour les textes seuls. */
const FX: Record<string, { bg?: string; color?: string; weight?: number; italic?: boolean; mono?: boolean; glow?: boolean }> = {
  bold: { weight: 900 },
  italic: { italic: true },
  neon: { bg: 'linear-gradient(135deg,#0B0B1E,#1B1038)', color: '#7CF7E4', weight: 800, glow: true },
  sunset: { bg: 'linear-gradient(135deg,#FF7A18,#E11D74)', color: '#fff', weight: 800 },
  ocean: { bg: 'linear-gradient(135deg,#0EA5E9,#1D4ED8)', color: '#fff', weight: 800 },
  night: { bg: 'linear-gradient(135deg,#111827,#374151)', color: '#fff', weight: 700 },
  party: { bg: 'linear-gradient(135deg,#A855F7,#F43F5E,#F59E0B)', color: '#fff', weight: 900 },
  mono: { bg: 'linear-gradient(135deg,#F1F5F9,#E2E8F0)', color: '#0F172A', mono: true },
};
export const TEXT_STYLES = ['plain', ...Object.keys(FX)] as const;
export const STICKERS = ['🔥', '🎉', '🥳', '😍', '😂', '🤩', '👏', '🙌', '💃', '🕺', '🎶', '🎤', '🎧', '🍾', '🥂', '🍹', '❤️', '💯', '✨', '🌴', '🇭🇹', '🏆', '👑', '😎', '🤝', '🙏', '👍', '🎟️', '📸', '🎊', '🌟', '💥'];

/** Texte d'un commentaire avec son effet (texte brut : jamais interprété comme du HTML). */
export function StyledText({ text, style }: { text: string; style?: string }) {
  const fx = FX[style ?? ''];
  if (!fx) return <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-ink-soft">{text}</p>;
  const css: CSSProperties = {
    color: fx.color,
    fontWeight: fx.weight,
    fontStyle: fx.italic ? 'italic' : undefined,
    fontFamily: fx.mono ? 'ui-monospace, monospace' : undefined,
    textShadow: fx.glow ? '0 0 12px #7CF7E4, 0 0 24px #7CF7E4aa' : undefined,
  };
  return fx.bg
    ? <p className="mt-1 whitespace-pre-wrap break-words rounded-2xl px-5 py-6 text-center text-lg" style={{ ...css, background: fx.bg }}>{text}</p>
    : <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-ink-soft" style={css}>{text}</p>;
}

/** Photos (avec filtre), GIF, vidéos et autocollants d'un commentaire. */
export function MediaGrid({ media }: { media?: PostMedia[] }) {
  if (!media?.length) return null;
  const stickers = media.filter((m) => m.kind === 'sticker');
  const files = media.filter((m) => m.kind !== 'sticker');
  return (
    <div className="mt-2">
      {files.length > 0 && (
        <div className={files.length === 1 ? '' : 'grid grid-cols-2 gap-1'}>
          {files.map((m) => m.kind === 'video'
            // eslint-disable-next-line jsx-a11y/media-has-caption -- vidéos envoyées par les membres : aucune piste de sous-titres
            ? <video key={m.id} src={m.url} controls preload="none" playsInline className="max-h-80 w-full rounded-xl bg-black" />
            : <img key={m.id} src={m.url} alt="" loading="lazy" className="max-h-80 w-full rounded-xl object-cover" style={{ filter: FILTERS[m.filter ?? ''] }} />)}
        </div>
      )}
      {stickers.length > 0 && <p className="mt-1 text-6xl" aria-hidden>{stickers.map((s) => s.sticker).join(' ')}</p>}
    </div>
  );
}

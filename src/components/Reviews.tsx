import { useState } from 'react';
import { Star } from 'lucide-react';
import { Button, Card, Field, Textarea } from '@/components/ui';
import { useApp } from '@/store/app';
import { cx, dateShort } from '@/lib/format';
import { createReview } from '@/services/api';
import type { Review } from '@/types';

/** Étoiles en lecture seule (note moyenne ou note d'un avis). */
export function Stars({ value, size = 16, label }: { value: number; size?: number; label?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={label ?? `${value}/5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} width={size} height={size} aria-hidden className={cx(value >= n - 0.25 ? 'fill-amber-400 text-amber-400' : value >= n - 0.75 ? 'fill-amber-200 text-amber-400' : 'text-line')} />
      ))}
    </span>
  );
}

/** Choix de la note : cinq boutons accessibles au clavier. */
function RatingPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const { t } = useApp();
  return (
    <div role="radiogroup" aria-label={t('Votre note')} className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={t('{n} sur 5', { n })}
          onClick={() => onChange(n)}
          className="grid h-11 w-11 place-items-center rounded-full hover:bg-canvas"
        >
          <Star className={cx('h-7 w-7', value >= n ? 'fill-amber-400 text-amber-400' : 'text-ink-muted')} aria-hidden />
        </button>
      ))}
    </div>
  );
}

/** Formulaire d'avis, affiché sur la page de commande une fois l'événement terminé. */
export function ReviewForm({ orderId, orderKey, onDone }: { orderId: string; orderKey: string; onDone: () => void }) {
  const { t, toast } = useApp();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (!rating) return setError(t('Choisissez une note de 1 à 5'));
    setBusy(true);
    try {
      await createReview({ orderId, key: orderKey, rating, comment: comment.trim() });
      toast(t('Merci pour votre avis !'));
      onDone();
    } catch {
      toast(t('L’avis n’a pas pu être envoyé. Réessayez.'), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="mt-6">
      <h2 className="text-lg font-extrabold">{t('Comment était l’événement ?')}</h2>
      <p className="mt-1 text-sm text-ink-soft">{t('Votre avis aide les autres participants et l’organisateur.')}</p>
      <div className="mt-3"><RatingPicker value={rating} onChange={(n) => { setRating(n); setError(''); }} /></div>
      {error && <p role="alert" className="mt-1 text-sm font-semibold text-red-600">{error}</p>}
      <div className="mt-3">
        <Field label={t('Commentaire (facultatif)')}>
          <Textarea rows={3} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
      </div>
      <Button className="mt-4" loading={busy} onClick={submit}>{t('Envoyer mon avis')}</Button>
    </Card>
  );
}

/** Un avis publié, avec la réponse de l'organisateur s'il y en a une. */
export function ReviewItem({ r, lang, children }: { r: Review; lang: 'fr' | 'en'; children?: React.ReactNode }) {
  const { t } = useApp();
  return (
    <li className="rounded-2xl bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <Stars value={r.rating} label={t('{n} sur 5', { n: r.rating })} />
        <span className="text-sm font-bold">{r.author}</span>
        <span className="text-xs text-ink-muted">{dateShort(r.createdAt, lang)}</span>
      </div>
      {r.comment && <p className="mt-2 whitespace-pre-line text-sm text-ink-soft">{r.comment}</p>}
      {r.reply && (
        <div className="mt-3 rounded-xl bg-canvas p-3 text-sm">
          <div className="text-xs font-bold text-ink-muted">{t('Réponse de l’organisateur')}</div>
          <p className="mt-1 whitespace-pre-line text-ink-soft">{r.reply.body}</p>
        </div>
      )}
      {children}
    </li>
  );
}

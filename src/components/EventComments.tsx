import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CornerDownRight, ImagePlus, MessageCircle, Smile, Trash2, UserX, X } from 'lucide-react';
import { useApp } from '@/store/app';
import { deleteComment, listComments, postComment, socialAvailable, uploadMedia, type CommentList, type EventComment, type MediaIn } from '@/services/social';
import { MediaGrid, STICKERS, StyledText } from '@/components/PostMedia';
import { blockAuthor } from '@/services/community';
import { ReportContent } from '@/components/ReportContent';
import { relative } from '@/lib/format';
import { Avatar, Badge, Button, Card, Spinner, Textarea } from '@/components/ui';
import { VerifiedBadge } from '@/components/VerifiedBadge';

const MAX = 1000;

function Composer({ eventId, parentId, onDone, autoFocus, placeholder }: { eventId: string; parentId?: string; onDone: (c: EventComment) => void; autoFocus?: boolean; placeholder?: string }) {
  const { t, toast } = useApp();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [stickers, setStickers] = useState<string[]>([]);
  const [picker, setPicker] = useState(false);
  const ready = text.trim() || files.length || stickers.length;
  const send = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      const media: MediaIn[] = [];
      for (const f of files) media.push({ fileId: (await uploadMedia(f)).fileId });
      for (const s of stickers) media.push({ kind: 'sticker', sticker: s });
      onDone(await postComment(eventId, text, parentId, media));
      setText('');
      setFiles([]);
      setStickers([]);
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Le commentaire n’a pas pu être publié. Réessayez.'), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <Textarea
        rows={parentId ? 2 : 3}
        value={text}
        maxLength={MAX}
        autoFocus={autoFocus}
        placeholder={placeholder ?? t('Écrire un commentaire…')}
        aria-label={placeholder ?? t('Écrire un commentaire…')}
        onChange={(e) => setText(e.target.value)}
      />
      {(files.length > 0 || stickers.length > 0) && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-1 rounded-full bg-canvas px-3 py-1 text-xs font-semibold">{f.name.slice(0, 24)}
              <button type="button" aria-label={t('Retirer')} onClick={() => setFiles(files.filter((_, j) => j !== i))}><X className="h-3 w-3" aria-hidden /></button></li>
          ))}
          {stickers.map((s, i) => (
            <li key={`${s}-${i}`} className="flex items-center gap-1 rounded-full bg-canvas px-3 py-1 text-lg">{s}
              <button type="button" aria-label={t('Retirer')} onClick={() => setStickers(stickers.filter((_, j) => j !== i))}><X className="h-3 w-3" aria-hidden /></button></li>
          ))}
        </ul>
      )}
      {picker && (
        <div className="mt-2 flex flex-wrap gap-1 rounded-2xl border border-line p-2">
          {STICKERS.map((s) => <button key={s} type="button" className="rounded-lg p-1 text-3xl hover:bg-canvas" onClick={() => { setStickers([...stickers, s].slice(0, 4)); setPicker(false); }}>{s}</button>)}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <label className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-brand-ink hover:bg-canvas" title={t('Photos et vidéos')}>
            <ImagePlus className="h-5 w-5" aria-hidden />
            <span className="sr-only">{t('Photos et vidéos')}</span>
            <input type="file" accept="image/*,video/mp4,video/webm" multiple className="hidden" onChange={(e) => { setFiles([...files, ...Array.from(e.target.files ?? [])].slice(0, 4)); e.target.value = ''; }} />
          </label>
          <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-brand-ink hover:bg-canvas" aria-label={t('Stickers')} onClick={() => setPicker((v) => !v)}><Smile className="h-5 w-5" aria-hidden /></button>
          <span className="ml-2 text-xs text-ink-muted" aria-live="polite">{text.length}/{MAX}</span>
        </div>
        <Button size="sm" loading={busy} disabled={!ready} onClick={() => void send()}>{parentId ? t('Répondre') : t('Publier')}</Button>
      </div>
    </div>
  );
}

function Item({ c, eventId, onReply, onRemove, isReply }: { c: EventComment; eventId: string; onReply: (c: EventComment) => void; onRemove: (c: EventComment) => void; isReply?: boolean }) {
  const { t, lang, user, toast } = useApp();
  const block = async () => {
    if (!window.confirm(t('Bloquer ce membre ? Vous ne verrez plus ses commentaires ni ses photos.'))) return;
    try { await blockAuthor('comment', c.id); toast(t('Membre bloqué')); onReply(c); } catch { toast(t('Action impossible. Réessayez.'), 'error'); }
  };
  const [replying, setReplying] = useState(false);
  return (
    <li className={isReply ? 'mt-3' : ''}>
      <div className="flex gap-3">
        <Avatar name={c.author.name} src={c.author.avatarUrl} size={isReply ? 30 : 36} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
            <b className="flex items-center gap-1">{c.author.name} {c.author.verified && <VerifiedBadge size={15} />}</b>
            {c.author.isOrganizer && <Badge tone="brand">{t('Organisateur')}</Badge>}
            <span className="text-xs text-ink-muted">{relative(c.createdAt, lang)}</span>
          </p>
          {/* Texte brut : React l'affiche tel quel, jamais comme du HTML */}
          {c.body && <StyledText text={c.body} style={c.style} />}
          <MediaGrid media={c.media} />
          <div className="mt-1 flex gap-3 text-xs font-semibold text-ink-muted">
            {!isReply && user && <button type="button" className="hover:text-ink" onClick={() => setReplying((r) => !r)}><CornerDownRight className="mr-1 inline h-3 w-3" aria-hidden />{t('Répondre')}</button>}
            {user && !c.mine && <ReportContent kind="comment" targetId={c.id} />}
            {user && !c.mine && <button type="button" className="hover:text-red-600" onClick={() => void block()}><UserX className="mr-1 inline h-3 w-3" aria-hidden />{t('Bloquer')}</button>}
            {c.canDelete && <button type="button" className="hover:text-red-600" onClick={() => onRemove(c)}><Trash2 className="mr-1 inline h-3 w-3" aria-hidden />{t('Supprimer')}</button>}
          </div>
          {replying && (
            <div className="mt-2">
              <Composer eventId={eventId} parentId={c.id} autoFocus placeholder={t('Votre réponse…')} onDone={(r) => { setReplying(false); onReply(r); }} />
            </div>
          )}
          {!isReply && c.replies && c.replies.length > 0 && (
            <ul className="mt-2 border-l-2 border-line pl-3">
              {c.replies.map((r) => <Item key={r.id} c={r} eventId={eventId} onReply={onReply} onRemove={onRemove} isReply />)}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}

/** Commentaires d'un événement : lecture pour tous, écriture pour les comptes connectés, réponses sur un niveau. */
export function EventComments({ eventId }: { eventId: string }) {
  const { t, user, toast } = useApp();
  const [data, setData] = useState<CommentList | null>(null);
  const [failed, setFailed] = useState(false);
  const [more, setMore] = useState(false);

  const load = useCallback(() => {
    listComments(eventId).then((d) => { setData(d); setFailed(false); }).catch(() => setFailed(true));
  }, [eventId]);
  useEffect(() => { if (socialAvailable) load(); }, [load]);
  if (!socialAvailable) return null;

  const loadMore = async () => {
    if (!data?.items.length) return;
    setMore(true);
    try {
      const next = await listComments(eventId, data.items[data.items.length - 1]!.createdAt);
      setData({ ...next, items: [...data.items, ...next.items] });
    } catch {
      toast(t('Impossible de charger la suite. Réessayez.'), 'error');
    } finally {
      setMore(false);
    }
  };
  const remove = async (c: EventComment) => {
    if (!window.confirm(t('Supprimer ce commentaire ?'))) return;
    try {
      await deleteComment(c.id);
      load();
    } catch {
      toast(t('Suppression impossible. Réessayez.'), 'error');
    }
  };

  return (
    <section aria-labelledby="h-comments" className="mt-8">
      <h2 id="h-comments" className="mb-3 flex items-center gap-2 text-lg font-extrabold"><MessageCircle className="h-5 w-5" aria-hidden /> {t('Commentaires')}{data ? ` (${data.total})` : ''}</h2>
      <Card>
        {data?.enabled === false ? (
          <p className="text-sm text-ink-soft">{t('Les commentaires sont désactivés pour cet événement.')}</p>
        ) : user ? (
          <Composer eventId={eventId} onDone={() => load()} />
        ) : (
          <p className="text-sm text-ink-soft">
            <Link to={`/connexion?next=${encodeURIComponent(window.location.pathname)}`} className="font-semibold text-brand-ink">{t('Connectez-vous')}</Link> {t('pour commenter cet événement.')}
          </p>
        )}
        <div className="mt-5">
          {failed ? <p role="alert" className="text-sm text-ink-muted">{t('Les commentaires n’ont pas pu être chargés.')} <button type="button" className="font-semibold text-brand-ink" onClick={load}>{t('Réessayer')}</button></p>
            : !data ? <div className="grid place-items-center py-4"><Spinner /></div>
            : !data.items.length ? <p className="text-sm text-ink-muted">{t('Aucun commentaire pour le moment. Soyez le premier !')}</p>
            : (
              <ul className="space-y-5">
                {data.items.map((c) => <Item key={c.id} c={c} eventId={eventId} onReply={() => load()} onRemove={(x) => void remove(x)} />)}
              </ul>
            )}
          {data?.hasMore && <div className="mt-4 text-center"><Button variant="outline" size="sm" loading={more} onClick={() => void loadMore()}>{t('Voir plus de commentaires')}</Button></div>}
        </div>
      </Card>
    </section>
  );
}

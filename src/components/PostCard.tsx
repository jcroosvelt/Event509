import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, ImagePlus, MessageCircle, Smile, Trash2, X } from 'lucide-react';
import { useApp } from '@/store/app';
import { addPostComment, createPost, deletePost, deletePostComment, likePost, likePostComment, listPostComments, type FeedPost, type PostComment } from '@/services/community';
import { uploadMedia, type MediaIn } from '@/services/social';
import { ReportContent } from '@/components/ReportContent';
import { MediaGrid, STICKERS, StyledText, TEXT_STYLES } from '@/components/PostMedia';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { relative, cx } from '@/lib/format';
import { Avatar, Button, Card, Spinner, Textarea } from '@/components/ui';

function CommentComposer({ postId, onDone, parentId, initial = '', autoFocus }: { postId: string; onDone: (c: PostComment) => void; parentId?: string; initial?: string; autoFocus?: boolean }) {
  const { t, toast } = useApp();
  const [text, setText] = useState(initial);
  const [files, setFiles] = useState<File[]>([]);
  const [stickers, setStickers] = useState<string[]>([]);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const ready = text.trim() || files.length || stickers.length;
  const send = async () => {
    setBusy(true);
    try {
      const media: MediaIn[] = [];
      for (const f of files) media.push({ fileId: (await uploadMedia(f)).fileId });
      for (const s of stickers) media.push({ kind: 'sticker', sticker: s });
      onDone(await addPostComment(postId, text, media, parentId));
      setText(''); setFiles([]); setStickers([]);
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Le commentaire n’a pas pu être publié. Réessayez.'), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <Textarea rows={2} value={text} autoFocus={autoFocus} maxLength={1000} placeholder={parentId ? t('Votre réponse…') : t('Écrire un commentaire…')} aria-label={t('Écrire un commentaire…')} onChange={(e) => setText(e.target.value)} />
      {(files.length > 0 || stickers.length > 0) && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {files.map((f, i) => <li key={`${f.name}-${i}`} className="flex items-center gap-1 rounded-full bg-canvas px-3 py-1 text-xs font-semibold">{f.name.slice(0, 24)}<button type="button" aria-label={t('Retirer')} onClick={() => setFiles(files.filter((_, j) => j !== i))}><X className="h-3 w-3" aria-hidden /></button></li>)}
          {stickers.map((s, i) => <li key={`${s}-${i}`} className="flex items-center gap-1 rounded-full bg-canvas px-3 py-1 text-lg">{s}<button type="button" aria-label={t('Retirer')} onClick={() => setStickers(stickers.filter((_, j) => j !== i))}><X className="h-3 w-3" aria-hidden /></button></li>)}
        </ul>
      )}
      {picker && (
        <div className="mt-2 flex flex-wrap gap-1 rounded-2xl border border-line p-2">
          {STICKERS.map((s) => <button key={s} type="button" className="rounded-lg p-1 text-3xl hover:bg-canvas" onClick={() => { setStickers([...stickers, s].slice(0, 4)); setPicker(false); }}>{s}</button>)}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <label className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-brand-ink hover:bg-canvas">
            <ImagePlus className="h-5 w-5" aria-hidden /><span className="sr-only">{t('Photos et vidéos')}</span>
            <input type="file" accept="image/*,video/mp4,video/webm" multiple className="hidden" onChange={(e) => { setFiles([...files, ...Array.from(e.target.files ?? [])].slice(0, 4)); e.target.value = ''; }} />
          </label>
          <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-brand-ink hover:bg-canvas" aria-label={t('Stickers')} onClick={() => setPicker((v) => !v)}><Smile className="h-5 w-5" aria-hidden /></button>
        </div>
        <Button size="sm" loading={busy} disabled={!ready} onClick={() => void send()}>{t('Publier')}</Button>
      </div>
    </div>
  );
}

function PostCommentItem({ c, topId, isReply, onChanged, onRemove }: { c: PostComment; topId?: string; isReply?: boolean; onChanged: () => void; onRemove: (c: PostComment) => void }) {
  const { t, lang, user, toast } = useApp();
  const [liked, setLiked] = useState(c.liked);
  const [likes, setLikes] = useState(c.likes);
  const [replying, setReplying] = useState(false);
  const like = async () => {
    if (!user) { toast(t('Connectez-vous pour aimer'), 'error'); return; }
    const on = !liked;
    setLiked(on);
    setLikes((n) => n + (on ? 1 : -1));
    try { const r = await likePostComment(c.id, on); setLiked(r.liked); setLikes(r.likes); } catch { setLiked(!on); setLikes((n) => n + (on ? -1 : 1)); toast(t('Action impossible. Réessayez.'), 'error'); }
  };
  return (
    <li className={isReply ? 'mt-3' : ''}>
      <div className="flex gap-3">
        <Avatar name={c.author.name} src={c.author.avatarUrl} size={isReply ? 28 : 32} />
        <div className="min-w-0 flex-1">
          <p className="text-sm"><b>{c.author.name}</b> {c.author.isOrganizer && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold text-brand-ink">{t('Organisateur')}</span>} <span className="text-xs text-ink-muted">{relative(c.createdAt, lang)}</span></p>
          {c.body && <StyledText text={c.body} />}
          <MediaGrid media={c.media} />
          <div className="mt-1 flex flex-wrap gap-3 text-xs font-semibold text-ink-muted">
            <button type="button" aria-pressed={liked} className={cx('hover:text-ink', liked && 'text-red-600')} onClick={() => void like()}><Heart className={cx('mr-1 inline h-3 w-3', liked && 'fill-red-500')} aria-hidden />{likes > 0 ? `${t('Aimer')} · ${likes}` : t('Aimer')}</button>
            {user && <button type="button" className="hover:text-ink" onClick={() => setReplying((r) => !r)}>{t('Répondre')}</button>}
            {user && !c.mine && <ReportContent kind="pcomment" targetId={c.id} />}
            {c.canDelete && <button type="button" className="hover:text-red-600" onClick={() => onRemove(c)}><Trash2 className="mr-1 inline h-3 w-3" aria-hidden />{t('Supprimer')}</button>}
          </div>
          {replying && (
            <div className="mt-2">
              <CommentComposer postId={c.postId} parentId={topId ?? c.id} initial={isReply ? `@${c.author.name} ` : ''} autoFocus onDone={() => { setReplying(false); onChanged(); }} />
            </div>
          )}
          {!isReply && c.replies && c.replies.length > 0 && (
            <ul className="mt-2 border-l-2 border-line pl-3">
              {c.replies.map((r) => <PostCommentItem key={r.id} c={r} topId={c.id} isReply onChanged={onChanged} onRemove={onRemove} />)}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}

function Comments({ post, onCount }: { post: FeedPost; onCount: (n: number) => void }) {
  const { t, user, toast } = useApp();
  const [items, setItems] = useState<PostComment[] | null>(null);
  const load = () => { listPostComments(post.id).then((d) => { setItems(d.items); onCount(d.total); }).catch(() => setItems([])); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [post.id]);
  const remove = async (c: PostComment) => {
    if (!window.confirm(t('Supprimer ce commentaire ?'))) return;
    try { await deletePostComment(c.id); load(); } catch { toast(t('Suppression impossible. Réessayez.'), 'error'); }
  };
  return (
    <div className="mt-3 border-t border-line pt-3">
      {user
        ? <CommentComposer postId={post.id} onDone={() => load()} />
        : <p className="text-sm text-ink-soft"><Link to={`/connexion?next=${encodeURIComponent('/fil')}`} className="font-semibold text-brand-ink">{t('Connectez-vous')}</Link> {t('pour commenter cet événement.')}</p>}
      {items === null ? <div className="grid place-items-center py-3"><Spinner /></div> : (
        <ul className="mt-4 space-y-4">
          {items.map((c) => <PostCommentItem key={c.id} c={c} onChanged={load} onRemove={(x) => void remove(x)} />)}
        </ul>
      )}
    </div>
  );
}

/** Publication d'une organisation : texte avec effet, médias, j'aime, note en étoiles, commentaires. */
export function PostCard({ post: initial, onRemoved }: { post: FeedPost; onRemoved: () => void }) {
  const { t, lang, user, toast } = useApp();
  const [post, setPost] = useState(initial);
  const [open, setOpen] = useState(false);
  const toggleLike = async () => {
    if (!user) { toast(t('Connectez-vous pour aimer'), 'error'); return; }
    const on = !post.liked;
    setPost({ ...post, liked: on, likes: post.likes + (on ? 1 : -1) });
    try {
      const r = await likePost(post.id, on);
      setPost((p) => ({ ...p, liked: r.liked, likes: r.likes }));
    } catch {
      setPost((p) => ({ ...p, liked: !on, likes: p.likes + (on ? -1 : 1) }));
      toast(t('Action impossible. Réessayez.'), 'error');
    }
  };
  const remove = async () => {
    if (!window.confirm(t('Supprimer cette publication ?'))) return;
    try { await deletePost(post.id); onRemoved(); } catch { toast(t('Suppression impossible. Réessayez.'), 'error'); }
  };
  return (
    <Card>
      <div className="flex items-center gap-3">
        <Avatar name={post.author.name} src={post.author.avatarUrl} size={40} />
        <div className="min-w-0">
          <p className="flex items-center gap-1 font-bold">
            {post.author.orgSlug ? <Link to={`/o/${post.author.orgSlug}`} className="truncate hover:underline">{post.author.name}</Link> : <span className="truncate">{post.author.name}</span>}
            {post.author.verified && <VerifiedBadge size={15} />}
          </p>
          <p className="text-xs text-ink-muted">{relative(post.createdAt, lang)}</p>
        </div>
      </div>
      {post.body && <div className="mt-3"><StyledText text={post.body} style={post.style} /></div>}
      <MediaGrid media={post.media} />
      {post.event && <p className="mt-3 text-sm"><Link to={`/e/${post.event.slug}`} className="font-semibold text-brand-ink hover:underline">{post.event.title}</Link></p>}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1">
        <button type="button" aria-pressed={post.liked} aria-label={t('Aimer')} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink" onClick={() => void toggleLike()}>
          <Heart className={cx('h-5 w-5', post.liked && 'fill-red-500 text-red-500')} aria-hidden /> {post.likes}
        </button>
        <button type="button" aria-expanded={open} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink" onClick={() => setOpen((v) => !v)}>
          <MessageCircle className="h-5 w-5" aria-hidden /> {post.commentCount || t('Commenter')}
        </button>
        <span className="ml-auto flex gap-3 text-xs font-semibold text-ink-muted">
          {user && !post.mine && <ReportContent kind="post" targetId={post.id} />}
          {post.canDelete && <button type="button" className="hover:text-red-600" onClick={() => void remove()}><Trash2 className="mr-1 inline h-3 w-3" aria-hidden />{t('Supprimer')}</button>}
        </span>
      </div>
      {open && <Comments post={post} onCount={(n) => setPost((p) => ({ ...p, commentCount: n }))} />}
    </Card>
  );
}

/** Nouvelle publication d'une organisation : texte avec effet, photos, GIF, vidéo, stickers. */
export function PostComposer({ onDone }: { onDone: () => void }) {
  const { t, toast } = useApp();
  const [text, setText] = useState('');
  const [style, setStyle] = useState('plain');
  const [files, setFiles] = useState<File[]>([]);
  const [stickers, setStickers] = useState<string[]>([]);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const ready = text.trim() || files.length || stickers.length;
  const send = async () => {
    setBusy(true);
    try {
      const media: MediaIn[] = [];
      for (const f of files) media.push({ fileId: (await uploadMedia(f)).fileId });
      for (const s of stickers) media.push({ kind: 'sticker', sticker: s });
      await createPost(text, style, media);
      setText(''); setFiles([]); setStickers([]); setStyle('plain');
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Action impossible. Réessayez.'), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="mb-5">
      <h2 className="mb-2 font-bold">{t('Nouvelle publication')}</h2>
      <Textarea rows={4} value={text} maxLength={2000} placeholder={t('Quoi de neuf ?')} aria-label={t('Quoi de neuf ?')} onChange={(e) => setText(e.target.value)} />
      {text.trim() && files.length === 0 && style !== 'plain' && <div className="mt-2"><StyledText text={text} style={style} /></div>}
      {(files.length > 0 || stickers.length > 0) && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {files.map((f, i) => <li key={`${f.name}-${i}`} className="flex items-center gap-1 rounded-full bg-canvas px-3 py-1 text-xs font-semibold">{f.name.slice(0, 24)}<button type="button" aria-label={t('Retirer')} onClick={() => setFiles(files.filter((_, j) => j !== i))}><X className="h-3 w-3" aria-hidden /></button></li>)}
          {stickers.map((s, i) => <li key={`${s}-${i}`} className="flex items-center gap-1 rounded-full bg-canvas px-3 py-1 text-lg">{s}<button type="button" aria-label={t('Retirer')} onClick={() => setStickers(stickers.filter((_, j) => j !== i))}><X className="h-3 w-3" aria-hidden /></button></li>)}
        </ul>
      )}
      {picker && (
        <div className="mt-2 flex flex-wrap gap-1 rounded-2xl border border-line p-2">
          {STICKERS.map((s) => <button key={s} type="button" className="rounded-lg p-1 text-3xl hover:bg-canvas" onClick={() => { setStickers([...stickers, s].slice(0, 6)); setPicker(false); }}>{s}</button>)}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <label className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-brand-ink hover:bg-canvas">
            <ImagePlus className="h-5 w-5" aria-hidden /><span className="sr-only">{t('Photos et vidéos')}</span>
            <input type="file" accept="image/*,video/mp4,video/webm" multiple className="hidden" onChange={(e) => { setFiles([...files, ...Array.from(e.target.files ?? [])].slice(0, 6)); e.target.value = ''; }} />
          </label>
          <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-brand-ink hover:bg-canvas" aria-label={t('Stickers')} onClick={() => setPicker((v) => !v)}><Smile className="h-5 w-5" aria-hidden /></button>
          <label className="ml-2 text-xs font-semibold text-ink-muted">
            <span className="sr-only">{t('Effet du texte')}</span>
            <select value={style} disabled={files.length > 0} onChange={(e) => setStyle(e.target.value)} className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs" aria-label={t('Effet du texte')}>
              {TEXT_STYLES.map((s) => <option key={s} value={s}>{effectLabel(s, t)}</option>)}
            </select>
          </label>
        </div>
        <Button loading={busy} disabled={!ready} onClick={() => void send()}>{t('Publier')}</Button>
      </div>
      <p className="mt-2 text-xs text-ink-muted">{t('Vos abonnés sont prévenus.')}</p>
    </Card>
  );
}

const effectLabel = (s: string, t: (fr: string) => string) => {
  switch (s) {
    case 'plain': return t('Simple');
    case 'bold': return t('Gras');
    case 'italic': return t('Italique');
    case 'neon': return t('Néon');
    case 'sunset': return t('Coucher de soleil');
    case 'ocean': return t('Océan');
    case 'night': return t('Nuit');
    case 'party': return t('Fête');
    default: return t('Machine');
  }
};

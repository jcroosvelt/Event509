import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, MessageCircle, Send } from 'lucide-react';
import { useApp } from '@/store/app';
import { myConversations, myThread, orgConversations, orgThread, replyMine, replyOrg, type ConversationItem, type Thread } from '@/services/social';
import { relative } from '@/lib/format';
import { blockConversationUser } from '@/services/community';
import { ReportContent } from '@/components/ReportContent';
import { Avatar, Badge, Button, Card, EmptyState, Loading, Textarea } from '@/components/ui';
import { VerifiedBadge } from '@/components/VerifiedBadge';

/** Messagerie : liste des conversations puis fil de discussion. `mode="user"` = mes messages ; `mode="org"` = boîte de l'organisation. */
export function Conversations({ mode }: { mode: 'user' | 'org' }) {
  const { t, lang, toast } = useApp();
  const [list, setList] = useState<ConversationItem[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const loadList = useCallback(() => {
    (mode === 'org' ? orgConversations : myConversations)().then(setList).catch(() => setList([]));
  }, [mode]);
  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => {
    if (!open) { setThread(null); return; }
    let alive = true;
    (mode === 'org' ? orgThread : myThread)(open).then((th) => { if (alive) { setThread(th); loadList(); } }).catch(() => alive && toast(t('Conversation introuvable.'), 'error'));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [thread?.messages.length]);

  const send = async () => {
    if (!open || !text.trim()) return;
    setBusy(true);
    try {
      await (mode === 'org' ? replyOrg : replyMine)(open, text);
      setText('');
      const th = await (mode === 'org' ? orgThread : myThread)(open);
      setThread(th);
      loadList();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Le message n’a pas pu être envoyé. Réessayez.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (list === null) return <Loading />;
  const who = (c: ConversationItem) => (mode === 'org' ? c.from ?? '' : c.organizer?.name ?? '');

  if (open && thread) {
    const title = mode === 'org' ? thread.from ?? '' : thread.organizer?.name ?? '';
    return (
      <div className="mx-auto max-w-2xl pb-28 lg:pb-0">
        <button type="button" onClick={() => { setOpen(null); loadList(); }} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-ink"><ArrowLeft className="h-4 w-4" aria-hidden /> {t('Retour')}</button>
        <Card className="flex h-[62vh] flex-col !p-0">
          <div className="flex items-center gap-3 border-b border-line p-4">
            <Avatar name={title} src={mode === 'org' ? thread.avatarUrl : thread.organizer?.logo} size={40} />
            <h1 className="flex items-center gap-1 font-bold">{title} {mode === 'user' && thread.organizer?.verified && <VerifiedBadge size={16} />}</h1>
            {mode === 'org' && (
              <Button size="sm" variant="outline" className="ml-auto" onClick={() => {
                const on = !thread.blocked;
                if (on && !window.confirm(t('Bloquer cette personne ? Elle ne pourra plus écrire à votre organisation.'))) return;
                void blockConversationUser(thread.id, on).then(() => { setThread({ ...thread, blocked: on }); loadList(); toast(on ? t('Personne bloquée') : t('Personne débloquée')); }).catch(() => toast(t('Action impossible. Réessayez.'), 'error'));
              }}>{thread.blocked ? t('Débloquer') : t('Bloquer')}</Button>
            )}
          </div>
          <ul className="flex-1 space-y-2 overflow-y-auto p-4" aria-live="polite">
            {thread.messages.map((m) => {
              const mine = (mode === 'user') === (m.from === 'user');
              return (
                <li key={m.id} className={mine ? 'flex justify-end' : 'flex justify-start'}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-brand text-white' : 'bg-canvas text-ink'}`}>
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className={`mt-1 text-[11px] ${mine ? 'text-white/70' : 'text-ink-muted'}`}>{relative(m.at, lang)}{!mine && <> · <ReportContent kind="message" targetId={m.id} className="underline" label={t('Signaler')} /></>}</p>
                  </div>
                </li>
              );
            })}
            <div ref={end} />
          </ul>
          <div className="flex items-end gap-2 border-t border-line p-3">
            <Textarea rows={2} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} aria-label={t('Votre message')} placeholder={t('Votre message')} className="flex-1" />
            <Button loading={busy} disabled={!text.trim()} onClick={() => void send()} aria-label={t('Envoyer')}><Send className="h-4 w-4" aria-hidden /></Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl pb-28 lg:pb-0">
      <h1 className="mb-4 text-2xl font-extrabold tracking-tight">{mode === 'org' ? t('Messages des participants') : t('Mes messages')}</h1>
      {!list.length ? (
        <EmptyState icon={<MessageCircle className="h-5 w-5" />} title={t('Aucun message')} body={mode === 'org' ? t('Les messages envoyés par les participants à votre organisation apparaîtront ici.') : t('Écrivez à un organisateur depuis sa page ou depuis un événement.')} />
      ) : (
        <ul className="space-y-2">
          {list.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => setOpen(c.id)} className="flex w-full items-center gap-3 rounded-3xl bg-surface p-3 text-left shadow-card hover:bg-canvas">
                <Avatar name={who(c)} src={mode === 'user' ? c.organizer?.logo : undefined} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2"><b className="truncate">{who(c)}</b>{c.unread > 0 && <Badge tone="red">{c.unread}</Badge>}<span className="ml-auto shrink-0 text-xs text-ink-muted">{relative(c.at, lang)}</span></span>
                  {c.event && <span className="block truncate text-xs text-ink-muted">{c.event}</span>}
                  <span className="block truncate text-sm text-ink-soft">{c.last ? `${c.last.from === (mode === 'user' ? 'user' : 'org') ? `${t('Vous')} : ` : ''}${c.last.body}` : ''}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

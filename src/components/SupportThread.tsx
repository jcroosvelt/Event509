import { useState } from 'react';
import { useApp } from '@/store/app';
import { cx } from '@/lib/format';
import { Badge, Button, Field, Textarea, type Tone } from '@/components/ui';
import type { SupportMessage, SupportTicket } from '@/services/premium';

export const STATUS_LABEL: Record<SupportTicket['status'], { l: string; tone: Tone }> = {
  open: { l: 'En attente de l’équipe Event509', tone: 'amber' }, pending: { l: 'Réponse reçue', tone: 'brand' }, resolved: { l: 'Résolu', tone: 'green' },
};
export const PRIORITY_LABEL: Record<SupportTicket['priority'], { l: string; tone: Tone }> = {
  normal: { l: 'Normale', tone: 'gray' }, priority: { l: 'Prioritaire', tone: 'violet' }, urgent: { l: 'Urgente : événement en cours', tone: 'red' },
};
export const categoryLabels: Record<string, string> = { technical: 'Technique', billing: 'Facturation', event: 'Événement', other: 'Autre' };

/** Conversation d'une demande de support, avec le formulaire de réponse. Même composant pour l'organisateur et l'administration. */
export function SupportThread({ ticket, messages, viewer, onReply, onResolve }: {
  ticket: SupportTicket; messages: SupportMessage[]; viewer: 'organizer' | 'admin';
  onReply: (body: string, resolve: boolean) => Promise<void>; onResolve?: () => Promise<void>;
}) {
  const { t, lang } = useApp();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async (resolve: boolean) => {
    if (body.trim().length < 2) return;
    setBusy(true);
    try { await onReply(body.trim(), resolve); setBody(''); } finally { setBusy(false); }
  };
  const st = STATUS_LABEL[ticket.status];
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="min-w-0 flex-1 text-lg font-extrabold">{ticket.subject}</h2>
        <Badge tone={st.tone}>{t(st.l)}</Badge>
        <Badge tone={PRIORITY_LABEL[ticket.priority].tone}>{t(PRIORITY_LABEL[ticket.priority].l)}</Badge>
      </div>
      <ol className="space-y-3" aria-label={t('Conversation')}>
        {messages.map((m) => {
          const mine = m.from === viewer;
          return (
            <li key={m.id} className={cx('max-w-[90%] rounded-2xl p-3 text-sm', mine ? 'ml-auto bg-brand-100 text-ink dark:bg-brand/20' : 'bg-surface shadow-card')}>
              <div className="mb-1 flex flex-wrap justify-between gap-2 text-xs text-ink-muted"><b>{m.author}{m.from === 'admin' && viewer === 'organizer' ? ' · Event509' : ''}</b><span>{new Date(m.at).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US', { dateStyle: 'short', timeStyle: 'short' })}</span></div>
              <p className="whitespace-pre-line">{m.body}</p>
            </li>
          );
        })}
      </ol>
      <div className="mt-4">
        <Field label={ticket.status === 'resolved' ? t('Rouvrir la demande en répondant') : t('Votre réponse')}><Textarea rows={3} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button loading={busy} onClick={() => send(false)}>{t('Envoyer')}</Button>
          {viewer === 'admin' && <Button variant="outline" loading={busy} onClick={() => send(true)}>{t('Envoyer et marquer résolu')}</Button>}
          {viewer === 'organizer' && ticket.status !== 'resolved' && onResolve && <Button variant="ghost" onClick={() => void onResolve()}>{t('Marquer comme résolu')}</Button>}
        </div>
      </div>
    </div>
  );
}

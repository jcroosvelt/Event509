import { useState } from 'react';
import { Headphones, Lock } from 'lucide-react';
import { DEMO } from '@/services/api';
import { adminReplySupport, adminSupportStatus, getSupportInbox, getSupportTicket } from '@/services/premium';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { relative } from '@/lib/format';
import { PRIORITY_LABEL, STATUS_LABEL, SupportThread } from '@/components/SupportThread';
import { Badge, Button, Card, EmptyState, Loading, PageHeader, Segmented } from '@/components/ui';

/** Boîte de réception du support : les demandes urgentes et prioritaires en premier. */
export default function AdminSupport() {
  const { t, lang, toast } = useApp();
  useTitle(t('Support'));
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const inbox = useAsync(() => (DEMO ? Promise.resolve(null) : getSupportInbox(status)), [status]);
  const thread = useAsync(() => (open ? getSupportTicket(open, true) : Promise.resolve(null)), [open]);
  if (DEMO) return <EmptyState icon={<Lock className="h-5 w-5" />} title={t('Programme disponible sur le site en ligne')} body={t('Le support nécessite le serveur.')} />;
  if (!inbox.data) return <Loading />;
  const waiting = inbox.data.filter((k) => k.status === 'open').length;

  return (
    <div className="space-y-6">
      <PageHeader title={t('Support')} subtitle={t('Demandes des organisateurs vérifiés : urgentes et prioritaires en premier.')} />
      {open && thread.data ? (
        <Card>
          <Button variant="ghost" size="sm" className="mb-2" onClick={() => { setOpen(null); inbox.reload(); }}>{t('← Toutes les demandes')}</Button>
          <p className="mb-2 text-sm text-ink-muted">{thread.data.ticket.organization}</p>
          <SupportThread ticket={thread.data.ticket} messages={thread.data.messages} viewer="admin"
            onReply={async (body, resolve) => { await adminReplySupport(open, body, resolve); thread.reload(); toast(t('Réponse envoyée : l’organisateur est prévenu')); }} />
          {thread.data.ticket.status !== 'resolved' && <Button variant="ghost" size="sm" className="mt-3" onClick={async () => { await adminSupportStatus(open, 'resolved'); thread.reload(); inbox.reload(); }}>{t('Marquer comme résolu sans réponse')}</Button>}
        </Card>
      ) : (
        <>
          <Segmented label={t('Filtre')} value={status} onChange={setStatus} options={[{ value: '', label: t('Toutes') }, { value: 'open', label: t('À traiter ({n})', { n: waiting }) }, { value: 'pending', label: t('Répondues') }, { value: 'resolved', label: t('Résolues') }]} />
          {!inbox.data.length ? <EmptyState icon={<Headphones className="h-5 w-5" />} title={t('Aucune demande')} /> : (
            <ul className="space-y-2">
              {inbox.data.map((k) => (
                <li key={k.id}>
                  <button type="button" onClick={() => setOpen(k.id)} className="flex w-full flex-wrap items-center gap-3 rounded-2xl bg-surface p-3 text-left shadow-card hover:ring-1 hover:ring-brand-200">
                    <span className="min-w-0 flex-1"><span className="block truncate font-bold">{k.subject}</span><span className="block truncate text-xs text-ink-muted">{k.organization} · {relative(k.updatedAt, lang)} — {k.last}</span></span>
                    <Badge tone={PRIORITY_LABEL[k.priority].tone}>{t(PRIORITY_LABEL[k.priority].l)}</Badge>
                    <Badge tone={STATUS_LABEL[k.status].tone}>{t(STATUS_LABEL[k.status].l)}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

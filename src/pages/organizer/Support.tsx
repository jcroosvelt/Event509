import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Headphones, Lock, Plus } from 'lucide-react';
import { DEMO } from '@/services/api';
import { createSupportTicket, getSupport, getSupportTicket, replySupport, resolveSupport } from '@/services/premium';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { relative } from '@/lib/format';
import { categoryLabels, PRIORITY_LABEL, STATUS_LABEL, SupportThread } from '@/components/SupportThread';
import { Badge, Button, Card, EmptyState, Field, Input, Loading, PageHeader, Select, Textarea, Toggle } from '@/components/ui';

/** Support prioritaire : tickets, conversation avec l'équipe Event509 et suivi de résolution. */
export default function Support() {
  const { t, lang, toast } = useApp();
  useTitle(t('Support prioritaire'));
  const list = useAsync(() => (DEMO ? Promise.resolve(null) : getSupport()), []);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState({ subject: '', body: '', category: 'technical', eventDay: false });
  const [busy, setBusy] = useState(false);
  const thread = useAsync(() => (open ? getSupportTicket(open) : Promise.resolve(null)), [open]);
  if (DEMO) return <EmptyState icon={<Lock className="h-5 w-5" />} title={t('Programme disponible sur le site en ligne')} body={t('Le support prioritaire nécessite le serveur.')} />;
  if (!list.data) return <Loading />;
  const { canCreate, tickets } = list.data;

  const create = async () => {
    setBusy(true);
    try {
      const r = await createSupportTicket(f);
      toast(t('Demande envoyée : vous serez prévenu de la réponse'));
      setCreating(false);
      setF({ subject: '', body: '', category: 'technical', eventDay: false });
      list.reload();
      setOpen(r.id);
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Envoi impossible. Réessayez.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={t('Support prioritaire')} subtitle={t('Un canal d’assistance réservé aux organisateurs vérifiés, traité en priorité.')}
        actions={canCreate ? <Button onClick={() => { setCreating(true); setOpen(null); }}><Plus className="h-4 w-4" aria-hidden /> {t('Nouvelle demande')}</Button> : undefined} />

      {!canCreate && (
        <Card className="flex flex-wrap items-center gap-3">
          <Headphones className="h-5 w-5 text-ink-muted" aria-hidden />
          <p className="min-w-0 flex-1 text-sm text-ink-soft">{t('Le support prioritaire est réservé aux organisateurs vérifiés. Vous pouvez toujours consulter et compléter vos demandes existantes.')}</p>
          <Link to="/organisateur-verifie" className="text-sm font-semibold text-brand-ink">{t('Découvrir le programme')}</Link>
        </Card>
      )}

      {creating && (
        <Card>
          <h2 className="mb-3 font-bold">{t('Nouvelle demande')}</h2>
          <div className="space-y-4">
            <Field label={t('Objet')} required><Input maxLength={140} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
            <Field label={t('Catégorie')}><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{Object.entries(categoryLabels).map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}</Select></Field>
            <Field label={t('Votre demande')} required><Textarea rows={5} maxLength={4000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
            <Toggle checked={f.eventDay} onChange={(v) => setF({ ...f, eventDay: v })} label={t('Mon événement a lieu en ce moment')} description={t('Assistance technique pendant l’événement : traitée en urgence.')} />
            <div className="flex gap-2"><Button loading={busy} onClick={create}>{t('Envoyer')}</Button><Button variant="ghost" onClick={() => setCreating(false)}>{t('Annuler')}</Button></div>
          </div>
        </Card>
      )}

      {open && thread.data && !creating && (
        <Card>
          <Button variant="ghost" size="sm" className="mb-2" onClick={() => setOpen(null)}>{t('← Toutes les demandes')}</Button>
          <SupportThread ticket={thread.data.ticket} messages={thread.data.messages} viewer="organizer"
            onReply={async (body) => { await replySupport(open, body); thread.reload(); list.reload(); toast(t('Message envoyé')); }}
            onResolve={async () => { await resolveSupport(open); thread.reload(); list.reload(); toast(t('Demande marquée comme résolue')); }} />
        </Card>
      )}

      {!open && !creating && (!tickets.length ? (
        <EmptyState icon={<Headphones className="h-5 w-5" />} title={t('Aucune demande')} body={canCreate ? t('Une question, un souci pendant un événement ? Écrivez-nous.') : undefined} />
      ) : (
        <ul className="space-y-2">
          {tickets.map((k) => (
            <li key={k.id}>
              <button type="button" onClick={() => setOpen(k.id)} className="flex w-full flex-wrap items-center gap-3 rounded-2xl bg-surface p-3 text-left shadow-card hover:ring-1 hover:ring-brand-200">
                <span className="min-w-0 flex-1"><span className="block truncate font-bold">{k.subject}</span><span className="text-xs text-ink-muted">{t(categoryLabels[k.category] ?? k.category)} · {relative(k.updatedAt, lang)}</span></span>
                <Badge tone={PRIORITY_LABEL[k.priority].tone}>{t(PRIORITY_LABEL[k.priority].l)}</Badge>
                <Badge tone={STATUS_LABEL[k.status].tone}>{t(STATUS_LABEL[k.status].l)}</Badge>
              </button>
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

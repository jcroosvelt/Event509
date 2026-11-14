import { useState } from 'react';
import { LifeBuoy } from 'lucide-react';
import { useApp } from '@/store/app';
import { useAsync, useTitle } from '@/lib/hooks';
import { ApiError } from '@/lib/errors';
import { adminDecideRecovery, adminRecoveryRequests, type AdminRecoveryRequest } from '@/services/api';
import { dateShort } from '@/lib/format';
import { Badge, Button, Card, EmptyState, Field, Loading, Modal, PageHeader } from '@/components/ui';

const TONE: Record<string, 'amber' | 'green' | 'red' | 'gray'> = { pending: 'amber', approved: 'green', rejected: 'red', blocked: 'red', cancelled: 'gray', completed: 'gray' };

/** Demandes de récupération de compte avec assistance : examen, décision motivée, délai de sécurité. L'administrateur ne change jamais l'identité Google lui-même. */
export default function RecoveryRequests() {
  const { t, lang, toast } = useApp();
  useTitle(t('Récupérations de compte'));
  const { data, loading, reload } = useAsync(() => adminRecoveryRequests(), []);
  const [sel, setSel] = useState<AdminRecoveryRequest | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const labels: Record<string, string> = { pending: t('En attente'), approved: t('Approuvée'), rejected: t('Refusée'), blocked: t('Bloquée'), cancelled: t('Annulée'), completed: t('Terminée') };

  const decide = async (action: 'approve' | 'reject' | 'block') => {
    if (!sel) return;
    setBusy(true);
    try {
      await adminDecideRecovery(sel.id, action, note);
      toast(t('Décision enregistrée'));
      setSel(null);
      setNote('');
      reload();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : '';
      toast(code === 'reauth_required' ? t('Reconnectez-vous pour confirmer votre identité, puis recommencez.') : e instanceof ApiError ? e.message : t('Une erreur est survenue.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loading />;
  return (
    <div className="space-y-4">
      <PageHeader title={t('Récupérations de compte')} subtitle={t('Chaque approbation ouvre un délai de sécurité de 48 h ; le titulaire est prévenu et peut annuler. Vous ne pouvez pas changer le compte Google d’un utilisateur : c’est lui qui s’authentifie avec le nouveau compte.')} />
      {!data?.length ? <EmptyState icon={<LifeBuoy className="h-5 w-5" aria-hidden />} title={t('Aucune demande')} body={t('Les demandes d’assistance apparaîtront ici.')} /> : (
        <ul className="space-y-3">
          {data.map((r) => (
            <li key={r.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold">{r.name ?? t('Compte introuvable')} <span className="font-normal text-ink-muted">{r.email ?? r.identifier}</span></div>
                    <div className="text-xs text-ink-muted">{t('Déposée le {date}', { date: dateShort(r.created_at, lang) })} · {t('{n} événement(s) de sécurité cette semaine', { n: Number(r.recent_events) })}</div>
                  </div>
                  <Badge tone={TONE[r.status] ?? 'gray'}>{labels[r.status] ?? r.status}</Badge>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm">{r.reason}</p>
                {r.contact && <p className="mt-1 text-xs text-ink-muted">{t('Contact indiqué : {c}', { c: r.contact })}</p>}
                {r.note && <p className="mt-2 text-xs text-ink-soft">{t('Décision')} ({r.decided_by ?? '—'}) : {r.note}</p>}
                {r.execute_after && r.status === 'approved' && <p className="mt-1 text-xs text-ink-soft">{t('Utilisable à partir du {date}', { date: new Date(r.execute_after).toLocaleString() })}</p>}
                {r.status === 'pending' && <Button className="mt-3" size="sm" onClick={() => { setSel(r); setNote(''); }}>{t('Examiner')}</Button>}
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!sel} onClose={() => setSel(null)} title={t('Décision sur la demande')} description={t('Vérifiez l’identité par un canal indépendant avant d’approuver. Votre motif est conservé dans le journal.')}>
        <Field label={t('Motif de la décision')} hint={t('10 caractères minimum')}><textarea className="min-h-24 w-full rounded-2xl border border-line bg-surface p-3 text-sm" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button loading={busy} disabled={note.trim().length < 10 || !sel?.user_id} onClick={() => decide('approve')}>{t('Approuver (délai de 48 h)')}</Button>
          <Button variant="outline" loading={busy} disabled={note.trim().length < 10} onClick={() => decide('reject')}>{t('Refuser')}</Button>
          <Button variant="danger" loading={busy} disabled={note.trim().length < 10} onClick={() => decide('block')}>{t('Bloquer (suspect)')}</Button>
        </div>
      </Modal>
    </div>
  );
}

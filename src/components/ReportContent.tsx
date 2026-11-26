import { useState } from 'react';
import { Flag } from 'lucide-react';
import { useApp } from '@/store/app';
import { REPORT_REASONS, reportContent, type ReportKind, type ReportReason } from '@/services/community';
import { Button, Field, Modal, Select, Textarea } from '@/components/ui';

const LABELS: Record<ReportReason, string> = { spam: 'Publicité ou spam', abuse: 'Insultes ou harcèlement', inappropriate: 'Contenu inapproprié', scam: 'Arnaque ou fraude', other: 'Autre motif' };

/** Signaler un commentaire, une photo ou un message : l'administration examine ; à 3 signalements différents un contenu public est masqué. */
export function ReportContent({ kind, targetId, className, label }: { kind: ReportKind; targetId: string; className?: string; label?: string }) {
  const { t, user, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>('inappropriate');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const send = async () => {
    setBusy(true);
    try {
      await reportContent(kind, targetId, reason, note.trim() || undefined);
      toast(t('Merci, le signalement a été transmis à l’équipe.'));
      setOpen(false);
      setNote('');
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Le signalement n’a pas pu être envoyé. Réessayez.'), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className={className ?? 'hover:text-ink'} onClick={() => setOpen(true)}><Flag className="mr-1 inline h-3 w-3" aria-hidden />{label ?? t('Signaler')}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('Signaler ce contenu')} size="sm"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>{t('Annuler')}</Button><Button loading={busy} onClick={() => void send()}>{t('Envoyer le signalement')}</Button></>}>
        <div className="space-y-3">
          <Field label={t('Motif')}>
            <Select value={reason} onChange={(e) => setReason(e.target.value as ReportReason)}>{REPORT_REASONS.map((r) => <option key={r} value={r}>{t(LABELS[r])}</option>)}</Select>
          </Field>
          <Field label={t('Précisions (facultatif)')}><Textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
      </Modal>
    </>
  );
}

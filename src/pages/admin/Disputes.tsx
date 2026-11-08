import { useState } from 'react';
import { Gavel, MessageSquare } from 'lucide-react';
import { listDisputes, resolveDispute } from '@/services/api';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { moneyRaw, relative } from '@/lib/format';
import { useForm } from '@/lib/form';
import { Badge, Button, Card, EmptyState, Field, IconBadge, Loading, Modal, PageHeader, Select, Textarea, type Tone } from '@/components/ui';
import type { Dispute } from '@/types';

const st: Record<Dispute['status'], { l: string; tone: Tone }> = {
  open: { l: 'Ouvert', tone: 'red' },
  investigating: { l: 'En enquête', tone: 'amber' },
  resolved: { l: 'Résolu', tone: 'green' },
};
const decisions = ['Rembourser le participant (débit organisateur)', 'Remboursement partiel 50 %', 'Rejeter la réclamation'];

export default function Disputes() {
  const { toast, lang, t } = useApp();
  useTitle(t('Litiges'));
  const { data, loading, reload } = useAsync(() => listDisputes(), []);
  const [open, setOpen] = useState<Dispute | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useForm({ decision: decisions[0], note: '' }, { note: (v) => (String(v).trim().length < 5 ? t('Notez les éléments vérifiés pour garder une trace') : undefined) });

  if (loading) return <Loading />;
  const resolve = async (status: Dispute['status']) => {
    if (!open) return;
    if (status === 'resolved' && !form.validate()) return;
    setBusy(true);
    await resolveDispute(open.id, status);
    setBusy(false);
    setOpen(null);
    toast(status === 'resolved' ? t('Litige résolu : les deux parties sont prévenues') : t('Litige passé en enquête'));
    reload();
  };

  return (
    <div>
      <PageHeader title={t('Litiges')} subtitle={t('Médiation entre participants et organisateurs.')} />
      {!data?.length ? (
        <EmptyState icon={<Gavel className="h-5 w-5" />} title={t('Aucun litige')} />
      ) : (
        <ul className="space-y-3">
          {data.map((d) => (
            <li key={d.id}>
              <Card className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <IconBadge tone={d.status === 'resolved' ? 'green' : 'red'}><Gavel className="h-[18px] w-[18px]" /></IconBadge>
                <div className="min-w-0 flex-1">
                  <h2 className="font-bold">{d.subject}</h2>
                  <p className="text-sm text-ink-soft">{t('{a} contre {b}', { a: d.opener, b: d.against })} · {d.orderId} · {relative(d.createdAt, lang)}</p>
                </div>
                <div className="font-extrabold">{moneyRaw(d.amount, d.currency, lang)}</div>
                <Badge tone={st[d.status].tone}>{t(st[d.status].l)}</Badge>
                {d.status !== 'resolved' && <Button size="sm" variant="outline" onClick={() => { form.reset(); setOpen(d); }}>{t('Traiter')}</Button>}
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        title={t('Litige {id}', { id: open?.orderId ?? '' })}
        footer={
          <>
            <Button variant="outline" className="flex-1" onClick={() => resolve('investigating')} loading={busy}>{t('Mettre en enquête')}</Button>
            <Button className="flex-1" onClick={() => resolve('resolved')} loading={busy}>{t('Appliquer la décision')}</Button>
          </>
        }
      >
        {open && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-canvas p-4 text-sm">
              <div className="mb-1 flex items-center gap-2 font-semibold"><MessageSquare className="h-4 w-4" aria-hidden /> {open.opener}</div>
              <p className="text-ink-soft">« {open.subject}. {t('J’ai contacté l’organisateur sans réponse depuis 5 jours.')} »</p>
            </div>
            <Field label={t('Décision')}>
              <Select {...form.bind('decision')}>{decisions.map((d) => <option key={d} value={d}>{t(d)}</option>)}</Select>
            </Field>
            <Field label={t('Note interne')} error={form.errors.note} required><Textarea placeholder={t('Éléments vérifiés, preuves…')} {...form.bind('note')} /></Field>
          </div>
        )}
      </Modal>
    </div>
  );
}

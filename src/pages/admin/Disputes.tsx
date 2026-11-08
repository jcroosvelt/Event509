import { useState } from 'react';
import { Gavel, Send } from 'lucide-react';
import { addDisputeMessage, listDisputes, resolveDispute } from '@/services/api';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { cx, dateShort, moneyRaw, relative, time } from '@/lib/format';
import { useForm } from '@/lib/form';
import { Badge, Button, Card, EmptyState, Field, IconBadge, Loading, Modal, PageHeader, Segmented, Select, Textarea, type Tone } from '@/components/ui';
import type { Dispute } from '@/types';

const st: Record<Dispute['status'], { l: string; tone: Tone }> = {
  open: { l: 'Ouvert', tone: 'red' },
  investigating: { l: 'En enquête', tone: 'amber' },
  resolved: { l: 'Résolu', tone: 'green' },
};
const decisionLabel: Record<NonNullable<Dispute['decision']>, string> = {
  refund_full: 'Rembourser le participant (débit organisateur)',
  refund_half: 'Remboursement partiel 50 %',
  reject: 'Rejeter la réclamation',
};

export default function Disputes() {
  const { toast, lang, t } = useApp();
  useTitle(t('Litiges'));
  const { data, loading, reload } = useAsync(() => listDisputes(), []);
  const [tab, setTab] = useState<'open' | 'resolved'>('open');
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useForm({ decision: 'refund_full', note: '' }, { note: (v) => (String(v).trim().length < 5 ? t('Expliquez la décision aux deux parties') : undefined) });
  const msg = useForm({ body: '' }, { body: (v) => (!String(v).trim() ? t('Écrivez un message') : undefined) });

  if (loading) return <Loading />;
  const all = data ?? [];
  const list = all.filter((d) => (tab === 'open' ? d.status !== 'resolved' : d.status === 'resolved'));
  const open = all.find((d) => d.id === openId) ?? null;

  const resolve = async (status: Dispute['status']) => {
    if (!open) return;
    if (status === 'resolved' && !form.validate()) return;
    setBusy(true);
    await resolveDispute(open.id, { status, decision: status === 'resolved' ? (form.values.decision as Dispute['decision']) : undefined, note: form.values.note || undefined });
    setBusy(false);
    setOpenId(null);
    toast(status === 'resolved' ? t('Litige résolu : les deux parties sont prévenues') : t('Litige passé en enquête'));
    reload();
  };
  const send = async () => {
    if (!open || !msg.validate()) return;
    await addDisputeMessage(open.id, msg.values.body.trim());
    msg.reset();
    reload();
  };
  const amountFor = (d: Dispute, decision: string) => (decision === 'refund_full' ? d.amount : decision === 'refund_half' ? Math.round(d.amount / 2) : 0);

  return (
    <div>
      <PageHeader title={t('Litiges')} subtitle={t('Médiation entre participants et organisateurs.')} />
      <Segmented label={t('Filtre')} className="mb-5" value={tab} onChange={setTab} options={[{ value: 'open', label: t('En cours ({n})', { n: all.filter((d) => d.status !== 'resolved').length }) }, { value: 'resolved', label: t('Résolus') }]} />
      {!list.length ? (
        <EmptyState icon={<Gavel className="h-5 w-5" />} title={tab === 'open' ? t('Aucun litige en cours') : t('Aucun litige résolu')} />
      ) : (
        <ul className="space-y-3">
          {list.map((d) => (
            <li key={d.id}>
              <Card className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <IconBadge tone={d.status === 'resolved' ? 'green' : 'red'}><Gavel className="h-[18px] w-[18px]" /></IconBadge>
                <div className="min-w-0 flex-1">
                  <h2 className="font-bold">{d.subject}</h2>
                  <p className="text-sm text-ink-soft">{t('{a} contre {b}', { a: d.opener, b: d.against })} · {d.orderId} · {relative(d.createdAt, lang)}</p>
                  {d.decision && <p className="text-xs text-ink-muted">{t(decisionLabel[d.decision])}{d.refunded ? ` · ${t('remboursé : {amount}', { amount: moneyRaw(d.refunded, d.currency, lang) })}` : ''}</p>}
                </div>
                <div className="font-extrabold">{moneyRaw(d.amount, d.currency, lang)}</div>
                <Badge tone={st[d.status].tone}>{t(st[d.status].l)}</Badge>
                <Button size="sm" variant="outline" onClick={() => { form.reset(); msg.reset(); setOpenId(d.id); }}>{d.status === 'resolved' ? t('Voir') : t('Traiter')}</Button>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={!!open}
        onClose={() => setOpenId(null)}
        title={open ? `${open.subject} · ${open.orderId}` : ''}
        size="lg"
        footer={
          open && open.status !== 'resolved' ? (
            <>
              {open.status === 'open' && <Button variant="outline" className="flex-1" onClick={() => resolve('investigating')} loading={busy}>{t('Mettre en enquête')}</Button>}
              <Button className="flex-1" onClick={() => resolve('resolved')} loading={busy}>{t('Appliquer la décision')}</Button>
            </>
          ) : undefined
        }
      >
        {open && (
          <div className="space-y-5">
            <ol className="space-y-3" aria-label={t('Échanges')}>
              {open.messages.map((m, i) => (
                <li key={i} className={cx('max-w-[85%] rounded-2xl p-3 text-sm', m.from === 'admin' ? 'ml-auto bg-brand-100' : m.from === 'against' ? 'bg-amber-50' : 'bg-canvas')}>
                  <div className="mb-0.5 flex justify-between gap-3 text-xs font-semibold text-ink-soft">
                    <span>{m.author}</span>
                    <span className="font-normal text-ink-muted">{dateShort(m.at, lang)} {time(m.at, lang)}</span>
                  </div>
                  {m.body}
                </li>
              ))}
            </ol>

            {open.status !== 'resolved' ? (
              <>
                <form noValidate onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-end gap-2">
                  <Field label={t('Message aux deux parties')} error={msg.errors.body} className="flex-1"><Textarea className="min-h-[60px]" {...msg.bind('body')} /></Field>
                  <Button type="submit" variant="dark" aria-label={t('Envoyer le message')}><Send className="h-4 w-4" aria-hidden /></Button>
                </form>
                <div className="space-y-4 rounded-2xl border border-line p-4">
                  <Field label={t('Décision')} hint={t('Montant remboursé : {amount}', { amount: moneyRaw(amountFor(open, form.values.decision), open.currency, lang) })}>
                    <Select {...form.bind('decision')}>{(Object.keys(decisionLabel) as (keyof typeof decisionLabel)[]).map((d) => <option key={d} value={d}>{t(decisionLabel[d])}</option>)}</Select>
                  </Field>
                  <Field label={t('Explication de la décision')} error={form.errors.note} hint={t('Envoyée aux deux parties et conservée dans le dossier')} required>
                    <Textarea placeholder={t('Éléments vérifiés, preuves…')} {...form.bind('note')} />
                  </Field>
                </div>
              </>
            ) : (
              <p className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-700">
                {open.decision && t(decisionLabel[open.decision])}{open.refunded ? ` — ${t('remboursé : {amount}', { amount: moneyRaw(open.refunded, open.currency, lang) })}` : ''}
                {open.note && <><br />{open.note}</>}
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

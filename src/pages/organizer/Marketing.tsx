import { useState } from 'react';
import { CalendarClock, Mail, MessageCircle, MessageSquare, Plus, Send } from 'lucide-react';
import { listCampaigns, saveCampaign } from '@/services/api';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { compact, cx, dateShort, num, time, uid } from '@/lib/format';
import { useForm } from '@/lib/form';
import { Badge, Button, Card, EmptyState, Field, IconBadge, Input, Loading, Modal, PageHeader, Select, StatCard, Table, Td, Textarea, type Tone } from '@/components/ui';
import type { Campaign } from '@/types';

const channel: Record<Campaign['channel'], { l: string; i: typeof Mail; tone: Tone; limit: number }> = {
  email: { l: 'Email', i: Mail, tone: 'brand', limit: 5000 },
  sms: { l: 'SMS', i: MessageSquare, tone: 'orange', limit: 160 },
  whatsapp: { l: 'WhatsApp', i: MessageCircle, tone: 'green', limit: 1000 },
};
const status: Record<Campaign['status'], { l: string; tone: Tone }> = {
  draft: { l: 'Brouillon', tone: 'gray' },
  scheduled: { l: 'Programmée', tone: 'amber' },
  sent: { l: 'Envoyée', tone: 'green' },
};
const audiences = [
  { label: 'Participants — Festival Kompa Live 2026', size: 3054 },
  { label: 'Tous mes abonnés', size: 12400 },
  { label: 'Acheteurs des 12 derniers mois', size: 8420 },
  { label: 'Paniers abandonnés', size: 312 },
  { label: 'Ville : Port-au-Prince', size: 5100 },
];

export default function Marketing() {
  const { lang, toast, t } = useApp();
  useTitle(t('Campagnes'));
  const { data, loading, reload } = useAsync(() => listCampaigns(), []);
  const [open, setOpen] = useState(false);
  const [ch, setCh] = useState<Campaign['channel']>('whatsapp');
  const [busy, setBusy] = useState<'send' | 'schedule' | 'draft' | null>(null);
  const form = useForm(
    { name: '', audience: '0', subject: '', body: '', when: '' },
    {
      name: (v) => (!String(v).trim() ? t('Donnez un nom à la campagne') : undefined),
      subject: (v) => (ch === 'email' && !String(v).trim() ? t('Indiquez l’objet de l’email') : undefined),
      body: (v) => (String(v).trim().length < 10 ? t('Écrivez un message d’au moins 10 caractères') : undefined),
    },
  );

  if (loading) return <Loading />;
  const list = data ?? [];
  const sent = list.reduce((a, c) => a + c.sent, 0);
  const opened = list.reduce((a, c) => a + c.opened, 0);
  const clicks = list.reduce((a, c) => a + c.clicks, 0);
  const limit = channel[ch].limit;
  const aud = audiences[Number(form.values.audience)];

  const start = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(17, 0, 0, 0);
    form.reset({ name: '', audience: '0', subject: '', body: '', when: `${d.toISOString().slice(0, 11)}17:00` });
    setOpen(true);
  };

  const submit = async (mode: 'send' | 'schedule' | 'draft') => {
    if (mode !== 'draft' && !form.validate()) return;
    if (mode === 'schedule' && (!form.values.when || new Date(form.values.when) < new Date())) {
      form.setErrors({ when: t('Choisissez une date et une heure à venir') });
      return;
    }
    setBusy(mode);
    const c: Campaign = {
      id: uid('c'), name: form.values.name || t('Sans titre'), channel: ch, audience: `${t(aud.label)} (${num(aud.size, lang)})`, body: form.values.body,
      status: mode === 'send' ? 'sent' : mode === 'schedule' ? 'scheduled' : 'draft',
      sent: mode === 'send' ? aud.size : 0, opened: 0, clicks: 0,
      date: mode === 'schedule' ? form.values.when : new Date().toISOString(),
    };
    await saveCampaign(c);
    setBusy(null);
    setOpen(false);
    toast(mode === 'send' ? t('Campagne envoyée à {n} personnes', { n: num(aud.size, lang) }) : mode === 'schedule' ? t('Campagne programmée le {date}', { date: `${dateShort(c.date, lang)} ${time(c.date, lang)}` }) : t('Brouillon enregistré'));
    reload();
  };

  return (
    <div>
      <PageHeader title={t('Marketing intégré')} subtitle={t('Emailing, campagnes SMS et WhatsApp vers vos participants et abonnés.')} actions={<Button onClick={start}><Plus className="h-4 w-4" aria-hidden /> {t('Nouvelle campagne')}</Button>} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('Messages envoyés')} value={compact(sent, lang)} icon={<Send className="h-[18px] w-[18px]" />} />
        <StatCard label={t('Taux d’ouverture')} value={sent ? Math.round((opened / sent) * 100) : 0} unit="%" tone="green" />
        <StatCard label={t('Clics')} value={num(clicks, lang)} tone="violet" />
        <StatCard label={t('Ventes attribuées')} value="412" unit={t('billets')} tone="orange" />
      </div>
      {!list.length ? (
        <EmptyState icon={<Send className="h-5 w-5" />} title={t('Aucune campagne')} action={<Button onClick={start}>{t('Nouvelle campagne')}</Button>} />
      ) : (
        <Card>
          <Table caption={t('Campagnes')} head={[t('Campagne'), t('Canal'), t('Audience'), t('Date'), t('Ouverture'), t('Clics'), t('Statut')]}>
            {list.map((c) => {
              const C = channel[c.channel];
              return (
                <tr key={c.id}>
                  <Td className="font-semibold">{c.name}</Td>
                  <Td><span className="flex items-center gap-2"><IconBadge size="sm" tone={C.tone}><C.i className="h-4 w-4" /></IconBadge>{t(C.l)}</span></Td>
                  <Td className="text-ink-soft">{c.audience}</Td>
                  <Td className="text-ink-soft">{dateShort(c.date, lang)} {c.status === 'scheduled' && time(c.date, lang)}</Td>
                  <Td>{c.sent ? `${Math.round((c.opened / c.sent) * 100)} %` : '—'}</Td>
                  <Td>{c.sent ? num(c.clicks, lang) : '—'}</Td>
                  <Td><Badge tone={status[c.status].tone}>{t(status[c.status].l)}</Badge></Td>
                </tr>
              );
            })}
          </Table>
        </Card>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('Nouvelle campagne')}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => submit('draft')} loading={busy === 'draft'}>{t('Brouillon')}</Button>
            <Button variant="outline" className="flex-1" onClick={() => submit('schedule')} loading={busy === 'schedule'}><CalendarClock className="h-4 w-4" aria-hidden /> {t('Programmer')}</Button>
            <Button className="flex-1" onClick={() => submit('send')} loading={busy === 'send'}><Send className="h-4 w-4" aria-hidden /> {t('Envoyer')}</Button>
          </>
        }
      >
        <form noValidate onSubmit={(e) => { e.preventDefault(); submit('send'); }} className="space-y-4">
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('Canal')}>
            {(Object.keys(channel) as Campaign['channel'][]).map((k) => {
              const C = channel[k];
              return (
                <button key={k} type="button" role="radio" aria-checked={ch === k} onClick={() => setCh(k)} className={cx('flex flex-col items-center gap-2 rounded-2xl border p-4 text-sm font-semibold', ch === k ? 'border-brand bg-brand-50' : 'border-line')}>
                  <IconBadge tone={C.tone}><C.i className="h-[18px] w-[18px]" /></IconBadge>{t(C.l)}
                </button>
              );
            })}
          </div>
          <Field label={t('Nom de la campagne')} error={form.errors.name} hint={t('Visible par vous seul')} required><Input placeholder={t('Ex. Relance J-7')} {...form.bind('name')} /></Field>
          <Field label={t('Audience')}>
            <Select {...form.bind('audience')}>
              {audiences.map((a, i) => <option key={a.label} value={i}>{t(a.label)} ({num(a.size, lang)})</option>)}
            </Select>
          </Field>
          {ch === 'email' && <Field label={t('Objet')} error={form.errors.subject} required><Input {...form.bind('subject')} /></Field>}
          <Field label={t('Message')} error={form.errors.body} hint={`${form.values.body.length}/${limit}${ch === 'sms' ? ` · ${Math.max(1, Math.ceil(form.values.body.length / 160))} SMS` : ''}`} required>
            <Textarea {...form.bind('body')} onChange={(e) => form.set('body', e.target.value.slice(0, limit))} placeholder={t('Ex. Plus que quelques billets VIP ! Réservez ici : event509.com/e/…')} />
          </Field>
          <Field label={t('Date d’envoi programmé')} error={form.errors.when} hint={t('Utilisée si vous choisissez « Programmer »')}>
            <Input type="datetime-local" {...form.bind('when')} />
          </Field>
          <div className="rounded-2xl bg-canvas p-4">
            <div className="mb-2 text-xs font-semibold text-ink-muted">{t('Aperçu')}</div>
            <div className={cx('max-w-xs whitespace-pre-line rounded-2xl p-3 text-sm', ch === 'whatsapp' ? 'bg-[#DCF8C6] text-[#0B1533]' : 'bg-surface')}>{form.values.body || t('Votre message apparaîtra ici.')}</div>
          </div>
        </form>
      </Modal>
    </div>
  );
}

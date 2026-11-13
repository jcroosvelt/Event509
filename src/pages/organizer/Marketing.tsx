import { useState } from 'react';
import { Info, Mail, MessageCircle, MessageSquare, Plus, Send } from 'lucide-react';
import { listAttendees, listCampaigns, listOrganizerEvents, saveCampaign } from '@/services/api';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { cx, dateShort, num, uid } from '@/lib/format';
import { orgOf } from '@/lib/permissions';
import { CampaignSend } from './CampaignSend';
import { useForm } from '@/lib/form';
import { Badge, Button, Card, EmptyState, Field, IconBadge, Input, Loading, Modal, PageHeader, Select, Table, Td, Textarea, type Tone } from '@/components/ui';
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

/**
 * Campagnes : pour l'instant, on prépare et on enregistre des brouillons. L'envoi d'emails, de SMS et de
 * messages WhatsApp n'est pas encore branché, donc rien ne part et aucun chiffre d'envoi n'est affiché.
 * Les audiences sont calculées à partir des vrais participants de l'organisation.
 */
export default function Marketing() {
  const { toast, t, user, lang } = useApp();
  useTitle(t('Campagnes'));
  const orgId = orgOf(user);
  const { data, loading, reload } = useAsync(() => Promise.all([listCampaigns(), listOrganizerEvents(orgId), listAttendees()]), [orgId]);
  const [open, setOpen] = useState(false);
  const [ch, setCh] = useState<Campaign['channel']>('email');
  const [busy, setBusy] = useState(false);
  const form = useForm(
    { name: '', audience: 'all', subject: '', body: '' },
    {
      name: (v) => (!String(v).trim() ? t('Donnez un nom à la campagne') : undefined),
      subject: (v) => (ch === 'email' && !String(v).trim() ? t('Indiquez l’objet de l’email') : undefined),
      body: (v) => (String(v).trim().length < 5 ? t('Écrivez le message') : undefined),
    },
  );

  if (loading || !data) return <Loading />;
  const [list, events, attendees] = data;
  const limit = channel[ch].limit;
  // Audiences réelles : tous les participants (adresses distinctes), puis les participants de chaque événement
  const unique = (a: typeof attendees) => new Set(a.map((x) => x.email.toLowerCase())).size;
  const audiences = [
    { key: 'all', label: t('Tous mes participants'), size: unique(attendees) },
    ...events.map((e) => ({ key: e.id, label: t('Participants — {event}', { event: e.title }), size: unique(attendees.filter((a) => a.eventId === e.id)) })).filter((a) => a.size > 0),
  ];
  const aud = audiences.find((a) => a.key === form.values.audience) ?? audiences[0];

  const start = () => {
    form.reset({ name: '', audience: 'all', subject: '', body: '' });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.validate()) return;
    setBusy(true);
    const c: Campaign = {
      id: uid('c'), name: form.values.name.trim(), channel: ch, audience: `${aud.label} (${num(aud.size, lang)})`, body: form.values.body,
      status: 'draft', sent: 0, opened: 0, clicks: 0, date: new Date().toISOString(),
    };
    try {
      await saveCampaign(c);
      setOpen(false);
      toast(t('Brouillon enregistré'));
      reload();
    } catch {
      toast(t('L’enregistrement a échoué. Réessayez.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const notice = (
    <p role="note" className="mb-6 flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{t('L’envoi des campagnes (email, SMS, WhatsApp) n’est pas encore activé : vous pouvez préparer et enregistrer vos brouillons, ils partiront dès que l’envoi sera branché. Seul l’email qui accompagne chaque billet acheté est envoyé aujourd’hui.')}</span>
    </p>
  );

  return (
    <div>
      <PageHeader title={t('Marketing intégré')} subtitle={t('Préparez des messages pour vos participants.')} actions={<Button onClick={start}><Plus className="h-4 w-4" aria-hidden /> {t('Nouvelle campagne')}</Button>} />
      <CampaignSend />
      {notice}
      {!list.length ? (
        <EmptyState icon={<Send className="h-5 w-5" />} title={t('Aucune campagne')} action={<Button onClick={start}>{t('Nouvelle campagne')}</Button>} />
      ) : (
        <Card>
          <Table caption={t('Campagnes')} head={[t('Campagne'), t('Canal'), t('Audience'), t('Date'), t('Statut')]}>
            {list.map((c) => {
              const C = channel[c.channel];
              return (
                <tr key={c.id}>
                  <Td className="font-semibold">{c.name}</Td>
                  <Td><span className="flex items-center gap-2"><IconBadge size="sm" tone={C.tone}><C.i className="h-4 w-4" /></IconBadge>{t(C.l)}</span></Td>
                  <Td className="text-ink-soft">{c.audience}</Td>
                  <Td className="text-ink-soft">{dateShort(c.date, lang)}</Td>
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
        footer={<Button className="flex-1" onClick={submit} loading={busy}>{t('Enregistrer le brouillon')}</Button>}
      >
        <form noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-4">
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
              {audiences.map((a) => <option key={a.key} value={a.key}>{a.label} ({num(a.size, lang)})</option>)}
            </Select>
          </Field>
          {ch === 'email' && <Field label={t('Objet')} error={form.errors.subject} required><Input {...form.bind('subject')} /></Field>}
          <Field label={t('Message')} error={form.errors.body} hint={`${form.values.body.length}/${limit}${ch === 'sms' ? ` · ${Math.max(1, Math.ceil(form.values.body.length / 160))} SMS` : ''}`} required>
            <Textarea {...form.bind('body')} onChange={(e) => form.set('body', e.target.value.slice(0, limit))} placeholder={t('Ex. Plus que quelques billets ! Réservez ici : {lien}')} />
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

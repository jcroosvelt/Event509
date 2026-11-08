import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Download, FileSpreadsheet, Mail, Search, Star, Users } from 'lucide-react';
import { events } from '@/data/mock';
import { listAttendees } from '@/services/api';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { dateNumeric, moneyRaw, num, time } from '@/lib/format';
import { exportCSV, exportExcel } from '@/lib/export';
import { orgOf } from '@/lib/permissions';
import { useForm } from '@/lib/form';
import { Avatar, Badge, Button, Card, Field, Input, Loading, Modal, PageHeader, Pager, Segmented, Select, StatCard, Table, Td, Textarea } from '@/components/ui';

const PER = 12;

export default function Attendees() {
  const { lang, toast, t, user } = useApp();
  useTitle(t('Participants'));
  const myEvents = events.filter((e) => e.organizerId === orgOf(user));
  const [params, setParams] = useSearchParams();
  const eventId = params.get('e') ?? myEvents[0]?.id ?? '';
  const ev = myEvents.find((e) => e.id === eventId);
  const { data, loading } = useAsync(() => listAttendees(eventId), [eventId]);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState<'all' | 'in' | 'out'>('all');
  const [page, setPage] = useState(0);
  const [msgOpen, setMsgOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const msg = useForm(
    { subject: '', body: '' },
    {
      subject: (v) => (!String(v).trim() ? t('Indiquez un objet') : undefined),
      body: (v) => (String(v).trim().length < 10 ? t('Écrivez un message d’au moins 10 caractères') : undefined),
    },
  );

  const list = useMemo(
    () =>
      (data ?? []).filter(
        (a) =>
          (!q || `${a.name} ${a.email} ${a.code} ${a.orderId}`.toLowerCase().includes(q.toLowerCase())) &&
          (!type || a.ticketType === type) &&
          (status === 'all' || (status === 'in' ? a.checkedIn : !a.checkedIn)),
      ),
    [data, q, type, status],
  );
  if (loading) return <Loading />;
  const all = data ?? [];
  const types = [...new Set(all.map((a) => a.ticketType))];
  const inCount = all.filter((a) => a.checkedIn).length;
  const rows = () =>
    list.map((a) => ({
      [t('Nom')]: a.name, [t('Email')]: a.email, [t('Téléphone')]: a.phone, [t('Billet')]: a.ticketType, [t('Commande')]: a.orderId, [t('Code')]: a.code,
      [t('Montant')]: a.amount, [t('Acheté le')]: dateNumeric(a.purchasedAt, lang), [t('Entré')]: a.checkedIn ? t('Oui') : t('Non'),
    }));
  const pages = Math.max(1, Math.ceil(list.length / PER));
  const file = `participants-${ev?.slug ?? 'event509'}`;

  const send = async () => {
    if (!msg.validate()) return;
    setSending(true);
    await new Promise((r) => setTimeout(r, 600));
    setSending(false);
    setMsgOpen(false);
    msg.reset();
    toast(list.length > 1 ? t('Message envoyé à {n} participants', { n: list.length }) : t('Message envoyé à {n} participant', { n: list.length }));
  };

  return (
    <div>
      <PageHeader
        title={t('Participants')}
        subtitle={ev?.title}
        actions={
          <>
            <Button variant="outline" onClick={() => { msg.reset({ subject: t('Mise à jour : {event}', { event: ev?.title ?? '' }), body: '' }); setMsgOpen(true); }}><Mail className="h-4 w-4" aria-hidden /> {t('Message')}</Button>
            <Button variant="outline" onClick={() => { exportCSV(rows(), file); toast(t('Export CSV téléchargé')); }}><Download className="h-4 w-4" aria-hidden /> CSV</Button>
            <Button variant="dark" onClick={() => { exportExcel(rows(), file, t('Participants')); toast(t('Export Excel téléchargé')); }}><FileSpreadsheet className="h-4 w-4" aria-hidden /> Excel</Button>
          </>
        }
      />
      <div className="mb-4">
        <label htmlFor="att-ev" className="sr-only">{t('Événement')}</label>
        <Select id="att-ev" value={eventId} onChange={(e) => { setParams({ e: e.target.value }, { replace: true }); setPage(0); setType(''); }} className="sm:w-96">
          {myEvents.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
        </Select>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('Participants')} value={num(all.length, lang)} icon={<Users className="h-[18px] w-[18px]" />} />
        <StatCard label={t('Entrés')} value={num(inCount, lang)} icon={<CheckCircle2 className="h-[18px] w-[18px]" />} tone="green" />
        <StatCard label={t('VIP')} value={all.filter((a) => /vip/i.test(a.ticketType)).length} icon={<Star className="h-[18px] w-[18px]" />} tone="violet" />
        <StatCard label={t('Taux de présence')} value={Math.round((inCount / Math.max(1, all.length)) * 100)} unit="%" tone="orange" />
      </div>
      <Card>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row" role="search">
          <div className="flex-1">
            <label htmlFor="att-q" className="sr-only">{t('Rechercher un participant')}</label>
            <Input id="att-q" type="search" icon={<Search className="h-4 w-4" />} placeholder={t('Nom, email, code, commande…')} value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
          </div>
          <label htmlFor="att-type" className="sr-only">{t('Type de billet')}</label>
          <Select id="att-type" value={type} onChange={(e) => { setType(e.target.value); setPage(0); }} className="lg:w-52">
            <option value="">{t('Tous les billets')}</option>
            {types.map((x) => <option key={x}>{x}</option>)}
          </Select>
          <Segmented label={t('Présence')} value={status} onChange={(v) => { setStatus(v); setPage(0); }} options={[{ value: 'all', label: t('Tous') }, { value: 'in', label: t('Entrés') }, { value: 'out', label: t('Absents') }]} />
        </div>
        <Table caption={t('Liste des participants')} head={[t('Participant'), t('Billet'), t('Commande'), t('Code'), t('Montant'), t('Entrée')]}>
          {list.slice(page * PER, page * PER + PER).map((a) => (
            <tr key={a.id}>
              <Td>
                <div className="flex items-center gap-3">
                  <Avatar name={a.name} size={34} />
                  <div><div className="font-semibold">{a.name}</div><div className="text-xs text-ink-muted">{a.email}</div></div>
                </div>
              </Td>
              <Td><Badge tone={/vip/i.test(a.ticketType) ? 'violet' : /groupe|table|pack/i.test(a.ticketType) ? 'amber' : 'brand'}>{a.ticketType}</Badge></Td>
              <Td className="text-ink-soft">{a.orderId}</Td>
              <Td className="font-mono text-xs">{a.code}</Td>
              <Td className="font-semibold">{a.amount ? moneyRaw(a.amount, ev?.currency ?? 'HTG', lang) : t('Gratuit')}</Td>
              <Td>{a.checkedIn ? <span className="text-sm font-semibold text-emerald-700">✓ {a.checkedInAt && time(a.checkedInAt, lang)}</span> : <span className="text-sm text-ink-muted">{t('Pas encore')}</span>}</Td>
            </tr>
          ))}
        </Table>
        {!list.length && <p className="py-8 text-center text-sm text-ink-muted">{t('Aucun participant ne correspond à ces filtres.')}</p>}
        <Pager page={page} pages={pages} total={list.length} onChange={setPage} />
      </Card>

      <Modal
        open={msgOpen}
        onClose={() => setMsgOpen(false)}
        title={t('Envoyer une mise à jour')}
        description={t('Envoyé par email, notification dans l’app et WhatsApp (si le participant l’a accepté).')}
        footer={<Button className="flex-1" onClick={send} loading={sending}>{list.length > 1 ? t('Envoyer à {n} participants', { n: list.length }) : t('Envoyer à {n} participant', { n: list.length })}</Button>}
      >
        <form noValidate onSubmit={(e) => { e.preventDefault(); send(); }} className="space-y-4">
          <Field label={t('Objet')} error={msg.errors.subject} required><Input {...msg.bind('subject')} /></Field>
          <Field label={t('Message')} error={msg.errors.body} required><Textarea placeholder={t('Ex. L’ouverture des portes est avancée à 18h30.')} {...msg.bind('body')} /></Field>
        </form>
      </Modal>
    </div>
  );
}

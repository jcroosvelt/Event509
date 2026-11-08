import { useState } from 'react';
import { Mail, MessageCircle, MessageSquare, Plus, Send } from 'lucide-react';
import { listCampaigns } from '@/services/api';
import { useAsync } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { compact, cx, dateShort, num } from '@/lib/format';
import { Badge, Button, Card, Field, IconBadge, Input, Loading, Modal, PageHeader, Select, StatCard, Table, Td, Textarea } from '@/components/ui';
import type { Campaign } from '@/types';

const channel = {
  email: { l: 'Email', i: Mail, tone: 'brand' as const },
  sms: { l: 'SMS', i: MessageSquare, tone: 'orange' as const },
  whatsapp: { l: 'WhatsApp', i: MessageCircle, tone: 'green' as const },
};
const status = { draft: { l: 'Brouillon', tone: 'gray' as const }, scheduled: { l: 'Programmée', tone: 'amber' as const }, sent: { l: 'Envoyée', tone: 'green' as const } };

export default function Marketing() {
  const { lang, toast } = useApp();
  const { data, loading, setData } = useAsync(() => listCampaigns(), []);
  const [open, setOpen] = useState(false);
  const [ch, setCh] = useState<Campaign['channel']>('whatsapp');
  const [body, setBody] = useState('🎉 Plus que quelques billets VIP pour le Festival Kompa Live ! Réservez ici : event509.com/e/festival-kompa-live-2026');

  if (loading) return <Loading />;
  const list = data ?? [];
  const sent = list.reduce((a, c) => a + c.sent, 0);
  const opened = list.reduce((a, c) => a + c.opened, 0);
  const clicks = list.reduce((a, c) => a + c.clicks, 0);
  const limit = ch === 'sms' ? 160 : ch === 'whatsapp' ? 1000 : 5000;

  return (
    <div>
      <PageHeader title="Marketing intégré" subtitle="Emailing, campagnes SMS et WhatsApp vers vos participants et abonnés." actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Nouvelle campagne</Button>} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Messages envoyés" value={compact(sent, lang)} icon={<Send className="h-[18px] w-[18px]" />} />
        <StatCard label="Taux d’ouverture" value={sent ? Math.round((opened / sent) * 100) : 0} unit="%" tone="green" />
        <StatCard label="Clics" value={num(clicks, lang)} tone="violet" />
        <StatCard label="Ventes attribuées" value="412" unit="billets" tone="orange" />
      </div>
      <Card>
        <Table head={['Campagne', 'Canal', 'Audience', 'Date', 'Ouverture', 'Clics', 'Statut']}>
          {list.map((c) => {
            const C = channel[c.channel];
            return (
              <tr key={c.id}>
                <Td className="font-semibold">{c.name}</Td>
                <Td><span className="flex items-center gap-2"><IconBadge size="sm" tone={C.tone}><C.i className="h-4 w-4" /></IconBadge>{C.l}</span></Td>
                <Td className="text-ink-soft">{c.audience}</Td>
                <Td className="text-ink-soft">{dateShort(c.date, lang)}</Td>
                <Td>{c.sent ? `${Math.round((c.opened / c.sent) * 100)}%` : '—'}</Td>
                <Td>{c.sent ? num(c.clicks, lang) : '—'}</Td>
                <Td><Badge tone={status[c.status].tone}>{status[c.status].l}</Badge></Td>
              </tr>
            );
          })}
        </Table>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nouvelle campagne"
        size="lg"
        footer={
          <>
            <Button variant="outline" className="flex-1" onClick={() => { setOpen(false); toast('Campagne programmée'); }}>Programmer</Button>
            <Button
              className="flex-1"
              onClick={() => {
                setData([{ id: String(Date.now()), name: 'Nouvelle campagne', channel: ch, audience: 'Participants Festival Kompa (3 054)', status: 'sent', sent: 3054, opened: 0, clicks: 0, date: new Date().toISOString() }, ...list]);
                setOpen(false);
                toast('Campagne envoyée');
              }}
            >
              <Send className="h-4 w-4" /> Envoyer maintenant
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(channel) as Campaign['channel'][]).map((k) => {
              const C = channel[k];
              return (
                <button key={k} onClick={() => setCh(k)} className={cx('flex flex-col items-center gap-2 rounded-2xl border p-4 text-sm font-semibold', ch === k ? 'border-brand bg-brand-50' : 'border-line')}>
                  <IconBadge tone={C.tone}><C.i className="h-[18px] w-[18px]" /></IconBadge>{C.l}
                </button>
              );
            })}
          </div>
          <Field label="Nom de la campagne"><Input placeholder="Ex. Relance J-7" /></Field>
          <Field label="Audience">
            <Select>
              <option>Participants — Festival Kompa Live 2026 (3 054)</option>
              <option>Tous mes abonnés (12 400)</option>
              <option>Acheteurs des 12 derniers mois (8 420)</option>
              <option>Paniers abandonnés (312)</option>
              <option>Ville : Port-au-Prince (5 100)</option>
            </Select>
          </Field>
          {ch === 'email' && <Field label="Objet"><Input defaultValue="Dernières places pour le Festival Kompa Live" /></Field>}
          <Field label="Message" hint={`${body.length}/${limit}${ch === 'sms' ? ' · 1 SMS' : ''}`}>
            <Textarea value={body} onChange={(e) => setBody(e.target.value.slice(0, limit))} />
          </Field>
          <div className="rounded-2xl bg-canvas p-4">
            <div className="mb-2 text-xs font-semibold text-ink-muted">Aperçu</div>
            <div className={cx('max-w-xs rounded-2xl p-3 text-sm', ch === 'whatsapp' ? 'bg-[#DCF8C6]' : 'bg-white')}>{body}</div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

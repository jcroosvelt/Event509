import { useMemo, useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, Mail, Search, Users } from 'lucide-react';
import { listAttendees } from '@/services/api';
import { useAsync } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { dateNumeric, num, time } from '@/lib/format';
import { exportCSV, exportExcel } from '@/lib/export';
import { Avatar, Badge, Button, Card, Input, Loading, Modal, PageHeader, Segmented, Select, StatCard, Table, Td, Textarea, Field } from '@/components/ui';

export default function Attendees() {
  const { lang, toast } = useApp();
  const { data, loading } = useAsync(() => listAttendees(), []);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState<'all' | 'in' | 'out'>('all');
  const [page, setPage] = useState(0);
  const [msg, setMsg] = useState(false);
  const per = 12;

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
  const rows = () =>
    list.map((a) => ({
      Nom: a.name, Email: a.email, Téléphone: a.phone, Billet: a.ticketType, Commande: a.orderId, Code: a.code,
      Montant: a.amount, 'Acheté le': dateNumeric(a.purchasedAt, lang), 'Check-in': a.checkedIn ? 'Oui' : 'Non',
    }));
  const pages = Math.ceil(list.length / per);

  return (
    <div>
      <PageHeader
        title="Participants"
        subtitle="Festival Kompa Live 2026"
        actions={
          <>
            <Button variant="outline" onClick={() => setMsg(true)}><Mail className="h-4 w-4" /> Message</Button>
            <Button variant="outline" onClick={() => { exportCSV(rows(), 'participants-event509'); toast('Export CSV téléchargé'); }}><Download className="h-4 w-4" /> CSV</Button>
            <Button variant="dark" onClick={() => { exportExcel(rows(), 'participants-event509'); toast('Export Excel téléchargé'); }}><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Participants" value={num(all.length, lang)} icon={<Users className="h-[18px] w-[18px]" />} />
        <StatCard label="Entrés" value={num(all.filter((a) => a.checkedIn).length, lang)} icon={<CheckCircle2 className="h-[18px] w-[18px]" />} tone="green" />
        <StatCard label="VIP" value={all.filter((a) => a.ticketType === 'VIP').length} tone="violet" />
        <StatCard label="Taux de présence" value={Math.round((all.filter((a) => a.checkedIn).length / Math.max(1, all.length)) * 100)} unit="%" tone="orange" />
      </div>
      <Card>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row">
          <div className="flex-1"><Input icon={<Search className="h-4 w-4" />} placeholder="Nom, email, code, commande…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} /></div>
          <Select value={type} onChange={(e) => { setType(e.target.value); setPage(0); }} className="lg:w-48">
            <option value="">Tous les billets</option>
            {types.map((t) => <option key={t}>{t}</option>)}
          </Select>
          <Segmented value={status} onChange={(v) => { setStatus(v); setPage(0); }} options={[{ value: 'all', label: 'Tous' }, { value: 'in', label: 'Entrés' }, { value: 'out', label: 'Absents' }]} />
        </div>
        <Table head={['Participant', 'Billet', 'Commande', 'Code', 'Montant', 'Check-in']}>
          {list.slice(page * per, page * per + per).map((a) => (
            <tr key={a.id}>
              <Td>
                <div className="flex items-center gap-3">
                  <Avatar name={a.name} size={34} />
                  <div><div className="font-semibold">{a.name}</div><div className="text-xs text-ink-muted">{a.email}</div></div>
                </div>
              </Td>
              <Td><Badge tone={a.ticketType === 'VIP' ? 'violet' : a.ticketType.includes('Groupe') ? 'amber' : 'brand'}>{a.ticketType}</Badge></Td>
              <Td className="text-ink-soft">{a.orderId}</Td>
              <Td className="font-mono text-xs">{a.code}</Td>
              <Td className="font-semibold">{num(a.amount, lang)} HTG</Td>
              <Td>{a.checkedIn ? <span className="text-sm font-semibold text-emerald-600">✓ {a.checkedInAt && time(a.checkedInAt, lang)}</span> : <span className="text-sm text-ink-muted">—</span>}</Td>
            </tr>
          ))}
        </Table>
        <div className="mt-4 flex items-center justify-between text-sm text-ink-soft">
          <span>{list.length} résultats</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Précédent</Button>
            <Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Suivant</Button>
          </div>
        </div>
      </Card>

      <Modal open={msg} onClose={() => setMsg(false)} title="Envoyer une mise à jour" footer={<Button className="flex-1" onClick={() => { setMsg(false); toast(`Message envoyé à ${list.length} participants`); }}>Envoyer à {list.length} participants</Button>}>
        <div className="space-y-4">
          <Field label="Objet"><Input defaultValue="Mise à jour : Festival Kompa Live 2026" /></Field>
          <Field label="Message"><Textarea defaultValue="Bonjour, l’ouverture des portes est avancée à 18h30. Pensez à avoir votre billet QR prêt à l’entrée !" /></Field>
          <p className="text-xs text-ink-muted">Envoyé par email, notification dans l’app et WhatsApp (si accepté par le participant).</p>
        </div>
      </Modal>
    </div>
  );
}

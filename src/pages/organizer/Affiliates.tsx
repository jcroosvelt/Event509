import { useState } from 'react';
import { Copy, MousePointerClick, Plus, Share2, Ticket, Wallet } from 'lucide-react';
import { listAmbassadors } from '@/services/api';
import { useAsync } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { compact, moneyRaw, num } from '@/lib/format';
import { Avatar, Button, Card, Field, Input, Loading, Modal, PageHeader, StatCard, Table, Td } from '@/components/ui';

export default function Affiliates() {
  const { lang, toast } = useApp();
  const { data, loading, setData } = useAsync(() => listAmbassadors(), []);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', commission: 5 });

  if (loading) return <Loading />;
  const list = data ?? [];
  const sum = (k: 'clicks' | 'sales' | 'revenue') => list.reduce((a, x) => a + x[k], 0);

  return (
    <div>
      <PageHeader title="Ambassadeurs & affiliation" subtitle="Des promoteurs qui vendent vos billets contre une commission." actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Inviter un ambassadeur</Button>} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Ambassadeurs" value={list.length} icon={<Share2 className="h-[18px] w-[18px]" />} />
        <StatCard label="Clics" value={compact(sum('clicks'), lang)} icon={<MousePointerClick className="h-[18px] w-[18px]" />} tone="violet" />
        <StatCard label="Billets vendus" value={num(sum('sales'), lang)} icon={<Ticket className="h-[18px] w-[18px]" />} tone="orange" />
        <StatCard label="Revenus générés" value={compact(sum('revenue'), lang)} unit="HTG" icon={<Wallet className="h-[18px] w-[18px]" />} tone="green" />
      </div>
      <Card>
        <Table head={['Ambassadeur', 'Code / lien', 'Clics', 'Ventes', 'Conversion', 'Revenus', 'Commission due']}>
          {list.map((a) => (
            <tr key={a.id}>
              <Td><span className="flex items-center gap-3"><Avatar name={a.name} size={34} /><b>{a.name}</b></span></Td>
              <Td>
                <button className="flex items-center gap-2 font-mono text-xs font-bold text-brand" onClick={() => { navigator.clipboard?.writeText(`event509.com/?ref=${a.code}`); toast('Lien copié'); }}>
                  {a.code} <Copy className="h-3.5 w-3.5" />
                </button>
              </Td>
              <Td>{num(a.clicks, lang)}</Td>
              <Td>{num(a.sales, lang)}</Td>
              <Td>{((a.sales / a.clicks) * 100).toFixed(1)}%</Td>
              <Td>{moneyRaw(a.revenue, 'HTG', lang)}</Td>
              <Td className="font-bold">{moneyRaw((a.revenue * a.commission) / 100, 'HTG', lang)} <span className="font-normal text-ink-muted">({a.commission}%)</span></Td>
            </tr>
          ))}
        </Table>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Inviter un ambassadeur"
        size="sm"
        footer={
          <Button
            className="flex-1"
            disabled={!form.name || !form.code}
            onClick={() => {
              setData([...list, { id: String(Date.now()), name: form.name, code: form.code, clicks: 0, sales: 0, revenue: 0, commission: form.commission }]);
              setOpen(false);
              setForm({ name: '', code: '', commission: 5 });
              toast('Invitation envoyée');
            }}
          >
            Inviter
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="Nom"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, code: form.code || e.target.value.split(' ')[0].toUpperCase().replace(/[^A-Z]/g, '') })} /></Field>
          <Field label="Code de parrainage"><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} /></Field>
          <Field label="Commission (%)"><Input type="number" min={1} max={30} value={form.commission} onChange={(e) => setForm({ ...form, commission: +e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  );
}

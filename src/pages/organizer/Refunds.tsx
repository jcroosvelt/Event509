import { useState } from 'react';
import { Check, Undo2, X } from 'lucide-react';
import { decideRefund, listRefunds } from '@/services/api';
import { useAsync } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { moneyRaw, relative } from '@/lib/format';
import { Avatar, Badge, Button, Card, EmptyState, Loading, PageHeader, Segmented, Select, StatCard, Toggle } from '@/components/ui';

export default function Refunds() {
  const { toast, lang } = useApp();
  const { data, loading, reload } = useAsync(() => listRefunds(), []);
  const [tab, setTab] = useState<'pending' | 'done'>('pending');
  const [auto, setAuto] = useState(false);

  if (loading) return <Loading />;
  const list = (data ?? []).filter((r) => (tab === 'pending' ? r.status === 'pending' : r.status !== 'pending'));
  const decide = async (id: string, s: 'approved' | 'declined') => {
    await decideRefund(id, s);
    toast(s === 'approved' ? 'Remboursement approuvé — le participant est notifié' : 'Demande refusée');
    reload();
  };

  return (
    <div>
      <PageHeader title="Remboursements & annulations" subtitle="Traitez les demandes des participants et définissez votre politique." />
      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_1fr_1.4fr]">
        <StatCard label="En attente" value={(data ?? []).filter((r) => r.status === 'pending').length} icon={<Undo2 className="h-[18px] w-[18px]" />} tone="amber" />
        <StatCard label="Remboursé ce mois" value={moneyRaw(10000, 'HTG', lang)} tone="green" />
        <Card className="space-y-3">
          <div className="text-sm font-bold">Politique de remboursement</div>
          <Select defaultValue="7">
            <option value="none">Aucun remboursement</option>
            <option value="7">Jusqu’à 7 jours avant l’événement</option>
            <option value="1">Jusqu’à 24 h avant l’événement</option>
            <option value="always">Toujours remboursable</option>
          </Select>
          <Toggle checked={auto} onChange={setAuto} label="Approbation automatique" description="Dans le délai de la politique" />
        </Card>
      </div>

      <Segmented className="mb-4" value={tab} onChange={setTab} options={[{ value: 'pending', label: 'À traiter' }, { value: 'done', label: 'Traitées' }]} />
      {!list.length ? (
        <EmptyState icon={<Check className="h-5 w-5" />} title="Rien à traiter" body="Toutes les demandes ont été traitées." />
      ) : (
        <div className="space-y-3">
          {list.map((r) => (
            <Card key={r.id} className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex flex-1 items-center gap-3">
                <Avatar name={r.buyer} size={44} />
                <div className="min-w-0">
                  <div className="font-bold">{r.buyer} <span className="font-normal text-ink-muted">· {r.orderId}</span></div>
                  <div className="truncate text-sm text-ink-soft">{r.eventTitle}</div>
                  <div className="text-xs text-ink-muted">« {r.reason} » · {relative(r.createdAt, lang)}</div>
                </div>
              </div>
              <div className="text-xl font-extrabold">{moneyRaw(r.amount, r.currency, lang)}</div>
              {r.status === 'pending' ? (
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => decide(r.id, 'declined')}><X className="h-4 w-4" /> Refuser</Button>
                  <Button onClick={() => decide(r.id, 'approved')}><Check className="h-4 w-4" /> Rembourser</Button>
                </div>
              ) : (
                <Badge tone={r.status === 'approved' ? 'green' : 'red'}>{r.status === 'approved' ? 'Remboursé' : 'Refusé'}</Badge>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

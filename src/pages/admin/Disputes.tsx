import { useState } from 'react';
import { Gavel, MessageSquare } from 'lucide-react';
import { listDisputes } from '@/services/api';
import { useAsync } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { moneyRaw, relative } from '@/lib/format';
import { Badge, Button, Card, Field, IconBadge, Loading, Modal, PageHeader, Select, Textarea } from '@/components/ui';
import type { Dispute } from '@/types';

const st = { open: { l: 'Ouvert', tone: 'red' as const }, investigating: { l: 'En enquête', tone: 'amber' as const }, resolved: { l: 'Résolu', tone: 'green' as const } };

export default function Disputes() {
  const { toast, lang } = useApp();
  const { data, loading, setData } = useAsync(() => listDisputes(), []);
  const [open, setOpen] = useState<Dispute | null>(null);

  if (loading) return <Loading />;
  const resolve = (d: Dispute, status: Dispute['status']) => {
    setData((data ?? []).map((x) => (x.id === d.id ? { ...x, status } : x)));
    setOpen(null);
    toast(status === 'resolved' ? 'Litige résolu' : 'Litige passé en enquête');
  };

  return (
    <div>
      <PageHeader title="Litiges" subtitle="Médiation entre participants et organisateurs." />
      <div className="space-y-3">
        {(data ?? []).map((d) => (
          <Card key={d.id} className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <IconBadge tone={d.status === 'resolved' ? 'green' : 'red'}><Gavel className="h-[18px] w-[18px]" /></IconBadge>
            <div className="min-w-0 flex-1">
              <div className="font-bold">{d.subject}</div>
              <div className="text-sm text-ink-soft">{d.opener} contre {d.against} · {d.orderId} · {relative(d.createdAt, lang)}</div>
            </div>
            <div className="font-extrabold">{moneyRaw(d.amount, d.currency, lang)}</div>
            <Badge tone={st[d.status].tone}>{st[d.status].l}</Badge>
            <Button size="sm" variant="outline" onClick={() => setOpen(d)}>Traiter</Button>
          </Card>
        ))}
      </div>

      {open && (
        <Modal
          open
          onClose={() => setOpen(null)}
          title={`Litige ${open.orderId}`}
          footer={
            <>
              <Button variant="outline" className="flex-1" onClick={() => resolve(open, 'investigating')}>Mettre en enquête</Button>
              <Button className="flex-1" onClick={() => resolve(open, 'resolved')}>Appliquer la décision</Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="rounded-2xl bg-canvas p-4 text-sm">
              <div className="mb-1 flex items-center gap-2 font-semibold"><MessageSquare className="h-4 w-4" /> {open.opener}</div>
              <p className="text-ink-soft">« {open.subject}. J’ai contacté l’organisateur sans réponse depuis 5 jours. »</p>
            </div>
            <Field label="Décision">
              <Select>
                <option>Rembourser le participant (débit organisateur)</option>
                <option>Remboursement partiel 50 %</option>
                <option>Rejeter la réclamation</option>
              </Select>
            </Field>
            <Field label="Note interne"><Textarea placeholder="Éléments vérifiés, preuves…" /></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}

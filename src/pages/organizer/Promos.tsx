import { useState } from 'react';
import { BadgePercent, Copy, Plus } from 'lucide-react';
import { events } from '@/data/mock';
import { listPromoCodes, savePromo } from '@/services/api';
import { useAsync } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { dateNumeric, uid } from '@/lib/format';
import { Badge, Button, Card, Field, Input, Loading, Modal, PageHeader, ProgressBar, Segmented, Select, Table, Td, Toggle } from '@/components/ui';
import type { PromoCode } from '@/types';

export default function Promos() {
  const { toast, lang } = useApp();
  const { data, loading, reload } = useAsync(() => listPromoCodes(), []);
  const [edit, setEdit] = useState<PromoCode | null>(null);

  if (loading) return <Loading />;
  const newPromo = (): PromoCode => ({ id: uid('p'), code: '', type: 'percent', value: 10, used: 0, limit: 100, expiresAt: '2026-12-31T23:59:00', eventId: 'all', active: true });

  return (
    <div>
      <PageHeader title="Codes promo" subtitle="Réductions en pourcentage ou montant fixe, limitées en nombre et dans le temps." actions={<Button onClick={() => setEdit(newPromo())}><Plus className="h-4 w-4" /> Nouveau code</Button>} />
      <Card>
        <Table head={['Code', 'Réduction', 'Événement', 'Utilisation', 'Expire le', 'Statut', '']}>
          {(data ?? []).map((p) => (
            <tr key={p.id}>
              <Td><span className="flex items-center gap-2 font-mono font-bold"><BadgePercent className="h-4 w-4 text-brand" />{p.code}</span></Td>
              <Td className="font-semibold">{p.type === 'percent' ? `−${p.value}%` : `−${p.value} HTG`}</Td>
              <Td className="max-w-[180px] truncate text-ink-soft">{p.eventId === 'all' ? 'Tous les événements' : events.find((e) => e.id === p.eventId)?.title}</Td>
              <Td><div className="w-32"><div className="mb-1 text-xs text-ink-muted">{p.used}/{p.limit}</div><ProgressBar value={p.used / p.limit} /></div></Td>
              <Td className="text-ink-soft">{dateNumeric(p.expiresAt, lang)}</Td>
              <Td><Badge tone={p.active && p.used < p.limit ? 'green' : 'gray'}>{p.used >= p.limit ? 'Épuisé' : p.active ? 'Actif' : 'Désactivé'}</Badge></Td>
              <Td>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard?.writeText(p.code); toast('Code copié'); }} aria-label="Copier"><Copy className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => setEdit(p)}>Modifier</Button>
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>

      {edit && (
        <Modal
          open
          onClose={() => setEdit(null)}
          title={edit.code ? `Code ${edit.code}` : 'Nouveau code promo'}
          footer={
            <Button
              className="flex-1"
              disabled={edit.code.length < 3}
              onClick={async () => {
                await savePromo(edit);
                setEdit(null);
                toast('Code promo enregistré');
                reload();
              }}
            >
              Enregistrer
            </Button>
          }
        >
          <div className="space-y-4">
            <Field label="Code"><Input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} placeholder="NOEL2026" /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Type">
                <Segmented value={edit.type} onChange={(v) => setEdit({ ...edit, type: v })} options={[{ value: 'percent', label: '%' }, { value: 'fixed', label: 'Montant' }]} />
              </Field>
              <Field label="Valeur"><Input type="number" min={1} max={edit.type === 'percent' ? 100 : undefined} value={edit.value} onChange={(e) => setEdit({ ...edit, value: +e.target.value })} /></Field>
              <Field label="Utilisations max."><Input type="number" min={1} value={edit.limit} onChange={(e) => setEdit({ ...edit, limit: +e.target.value })} /></Field>
              <Field label="Expiration"><Input type="datetime-local" value={edit.expiresAt.slice(0, 16)} onChange={(e) => setEdit({ ...edit, expiresAt: e.target.value })} /></Field>
            </div>
            <Field label="Événement">
              <Select value={edit.eventId} onChange={(e) => setEdit({ ...edit, eventId: e.target.value })}>
                <option value="all">Tous mes événements</option>
                {events.filter((e) => e.organizerId === 'org1').map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
              </Select>
            </Field>
            <Toggle checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} label="Actif" />
          </div>
        </Modal>
      )}
    </div>
  );
}

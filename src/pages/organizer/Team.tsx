import { useState } from 'react';
import { Calculator, Check, Minus, Plus, ScanLine, ShieldCheck } from 'lucide-react';
import { inviteMember, listTeam } from '@/services/api';
import { useAsync } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { relative } from '@/lib/format';
import { Avatar, Badge, Button, Card, Field, IconBadge, Input, Loading, Modal, PageHeader, Select, Table, Td } from '@/components/ui';
import type { TeamRole } from '@/types';

const roles: Record<TeamRole, { l: string; d: string; i: typeof ShieldCheck; tone: 'brand' | 'orange' | 'green' }> = {
  admin: { l: 'Administrateur', d: 'Accès complet : événements, ventes, équipe, versements', i: ShieldCheck, tone: 'brand' },
  staff: { l: 'Staff d’entrée', d: 'Uniquement le scan des billets au check-in', i: ScanLine, tone: 'orange' },
  accountant: { l: 'Comptable', d: 'Ventes, remboursements, versements et factures', i: Calculator, tone: 'green' },
};

const perms = [
  ['Créer / modifier des événements', true, false, false],
  ['Voir les ventes et le tableau de bord', true, false, true],
  ['Scanner les billets', true, true, false],
  ['Exporter les participants', true, false, true],
  ['Gérer les remboursements', true, false, true],
  ['Versements et factures', true, false, true],
  ['Gérer l’équipe', true, false, false],
] as const;

export default function Team() {
  const { toast, lang } = useApp();
  const { data, loading, reload } = useAsync(() => listTeam(), []);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ name: string; email: string; role: TeamRole }>({ name: '', email: '', role: 'staff' });

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader title="Équipe & rôles" subtitle="Invitez votre équipe et contrôlez ce que chacun peut faire." actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Inviter</Button>} />
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {(Object.keys(roles) as TeamRole[]).map((r) => {
          const R = roles[r];
          return (
            <Card key={r}>
              <IconBadge tone={R.tone}><R.i className="h-[18px] w-[18px]" /></IconBadge>
              <div className="mt-3 font-bold">{R.l}</div>
              <p className="text-sm text-ink-soft">{R.d}</p>
              <div className="mt-3 text-2xl font-extrabold">{(data ?? []).filter((m) => m.role === r).length}</div>
            </Card>
          );
        })}
      </div>

      <Card className="mb-6">
        <Table head={['Membre', 'Rôle', 'Statut', 'Dernière activité']}>
          {(data ?? []).map((m) => (
            <tr key={m.id}>
              <Td><span className="flex items-center gap-3"><Avatar name={m.name} size={36} /><span><b className="block">{m.name}</b><span className="text-xs text-ink-muted">{m.email}</span></span></span></Td>
              <Td><Badge tone={roles[m.role].tone}>{roles[m.role].l}</Badge></Td>
              <Td><Badge tone={m.status === 'active' ? 'green' : 'amber'}>{m.status === 'active' ? 'Actif' : 'Invitation envoyée'}</Badge></Td>
              <Td className="text-ink-soft">{m.lastActive ? relative(m.lastActive, lang) : '—'}</Td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card>
        <h2 className="mb-4 font-bold">Permissions par rôle</h2>
        <Table head={['Permission', 'Admin', 'Staff', 'Comptable']}>
          {perms.map(([p, ...v]) => (
            <tr key={p}>
              <Td className="font-medium">{p}</Td>
              {v.map((ok, i) => <Td key={i}>{ok ? <Check className="h-4 w-4 text-emerald-600" /> : <Minus className="h-4 w-4 text-ink-muted" />}</Td>)}
            </tr>
          ))}
        </Table>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Inviter un membre"
        size="sm"
        footer={
          <Button
            className="flex-1"
            disabled={!form.name || !/^\S+@\S+\.\S+$/.test(form.email)}
            onClick={async () => {
              await inviteMember(form);
              setOpen(false);
              setForm({ name: '', email: '', role: 'staff' });
              toast('Invitation envoyée');
              reload();
            }}
          >
            Envoyer l’invitation
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="Nom"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Rôle" hint={roles[form.role].d}>
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as TeamRole })}>
              {(Object.keys(roles) as TeamRole[]).map((r) => <option key={r} value={r}>{roles[r].l}</option>)}
            </Select>
          </Field>
        </div>
      </Modal>
    </div>
  );
}

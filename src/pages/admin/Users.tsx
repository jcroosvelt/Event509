import { useState } from 'react';
import { BadgeCheck, Search } from 'lucide-react';
import { listUsers } from '@/services/api';
import { useAsync } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { dateNumeric } from '@/lib/format';
import { Avatar, Badge, Button, Card, Input, Loading, PageHeader, Segmented, Table, Td } from '@/components/ui';
import type { AppUser } from '@/types';

const role = { participant: { l: 'Participant', tone: 'gray' as const }, organizer: { l: 'Organisateur', tone: 'brand' as const }, admin: { l: 'Admin', tone: 'ink' as const } };

export default function Users() {
  const { toast, lang } = useApp();
  const { data, loading, setData } = useAsync(() => listUsers(), []);
  const [q, setQ] = useState('');
  const [r, setR] = useState<'all' | AppUser['role']>('all');

  if (loading) return <Loading />;
  const list = (data ?? []).filter((u) => (r === 'all' || u.role === r) && `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase()));
  const toggle = (u: AppUser) => {
    setData((data ?? []).map((x) => (x.id === u.id ? { ...x, status: x.status === 'active' ? 'suspended' : 'active' } : x)));
    toast(u.status === 'active' ? `${u.name} suspendu` : `${u.name} réactivé`);
  };

  return (
    <div>
      <PageHeader title="Utilisateurs" subtitle={`${data?.length ?? 0} comptes`} />
      <Card>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row">
          <div className="flex-1"><Input icon={<Search className="h-4 w-4" />} placeholder="Nom ou email" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Segmented value={r} onChange={setR} options={[{ value: 'all', label: 'Tous' }, { value: 'participant', label: 'Participants' }, { value: 'organizer', label: 'Organisateurs' }, { value: 'admin', label: 'Admins' }]} />
        </div>
        <Table head={['Utilisateur', 'Rôle', 'Ville', 'Inscrit le', 'Statut', '']}>
          {list.map((u) => (
            <tr key={u.id}>
              <Td><span className="flex items-center gap-3"><Avatar name={u.name} size={36} /><span><b className="flex items-center gap-1">{u.name} {u.verified && <BadgeCheck className="h-4 w-4 text-brand" />}</b><span className="text-xs text-ink-muted">{u.email}</span></span></span></Td>
              <Td><Badge tone={role[u.role].tone}>{role[u.role].l}</Badge></Td>
              <Td className="text-ink-soft">{u.city}</Td>
              <Td className="text-ink-soft">{dateNumeric(u.joinedAt, lang)}</Td>
              <Td><Badge tone={u.status === 'active' ? 'green' : 'red'}>{u.status === 'active' ? 'Actif' : 'Suspendu'}</Badge></Td>
              <Td>{u.role !== 'admin' && <Button size="sm" variant={u.status === 'active' ? 'danger' : 'soft'} onClick={() => toggle(u)}>{u.status === 'active' ? 'Suspendre' : 'Réactiver'}</Button>}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

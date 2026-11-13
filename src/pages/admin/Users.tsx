import { VerifiedBadge } from '@/components/VerifiedBadge';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Search } from 'lucide-react';
import { listUsers, setUserStatus } from '@/services/api';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { dateNumeric } from '@/lib/format';
import { exportCSV } from '@/lib/export';
import { Avatar, Badge, Button, Card, Input, Loading, Modal, PageHeader, Pager, Segmented, Table, Td, type Tone } from '@/components/ui';
import type { AppUser } from '@/types';

export const roleLabel: Record<AppUser['role'], { l: string; tone: Tone }> = {
  participant: { l: 'Participant', tone: 'gray' },
  organizer: { l: 'Organisateur', tone: 'brand' },
  admin: { l: 'Admin', tone: 'ink' },
};
const PER = 10;

export default function Users() {
  const { toast, lang, t } = useApp();
  useTitle(t('Utilisateurs'));
  const { data, loading, reload } = useAsync(() => listUsers(), []);
  const [q, setQ] = useState('');
  const [r, setR] = useState<'all' | AppUser['role']>('all');
  const [page, setPage] = useState(0);
  const [confirm, setConfirm] = useState<AppUser | null>(null);

  if (loading) return <Loading />;
  const list = (data ?? []).filter((u) => (r === 'all' || u.role === r) && `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase()));
  const toggle = async (u: AppUser) => {
    const next = u.status === 'active' ? 'suspended' : 'active';
    await setUserStatus(u.id, next);
    setConfirm(null);
    toast(next === 'suspended' ? t('{name} est suspendu', { name: u.name }) : t('{name} est réactivé', { name: u.name }));
    reload();
  };

  return (
    <div>
      <PageHeader
        title={t('Utilisateurs')}
        subtitle={t('{n} comptes', { n: data?.length ?? 0 })}
        actions={
          <Button variant="outline" onClick={() => exportCSV(list.map((u) => ({ [t('Nom')]: u.name, [t('Email')]: u.email, [t('Rôle')]: t(roleLabel[u.role].l), [t('Ville')]: u.city, [t('Inscrit le')]: u.joinedAt, [t('Statut')]: u.status === 'active' ? t('Actif') : t('Suspendu') })), 'utilisateurs')}>
            <Download className="h-4 w-4" aria-hidden /> CSV
          </Button>
        }
      />
      <Card>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row" role="search">
          <div className="flex-1">
            <label htmlFor="u-q" className="sr-only">{t('Rechercher un utilisateur')}</label>
            <Input id="u-q" type="search" icon={<Search className="h-4 w-4" />} placeholder={t('Nom ou email')} value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
          </div>
          <Segmented label={t('Rôle')} value={r} onChange={(v) => { setR(v); setPage(0); }} options={[{ value: 'all', label: t('Tous') }, { value: 'participant', label: t('Participants') }, { value: 'organizer', label: t('Organisateurs') }, { value: 'admin', label: t('Admins') }]} />
        </div>
        <Table caption={t('Utilisateurs')} head={[t('Utilisateur'), t('Rôle'), t('Ville'), t('Inscrit le'), t('Statut'), '']}>
          {list.slice(page * PER, page * PER + PER).map((u) => (
            <tr key={u.id}>
              <Td>
                <Link to={`/admin/utilisateurs/${u.id}`} className="group flex items-center gap-3">
                  <Avatar name={u.name} size={36} />
                  <span><b className="flex items-center gap-1 group-hover:text-brand-ink">{u.name} {u.verified && <VerifiedBadge size={16} />}</b><span className="text-xs text-ink-muted">{u.email}</span></span>
                </Link>
              </Td>
              <Td><Badge tone={roleLabel[u.role].tone}>{t(roleLabel[u.role].l)}</Badge></Td>
              <Td className="text-ink-soft">{u.city}</Td>
              <Td className="text-ink-soft">{dateNumeric(u.joinedAt, lang)}</Td>
              <Td><Badge tone={u.status === 'active' ? 'green' : 'red'}>{u.status === 'active' ? t('Actif') : t('Suspendu')}</Badge></Td>
              <Td>{u.role !== 'admin' && <Button size="sm" variant={u.status === 'active' ? 'danger' : 'soft'} onClick={() => (u.status === 'active' ? setConfirm(u) : toggle(u))}>{u.status === 'active' ? t('Suspendre') : t('Réactiver')}</Button>}</Td>
            </tr>
          ))}
        </Table>
        <Pager page={page} pages={Math.max(1, Math.ceil(list.length / PER))} total={list.length} onChange={setPage} />
      </Card>

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={t('Suspendre {name} ?', { name: confirm?.name ?? '' })}
        description={t('Le compte ne pourra plus se connecter ni acheter. Les billets déjà achetés restent valides.')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" className="flex-1" onClick={() => setConfirm(null)}>{t('Annuler')}</Button>
            <Button variant="danger" className="flex-1" onClick={() => confirm && toggle(confirm)}>{t('Suspendre')}</Button>
          </>
        }
      >
        <span />
      </Modal>
    </div>
  );
}

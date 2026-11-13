import { VerifiedBadge } from '@/components/VerifiedBadge';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Receipt, Wallet } from 'lucide-react';
import { events } from '@/data/mock';
import { getUserDetail, setUserRole, setUserStatus } from '@/services/api';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { dateNumeric, moneyRaw, num } from '@/lib/format';
import { Avatar, Badge, Button, Card, Loading, Modal, PageHeader, Select, StatCard, Table, Td } from '@/components/ui';
import { eventStatus } from '@/pages/organizer/Events';
import NotFound from '../public/NotFound';
import { roleLabel } from './Users';
import type { AppUser } from '@/types';

const orderStatus: Record<string, string> = { paid: 'Payée', pending: 'En attente', refunded: 'Remboursée', partially_refunded: 'Remb. partiel', cancelled: 'Annulée' };

export default function UserDetail() {
  const { id = '' } = useParams();
  const { t, lang, toast, user: me } = useApp();
  const { data, loading, reload } = useAsync(() => getUserDetail(id), [id]);
  const [confirm, setConfirm] = useState(false);
  useTitle(data?.user.name);

  if (loading) return <Loading />;
  if (!data) return <NotFound />;
  const { user: u, organization, orders, spent } = data;
  const isMe = me?.id === u.id;

  const changeRole = async (role: AppUser['role']) => {
    await setUserRole(u.id, role);
    toast(t('Rôle de {name} : {role}', { name: u.name, role: t(roleLabel[role].l) }));
    reload();
  };
  const toggle = async () => {
    await setUserStatus(u.id, u.status === 'active' ? 'suspended' : 'active');
    setConfirm(false);
    toast(u.status === 'active' ? t('{name} est suspendu', { name: u.name }) : t('{name} est réactivé', { name: u.name }));
    reload();
  };

  return (
    <div className="space-y-6">
      <Link to="/admin/utilisateurs" className="inline-flex items-center gap-2 text-sm font-semibold text-ink-soft"><ArrowLeft className="h-4 w-4" aria-hidden /> {t('Utilisateurs')}</Link>
      <PageHeader
        title={<span className="flex items-center gap-3"><Avatar name={u.name} size={52} /> <span>{u.name}{u.verified && <VerifiedBadge className="ml-1" size={26} />}</span></span>}
        subtitle={`${u.email}${u.phone ? ` · ${u.phone}` : ''} · ${u.city} · ${t('inscrit le {date}', { date: dateNumeric(u.joinedAt, lang) })}`}
        actions={
          !isMe && u.role !== 'admin' ? (
            <Button variant={u.status === 'active' ? 'danger' : 'soft'} onClick={() => (u.status === 'active' ? setConfirm(true) : toggle())}>{u.status === 'active' ? t('Suspendre') : t('Réactiver')}</Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <label htmlFor="role" className="text-sm font-medium text-ink-soft">{t('Rôle')}</label>
          <Select id="role" value={u.role} onChange={(e) => changeRole(e.target.value as AppUser['role'])} disabled={isMe} className="mt-2 h-10">
            {(Object.keys(roleLabel) as AppUser['role'][]).map((r) => <option key={r} value={r}>{t(roleLabel[r].l)}</option>)}
          </Select>
        </Card>
        <StatCard label={t('Statut')} value={<Badge tone={u.status === 'active' ? 'green' : 'red'}>{u.status === 'active' ? t('Actif') : t('Suspendu')}</Badge>} />
        <StatCard label={t('Commandes')} value={num(orders.length, lang)} icon={<Receipt className="h-[18px] w-[18px]" />} />
        <StatCard label={t('Total dépensé')} value={moneyRaw(Math.round(spent), 'HTG', lang)} icon={<Wallet className="h-[18px] w-[18px]" />} tone="green" />
      </div>

      {organization && (
        <Card>
          <h2 className="mb-1 font-bold">{t('Organisation')}</h2>
          <p className="mb-4 text-sm text-ink-soft">
            <Link to={`/o/${organization.slug}`} className="font-semibold text-brand-ink">{organization.name}</Link> · {organization.verified ? t('vérifié') : t('non vérifié')} · {t('{n} abonnés', { n: num(organization.followers, lang) })}
          </p>
          <Table caption={t('Événements de l’organisation')} head={[t('Événement'), t('Date'), t('Statut'), t('Billets vendus')]}>
            {data.events.map((e) => (
              <tr key={e.id}>
                <Td><Link to={`/e/${e.slug}`} className="flex items-center gap-2 font-semibold hover:text-brand-ink"><CalendarDays className="h-4 w-4 text-ink-muted" aria-hidden />{e.title}</Link></Td>
                <Td className="text-ink-soft">{dateNumeric(e.start, lang)}</Td>
                <Td><Badge tone={eventStatus[e.status].tone}>{t(eventStatus[e.status].l)}</Badge></Td>
                <Td>{num(e.tickets.reduce((a, x) => a + x.sold, 0), lang)}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Card>
        <h2 className="mb-4 font-bold">{t('Commandes')}</h2>
        {orders.length ? (
          <Table caption={t('Commandes de {name}', { name: u.name })} head={[t('Commande'), t('Événement'), t('Date'), t('Montant'), t('Statut')]}>
            {orders.map((o) => (
              <tr key={o.id}>
                <Td className="font-mono text-xs">{o.id}</Td>
                <Td>{events.find((e) => e.id === o.eventId)?.title}</Td>
                <Td className="text-ink-soft">{dateNumeric(o.createdAt, lang)}</Td>
                <Td className="font-semibold">{moneyRaw(o.total, o.currency, lang)}</Td>
                <Td><Badge tone={o.status === 'paid' ? 'green' : o.status === 'pending' ? 'amber' : 'gray'}>{t(orderStatus[o.status])}</Badge></Td>
              </tr>
            ))}
          </Table>
        ) : (
          <p className="text-sm text-ink-muted">{t('Aucune commande pour ce compte.')}</p>
        )}
      </Card>

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={t('Suspendre {name} ?', { name: u.name })}
        description={t('Le compte ne pourra plus se connecter ni acheter. Les billets déjà achetés restent valides.')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" className="flex-1" onClick={() => setConfirm(false)}>{t('Annuler')}</Button>
            <Button variant="danger" className="flex-1" onClick={toggle}>{t('Suspendre')}</Button>
          </>
        }
      >
        <span />
      </Modal>
    </div>
  );
}

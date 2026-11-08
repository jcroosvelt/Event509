import { useState } from 'react';
import { Building2, Check, Smartphone, Wallet, X } from 'lucide-react';
import { organizers } from '@/data/mock';
import { listAllPayouts, setPayoutStatus } from '@/services/api';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { dateNumeric, moneyRaw } from '@/lib/format';
import { Badge, Button, Card, EmptyState, Loading, Modal, PageHeader, Segmented, Table, Td, type Tone } from '@/components/ui';
import type { Payout } from '@/types';

const method: Record<Payout['method'], { l: string; i: typeof Wallet }> = { bank: { l: 'Virement bancaire', i: Building2 }, moncash: { l: 'MonCash', i: Smartphone }, paypal: { l: 'PayPal', i: Wallet } };
const status: Record<Payout['status'], { l: string; tone: Tone }> = {
  requested: { l: 'À valider', tone: 'amber' },
  processing: { l: 'En cours', tone: 'brand' },
  scheduled: { l: 'Programmé', tone: 'violet' },
  paid: { l: 'Versé', tone: 'green' },
  rejected: { l: 'Refusé', tone: 'red' },
};

export default function AdminPayouts() {
  const { t, lang, toast } = useApp();
  useTitle(t('Versements'));
  const { data, loading, reload } = useAsync(() => listAllPayouts(), []);
  const [tab, setTab] = useState<'todo' | 'all'>('todo');
  const [rejecting, setRejecting] = useState<Payout | null>(null);

  if (loading) return <Loading />;
  const all = data ?? [];
  const list = all.filter((p) => (tab === 'todo' ? p.status === 'requested' || p.status === 'processing' : true));
  const orgName = (id: string) => organizers.find((o) => o.id === id)?.name ?? id;
  const set = async (p: Payout, s: Payout['status']) => {
    await setPayoutStatus(p.id, s);
    toast(s === 'processing' ? t('Versement approuvé : virement en préparation') : s === 'paid' ? t('Versement marqué comme payé') : t('Versement refusé : l’organisateur est prévenu'));
    setRejecting(null);
    reload();
  };

  return (
    <div>
      <PageHeader title={t('Versements aux organisateurs')} subtitle={t('Validez les demandes puis confirmez le paiement une fois le virement effectué.')} />
      <Segmented label={t('Filtre')} className="mb-5" value={tab} onChange={setTab} options={[{ value: 'todo', label: t('À traiter ({n})', { n: all.filter((p) => p.status === 'requested' || p.status === 'processing').length }) }, { value: 'all', label: t('Tous') }]} />
      {!list.length ? (
        <EmptyState icon={<Wallet className="h-5 w-5" />} title={t('Aucun versement à traiter')} />
      ) : (
        <Card>
          <Table caption={t('Versements aux organisateurs')} head={[t('Organisateur'), t('Référence'), t('Date'), t('Méthode'), t('Montant'), t('Statut'), '']}>
            {list.map((p) => {
              const M = method[p.method];
              return (
                <tr key={p.id}>
                  <Td className="font-semibold">{orgName(p.organizerId)}</Td>
                  <Td className="font-mono text-xs">{p.reference}</Td>
                  <Td className="text-ink-soft">{dateNumeric(p.date, lang)}</Td>
                  <Td><span className="flex items-center gap-2"><M.i className="h-4 w-4 text-ink-muted" aria-hidden />{t(M.l)}</span></Td>
                  <Td className="font-bold">{moneyRaw(p.amount, p.currency, lang)}</Td>
                  <Td><Badge tone={status[p.status].tone}>{t(status[p.status].l)}</Badge></Td>
                  <Td>
                    <div className="flex gap-1">
                      {p.status === 'requested' && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setRejecting(p)} aria-label={t('Refuser le versement de {name}', { name: orgName(p.organizerId) })}><X className="h-4 w-4" aria-hidden /></Button>
                          <Button size="sm" onClick={() => set(p, 'processing')}><Check className="h-4 w-4" aria-hidden /> {t('Approuver')}</Button>
                        </>
                      )}
                      {p.status === 'processing' && <Button size="sm" variant="soft" onClick={() => set(p, 'paid')}>{t('Marquer payé')}</Button>}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </Table>
        </Card>
      )}

      <Modal
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        title={t('Refuser le versement de {name} ?', { name: rejecting ? orgName(rejecting.organizerId) : '' })}
        description={rejecting ? t('{amount} restent sur le solde de l’organisateur, qui pourra refaire une demande.', { amount: moneyRaw(rejecting.amount, rejecting.currency, lang) }) : undefined}
        size="sm"
        footer={
          <>
            <Button variant="ghost" className="flex-1" onClick={() => setRejecting(null)}>{t('Annuler')}</Button>
            <Button variant="danger" className="flex-1" onClick={() => rejecting && set(rejecting, 'rejected')}>{t('Refuser le versement')}</Button>
          </>
        }
      >
        <span />
      </Modal>
    </div>
  );
}

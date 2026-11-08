import { useState } from 'react';
import { Check, Undo2, X } from 'lucide-react';
import { decideRefund, listRefunds } from '@/services/api';
import { useAsync, useTitle } from '@/lib/hooks';
import { load, persist, useApp } from '@/store/app';
import { moneyRaw, relative } from '@/lib/format';
import { Avatar, Badge, Button, Card, EmptyState, Field, Loading, PageHeader, Segmented, Select, StatCard, Toggle } from '@/components/ui';

const POLICY_KEY = 'e509.refundPolicy';

export default function Refunds() {
  const { toast, lang, t } = useApp();
  useTitle(t('Remboursements'));
  const { data, loading, reload } = useAsync(() => listRefunds(), []);
  const [tab, setTab] = useState<'pending' | 'done'>('pending');
  const [policy, setPolicyState] = useState(() => load(POLICY_KEY, { window: '7', auto: false }));
  const [deciding, setDeciding] = useState<string | null>(null);
  const setPolicy = (p: typeof policy) => {
    setPolicyState(p);
    persist(POLICY_KEY, p);
    toast(t('Politique de remboursement enregistrée'));
  };

  if (loading) return <Loading />;
  const all = data ?? [];
  const list = all.filter((r) => (tab === 'pending' ? r.status === 'pending' : r.status !== 'pending'));
  const refundedHTG = all.filter((r) => r.status === 'approved' && r.currency === 'HTG').reduce((a, r) => a + r.amount, 0);

  const decide = async (id: string, s: 'approved' | 'declined') => {
    setDeciding(id);
    await decideRefund(id, s);
    setDeciding(null);
    toast(s === 'approved' ? t('Remboursement accepté : le participant est prévenu') : t('Demande refusée : le participant est prévenu'), 'success', {
      label: t('Annuler'),
      run: async () => {
        await decideRefund(id, 'pending');
        reload();
      },
    });
    reload();
  };

  return (
    <div>
      <PageHeader title={t('Remboursements et annulations')} subtitle={t('Traitez les demandes des participants et définissez votre politique.')} />
      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_1fr_1.4fr]">
        <StatCard label={t('En attente')} value={all.filter((r) => r.status === 'pending').length} icon={<Undo2 className="h-[18px] w-[18px]" />} tone="amber" />
        <StatCard label={t('Remboursé (HTG)')} value={moneyRaw(refundedHTG, 'HTG', lang)} tone="green" />
        <Card className="space-y-3">
          <h2 className="text-sm font-bold">{t('Politique de remboursement')}</h2>
          <Field label={t('Délai')}>
            <Select value={policy.window} onChange={(e) => setPolicy({ ...policy, window: e.target.value })}>
              <option value="none">{t('Aucun remboursement')}</option>
              <option value="7">{t('Jusqu’à 7 jours avant l’événement')}</option>
              <option value="1">{t('Jusqu’à 24 h avant l’événement')}</option>
              <option value="always">{t('Toujours remboursable')}</option>
            </Select>
          </Field>
          <Toggle checked={policy.auto} onChange={(v) => setPolicy({ ...policy, auto: v })} label={t('Accepter automatiquement')} description={t('Les demandes faites dans le délai sont remboursées sans votre intervention')} />
        </Card>
      </div>

      <Segmented label={t('Filtre')} className="mb-4" value={tab} onChange={setTab} options={[{ value: 'pending', label: t('À traiter') }, { value: 'done', label: t('Traitées') }]} />
      {!list.length ? (
        <EmptyState icon={<Check className="h-5 w-5" />} title={tab === 'pending' ? t('Rien à traiter') : t('Aucune demande traitée')} body={tab === 'pending' ? t('Toutes les demandes ont été traitées.') : undefined} />
      ) : (
        <ul className="space-y-3">
          {list.map((r) => (
            <li key={r.id}>
              <Card className="flex flex-col gap-4 sm:flex-row sm:items-center">
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
                    <Button variant="outline" onClick={() => decide(r.id, 'declined')} disabled={deciding === r.id}><X className="h-4 w-4" aria-hidden /> {t('Refuser')}</Button>
                    <Button onClick={() => decide(r.id, 'approved')} loading={deciding === r.id}><Check className="h-4 w-4" aria-hidden /> {t('Rembourser')}</Button>
                  </div>
                ) : (
                  <Badge tone={r.status === 'approved' ? 'green' : 'red'}>{r.status === 'approved' ? t('Remboursé') : t('Refusé')}</Badge>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

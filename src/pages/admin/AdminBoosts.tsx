import { useEffect, useState } from 'react';
import { Lock, Plus, Trash2 } from 'lucide-react';
import { DEMO } from '@/services/api';
import { cancelBoost, confirmBoost, getAdminBoosts, saveBoostConfig, type BoostConfig } from '@/services/premium';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { dateShort, moneyRaw } from '@/lib/format';
import { Badge, Button, Card, EmptyState, Field, Input, Loading, PageHeader, Table, Td, Toggle, type Tone } from '@/components/ui';

const STATE: Record<string, { l: string; tone: Tone }> = {
  pending: { l: 'Paiement à confirmer', tone: 'amber' }, active: { l: 'En cours', tone: 'green' }, ended: { l: 'Terminé', tone: 'gray' }, canceled: { l: 'Annulé', tone: 'red' }, failed: { l: 'Paiement échoué', tone: 'red' },
};

/** Boost par événement : formules et prix, nombre de places, paiements à confirmer. */
export default function AdminBoosts() {
  const { t, lang, toast } = useApp();
  useTitle(t('Boosts'));
  const q = useAsync(() => (DEMO ? Promise.resolve(null) : getAdminBoosts()), []);
  const [c, setC] = useState<BoostConfig | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (q.data && !c) setC(q.data.config); }, [q.data, c]);
  if (DEMO) return <EmptyState icon={<Lock className="h-5 w-5" />} title={t('Programme disponible sur le site en ligne')} body={t('Le boost nécessite le serveur.')} />;
  if (!q.data || !c) return <Loading />;
  const num = (v: string) => (v === '' ? 0 : Number(v.replace(/\D/g, '')));
  const setPack = (i: number, p: Partial<BoostConfig['packages'][number]>) => setC({ ...c, packages: c.packages.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const save = async () => {
    setBusy(true);
    try {
      setC(await saveBoostConfig(c));
      toast(t('Réglages du boost enregistrés'));
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Enregistrement impossible'), 'error');
    } finally {
      setBusy(false);
    }
  };
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast(ok); q.reload(); } catch (e) { toast(e instanceof Error ? e.message : t('Action impossible'), 'error'); }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('Boosts')} subtitle={t('Mise en avant payante des événements : formules, prix et places.')} actions={<Button loading={busy} onClick={save}>{t('Enregistrer')}</Button>} />
      <Card>
        <Toggle checked={c.enabled} onChange={(v) => setC({ ...c, enabled: v })} label={t('Boost disponible')} description={t('Désactivé : plus de nouveau boost ; ceux en cours continuent jusqu’à leur fin.')} />
        <div className="mt-4 max-w-xs"><Field label={t('Événements boostés en même temps (maximum)')}><Input type="text" inputMode="numeric" value={String(c.maxActive)} onChange={(e) => setC({ ...c, maxActive: num(e.target.value) })} /></Field></div>
        <h2 className="mb-2 mt-5 font-bold">{t('Formules')}</h2>
        <ul className="space-y-2">
          {c.packages.map((p, i) => (
            <li key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
              <Field label={t('Durée (jours)')}><Input type="text" inputMode="numeric" value={String(p.days)} onChange={(e) => setPack(i, { days: num(e.target.value) })} /></Field>
              <Field label={t('Prix (HTG)')}><Input type="text" inputMode="numeric" value={String(p.price)} onChange={(e) => setPack(i, { price: num(e.target.value) })} /></Field>
              <Button variant="ghost" aria-label={t('Retirer la formule {n}', { n: i + 1 })} disabled={c.packages.length <= 1} onClick={() => setC({ ...c, packages: c.packages.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" aria-hidden /></Button>
            </li>
          ))}
        </ul>
        {c.packages.length < 6 && <Button variant="outline" size="sm" className="mt-3" onClick={() => setC({ ...c, packages: [...c.packages, { days: 30, price: 3000 }] })}><Plus className="h-4 w-4" aria-hidden /> {t('Ajouter une formule')}</Button>}
      </Card>

      <section aria-labelledby="h-bo">
        <h2 id="h-bo" className="mb-3 text-lg font-extrabold">{t('Boosts récents')}</h2>
        {!q.data.items.length ? <p className="text-sm text-ink-muted">{t('Aucun boost pour le moment.')}</p> : (
          <Card className="!p-0 overflow-hidden">
            <Table caption={t('Boosts récents')} head={[t('Organisation'), t('Événement'), t('Durée'), t('Montant'), t('Statut'), '']}>
              {q.data.items.map((b) => (
                <tr key={b.id}>
                  <Td className="font-semibold">{b.organization}</Td><Td className="max-w-[200px] truncate">{b.event}</Td><Td>{b.days} {t('jours')}</Td><Td>{moneyRaw(b.amount, 'HTG', lang)}</Td>
                  <Td><Badge tone={STATE[b.state]?.tone ?? 'gray'}>{t(STATE[b.state]?.l ?? b.state)}</Badge>{b.endsAt && b.state === 'active' && <span className="ml-2 text-xs text-ink-muted">{dateShort(b.endsAt, lang)}</span>}</Td>
                  <Td>
                    <span className="flex gap-1">
                      {b.state === 'pending' && <Button size="sm" variant="soft" onClick={() => act(() => confirmBoost(b.id), t('Paiement confirmé : le boost est actif'))}>{t('Confirmer le paiement')}</Button>}
                      {(b.state === 'pending' || b.state === 'active') && <Button size="sm" variant="ghost" onClick={() => act(() => cancelBoost(b.id), t('Boost annulé'))}>{t('Annuler')}</Button>}
                    </span>
                  </Td>
                </tr>
              ))}
            </Table>
          </Card>
        )}
      </section>
    </div>
  );
}

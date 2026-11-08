import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { organizers } from '@/data/mock';
import { currentFeeSettings, listCustomCommissions, removeCustomCommission, saveCustomCommission, saveFeeSettings } from '@/services/api';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { moneyRaw } from '@/lib/format';
import { computeFees, type FeeSettings } from '@/lib/fees';
import { useForm } from '@/lib/form';
import { Button, Card, Field, Input, Loading, Modal, PageHeader, Select, Table, Td, Toggle } from '@/components/ui';

export default function Commissions() {
  const { toast, lang, t } = useApp();
  useTitle(t('Commissions'));
  const { data, loading, reload } = useAsync(() => listCustomCommissions(), []);
  const [rules, setRules] = useState<FeeSettings>(currentFeeSettings);
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const main = useForm({ fee: String(rules.percent), fixed: String(rules.fixedHTG) }, {
    fee: (v) => (!(Number(v) >= 0 && Number(v) <= 20) ? t('Entre 0 et 20 %') : undefined),
    fixed: (v) => (!(Number(v) >= 0) ? t('Indiquez un montant positif ou 0') : undefined),
  });
  const custom = useForm({ organizerId: organizers[0].id, rate: '4', reason: '' }, {
    rate: (v) => (!(Number(v) >= 0 && Number(v) <= 20) ? t('Entre 0 et 20 %') : undefined),
    reason: (v) => (!String(v).trim() ? t('Indiquez le motif') : undefined),
  });

  if (loading) return <Loading />;
  // Aperçu en direct avec les valeurs saisies (pas encore enregistrées)
  const preview: FeeSettings = { ...rules, percent: Number(main.values.fee) || 0, fixedHTG: Number(main.values.fixed) || 0 };
  const example = 2500;
  const fb = computeFees(preview, example, 1, 'HTG');
  const orgName = (id: string | null) => organizers.find((o) => o.id === id)?.name ?? '';

  const save = async () => {
    if (!main.validate()) return;
    setSaving(true);
    await saveFeeSettings(preview);
    setRules(preview);
    setSaving(false);
    toast(t('Commission mise à jour : elle s’applique aux nouvelles commandes'));
  };
  const setRule = async (patch: Partial<FeeSettings>) => {
    const next = { ...rules, ...patch };
    setRules(next);
    await saveFeeSettings(next);
    toast(t('Règle enregistrée'));
  };
  const openCustom = (orgId?: string) => {
    const c = data?.find((x) => x.organizerId === orgId);
    custom.reset({ organizerId: orgId ?? organizers.find((o) => !data?.some((x) => x.organizerId === o.id))?.id ?? organizers[0].id, rate: String(c?.rate ?? 4), reason: c?.reason ?? '' });
    setEditing(orgId ?? 'new');
  };
  const saveCustom = async () => {
    if (!custom.validate()) return;
    await saveCustomCommission({ organizerId: custom.values.organizerId, rate: Number(custom.values.rate), reason: custom.values.reason });
    setEditing(null);
    toast(t('Taux personnalisé enregistré'));
    reload();
  };

  return (
    <div className="max-w-4xl">
      <PageHeader title={t('Commissions de service')} subtitle={t('Frais appliqués à chaque billet payant. Les changements valent pour les nouvelles commandes.')} />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <form noValidate onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('Pourcentage (%)')} error={main.errors.fee} hint={t('Appliqué au prix après réduction')}><Input type="number" inputMode="decimal" min={0} max={20} step={0.5} {...main.bind('fee')} /></Field>
              <Field label={t('Frais fixes (HTG par billet)')} error={main.errors.fixed} hint={t('Convertis en USD pour les commandes en dollars ; 0 pour désactiver')}><Input type="number" inputMode="numeric" min={0} {...main.bind('fixed')} /></Field>
            </div>
            <Button type="submit" loading={saving}>{t('Enregistrer')}</Button>
          </form>
          <div className="mt-6 space-y-4 border-t border-line pt-5">
            <Toggle checked={rules.passToBuyer} onChange={(v) => setRule({ passToBuyer: v })} label={t('Frais payés par l’acheteur')} description={t('Sinon, déduits du revenu de l’organisateur')} />
            <Toggle checked={rules.freeNoFee} onChange={(v) => setRule({ freeNoFee: v })} label={t('Aucun frais sur les billets gratuits')} />
          </div>
        </Card>
        <Card className="!bg-brand-100" aria-live="polite">
          <h2 className="text-sm font-semibold text-ink-soft">{t('Exemple : billet à {price}', { price: moneyRaw(example, 'HTG', lang) })}</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><dt>{t('Prix')}</dt><dd className="font-bold">{moneyRaw(example, 'HTG', lang)}</dd></div>
            <div className="flex justify-between"><dt>{t('Commission')}</dt><dd className="font-bold">{moneyRaw(fb.fee, 'HTG', lang)}</dd></div>
            <div className="flex justify-between border-t border-ink/10 pt-2"><dt>{t('Payé par l’acheteur')}</dt><dd className="font-bold">{moneyRaw(fb.total, 'HTG', lang)}</dd></div>
            <div className="flex justify-between"><dt>{t('Reçu par l’organisateur')}</dt><dd className="font-bold">{moneyRaw(fb.organizerNet, 'HTG', lang)}</dd></div>
          </dl>
        </Card>
      </div>

      <Card className="mt-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold">{t('Taux personnalisés')}</h2>
            <p className="text-sm text-ink-soft">{t('Remplacent le pourcentage par défaut pour un organisateur ; les frais fixes restent appliqués.')}</p>
          </div>
          <Button size="sm" variant="soft" onClick={() => openCustom()}><Plus className="h-4 w-4" aria-hidden /> {t('Ajouter')}</Button>
        </div>
        <Table caption={t('Taux personnalisés')} head={[t('Organisateur'), t('Taux'), t('Motif'), '']}>
          {(data ?? []).map((c) => (
            <tr key={c.organizerId}>
              <Td className="font-semibold">{orgName(c.organizerId)}</Td>
              <Td>{c.rate.toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR')} %</Td>
              <Td className="text-ink-soft">{t(c.reason)}</Td>
              <Td>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openCustom(c.organizerId)}>{t('Modifier')}</Button>
                  <Button size="sm" variant="ghost" aria-label={t('Supprimer le taux de {name}', { name: orgName(c.organizerId) })} onClick={() => setRemoving(c.organizerId)}><Trash2 className="h-4 w-4" aria-hidden /></Button>
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>

      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={t('Supprimer le taux de {name} ?', { name: orgName(removing) })}
        description={t('Cet organisateur repassera au taux par défaut ({n} %) pour ses prochaines commandes.', { n: rules.percent })}
        size="sm"
        footer={
          <>
            <Button variant="ghost" className="flex-1" onClick={() => setRemoving(null)}>{t('Annuler')}</Button>
            <Button variant="danger" className="flex-1" onClick={async () => { await removeCustomCommission(removing!); setRemoving(null); toast(t('Taux personnalisé supprimé')); reload(); }}>{t('Supprimer le taux')}</Button>
          </>
        }
      >
        <span />
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={t('Taux personnalisé')} size="sm" footer={<Button className="flex-1" onClick={saveCustom}>{t('Enregistrer')}</Button>}>
        <form noValidate onSubmit={(e) => { e.preventDefault(); saveCustom(); }} className="space-y-4">
          <Field label={t('Organisateur')}>
            <Select {...custom.bind('organizerId')} disabled={editing !== 'new'}>{organizers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>
          </Field>
          <Field label={t('Taux (%)')} error={custom.errors.rate} required><Input type="number" inputMode="decimal" step={0.5} min={0} max={20} {...custom.bind('rate')} /></Field>
          <Field label={t('Motif')} error={custom.errors.reason} required><Input {...custom.bind('reason')} placeholder={t('Ex. Association, gros volume…')} /></Field>
        </form>
      </Modal>
    </div>
  );
}

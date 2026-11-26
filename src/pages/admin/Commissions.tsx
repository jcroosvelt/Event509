import { useState } from 'react';
import { currentExchangeRates, currentFeeSettings, saveFeeSettings } from '@/services/api';
import { useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { moneyRaw } from '@/lib/format';
import { computeFees, type FeeSettings } from '@/lib/fees';
import { useForm, cleanNumber } from '@/lib/form';
import { RateCard } from '@/components/RateCard';
import { Button, Card, Field, Input, PageHeader, Toggle } from '@/components/ui';

export default function Commissions() {
  const { toast, lang, t } = useApp();
  useTitle(t('Commissions'));
  const [rules, setRules] = useState<FeeSettings>(currentFeeSettings);
  const [share, setShare] = useState(() => String(currentFeeSettings().buyerShare));
  const [shareErr, setShareErr] = useState('');
  const [saving, setSaving] = useState(false);
  const main = useForm({ fee: String(rules.percent), fixed: String(rules.fixedHTG) }, {
    fee: (v) => (!(Number(v) >= 0 && Number(v) <= 20) ? t('Entre 0 et 20 %') : undefined),
    fixed: (v) => (!(Number(v) >= 0) ? t('Indiquez un montant positif ou 0') : undefined),
  });

  // Aperçu en direct avec les valeurs saisies (pas encore enregistrées)
  const preview: FeeSettings = { ...rules, percent: Number(main.values.fee) || 0, fixedHTG: Number(main.values.fixed) || 0 };
  const example = 2500;
  const fb = computeFees(preview, example, 1, 'HTG');

  const save = async () => {
    if (!main.validate()) return;
    setSaving(true);
    await saveFeeSettings(preview);
    setRules(preview);
    setSaving(false);
    toast(t('Commission mise à jour : elle s’applique aux nouvelles commandes'));
  };
  const saveShare = async () => {
    const v = Number(share);
    if (share === '' || !(v >= 0 && v <= 100)) return setShareErr(t('Indiquez un pourcentage entre 0 et 100'));
    await setRule({ buyerShare: v });
  };
  const setRule = async (patch: Partial<FeeSettings>) => {
    const next = { ...rules, ...patch };
    setRules(next);
    await saveFeeSettings(next);
    toast(t('Règle enregistrée'));
  };
  return (
    <div className="max-w-4xl">
      <PageHeader title={t('Commissions de service')} subtitle={t('Frais appliqués à chaque billet payant. Les changements valent pour les nouvelles commandes.')} />
      <RateCard fallback={currentExchangeRates().USD} />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <form noValidate onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('Pourcentage (%)')} error={main.errors.fee} hint={t('Appliqué au prix après réduction')}><Input type="text" inputMode="decimal" autoComplete="off" {...main.bind('fee')} onChange={(e) => main.set('fee', cleanNumber(e.target.value, true))} /></Field>
              <Field label={t('Frais fixes (HTG par billet)')} error={main.errors.fixed} hint={t('Convertis en USD pour les commandes en dollars ; 0 pour désactiver')}><Input type="text" inputMode="numeric" autoComplete="off" {...main.bind('fixed')} onChange={(e) => main.set('fixed', cleanNumber(e.target.value, false))} /></Field>
            </div>
            <Button type="submit" loading={saving}>{t('Enregistrer')}</Button>
          </form>
          <div className="mt-6 space-y-4 border-t border-line pt-5">
            <Field label={t('Part de la commission payée par l’acheteur (%)')} error={shareErr} hint={t('Le reste est déduit du revenu de l’organisateur. 50 : sur {rate} % de commission, {half} % pour l’acheteur et {half} % pour l’organisateur.', { rate: preview.percent, half: Math.round(preview.percent * 50) / 100 })}>
              <div className="flex gap-2">
                <Input type="text" inputMode="numeric" autoComplete="off" value={share} onChange={(e) => { setShare(cleanNumber(e.target.value, false)); setShareErr(''); }} className="w-28" />
                <Button type="button" variant="outline" onClick={saveShare}>{t('Enregistrer')}</Button>
              </div>
            </Field>
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

    </div>
  );
}

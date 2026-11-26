import { useEffect, useState } from 'react';
import { DEMO } from '@/services/api';
import { getRateInfo, setAutoRate, setManualRate, type RateInfo } from '@/services/premium';
import { useApp } from '@/store/app';
import { dateShort } from '@/lib/format';
import { Badge, Button, Card, Field, Input } from '@/components/ui';

/** Taux de change (gourdes pour 1 dollar) : automatique chaque jour, ou fixé à la main par l'administration. */
export function RateCard({ fallback }: { fallback: number }) {
  const { t, toast, lang } = useApp();
  const [info, setInfo] = useState<RateInfo | null>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (DEMO) return;
    getRateInfo().then((r) => { setInfo(r); setValue(String(r.usdToHtg)); }).catch(() => {});
  }, []);

  const run = async (fn: () => Promise<RateInfo>, ok: string) => {
    setBusy(true);
    try {
      const r = await fn();
      setInfo(r);
      setValue(String(r.usdToHtg));
      toast(ok);
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Action impossible. Réessayez.'), 'error');
    } finally {
      setBusy(false);
    }
  };
  const rate = info?.usdToHtg ?? fallback;
  const n = Number(value.replace(',', '.'));
  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-bold">{t('Taux de change')}</h2>
        {info && <Badge tone={info.manual ? 'amber' : 'green'}>{info.manual ? t('Fixé à la main') : t('Automatique')}</Badge>}
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        {t('Le site gère deux monnaies : la gourde (HTG) et le dollar américain (USD). Par défaut le taux se met à jour chaque jour ; vous pouvez aussi le fixer vous-même. Le paiement est toujours prélevé en gourdes ; les commandes déjà passées ne changent pas.')}
      </p>
      <p className="mt-3 text-lg font-extrabold">{t('1 USD = {rate} HTG', { rate: String(rate) })}</p>
      {info?.at && <p className="text-xs text-ink-muted">{t('Dernière mise à jour : {d}', { d: dateShort(info.at, lang) })}</p>}
      {!DEMO && (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="w-40">
            <Field label={t('Nouveau taux (HTG pour 1 USD)')}>
              <Input type="text" inputMode="decimal" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value.replace(/[^0-9.,]/g, ''))} />
            </Field>
          </div>
          <Button loading={busy} disabled={!(n >= 10 && n <= 10_000)} onClick={() => void run(() => setManualRate(n), t('Taux fixé : 1 USD = {rate} HTG', { rate: String(n) }))}>{t('Fixer ce taux')}</Button>
          {info?.manual && <Button variant="outline" loading={busy} onClick={() => void run(setAutoRate, t('Retour au taux automatique'))}>{t('Revenir à l’automatique')}</Button>}
        </div>
      )}
    </Card>
  );
}

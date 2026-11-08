import { useState } from 'react';
import { useApp } from '@/store/app';
import { moneyRaw } from '@/lib/format';
import { Button, Card, Field, Input, PageHeader, Table, Td, Toggle } from '@/components/ui';

export default function Commissions() {
  const { feePercent, setFeePercent, toast, lang } = useApp();
  const [fee, setFee] = useState(feePercent);
  const [fixed, setFixed] = useState(25);
  const [passToBuyer, setPassToBuyer] = useState(true);
  const [freeNoFee, setFreeNoFee] = useState(true);
  const example = 2500;

  return (
    <div className="max-w-4xl">
      <PageHeader title="Commissions de service" subtitle="Frais appliqués à chaque billet payant." />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Pourcentage (%)" hint="Appliqué au prix après réduction">
              <Input type="number" min={0} max={20} step={0.5} value={fee} onChange={(e) => setFee(Math.max(0, Math.min(20, +e.target.value)))} />
            </Field>
            <Field label="Frais fixes (HTG / billet)" hint="0 pour désactiver">
              <Input type="number" min={0} value={fixed} onChange={(e) => setFixed(Math.max(0, +e.target.value))} />
            </Field>
          </div>
          <Toggle checked={passToBuyer} onChange={setPassToBuyer} label="Frais payés par l’acheteur" description="Sinon, déduits du revenu de l’organisateur" />
          <Toggle checked={freeNoFee} onChange={setFreeNoFee} label="Aucun frais sur les billets gratuits" />
          <Button onClick={() => { setFeePercent(fee); toast('Commission mise à jour — appliquée aux nouvelles commandes'); }}>Enregistrer</Button>
        </Card>
        <Card className="bg-brand-100">
          <div className="text-sm font-semibold text-ink-soft">Exemple : billet à {moneyRaw(example, 'HTG', lang)}</div>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><span>Prix</span><b>{moneyRaw(example, 'HTG', lang)}</b></div>
            <div className="flex justify-between"><span>Commission</span><b>{moneyRaw(example * fee / 100 + fixed, 'HTG', lang)}</b></div>
            <div className="flex justify-between border-t border-ink/10 pt-2"><span>Payé par l’acheteur</span><b>{moneyRaw(passToBuyer ? example + example * fee / 100 + fixed : example, 'HTG', lang)}</b></div>
            <div className="flex justify-between"><span>Reçu par l’organisateur</span><b>{moneyRaw(passToBuyer ? example : example - example * fee / 100 - fixed, 'HTG', lang)}</b></div>
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="mb-4 font-bold">Taux personnalisés</h2>
        <Table head={['Organisateur', 'Taux', 'Motif', '']}>
          {[['Tech Ayiti', '3%', 'Association / éducation'], ['Lakay Productions', '4,5%', 'Volume > 10 000 billets / an']].map(([o, r, m]) => (
            <tr key={o}><Td className="font-semibold">{o}</Td><Td>{r}</Td><Td className="text-ink-soft">{m}</Td><Td><Button size="sm" variant="ghost">Modifier</Button></Td></tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

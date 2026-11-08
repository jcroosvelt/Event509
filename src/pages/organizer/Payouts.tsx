import { useState } from 'react';
import { Building2, Download, FileText, Smartphone, Wallet } from 'lucide-react';
import { listPayouts } from '@/services/api';
import { useAsync } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { dateNumeric, moneyRaw } from '@/lib/format';
import { exportCSV } from '@/lib/export';
import { Badge, Button, Card, Field, IconBadge, Input, Loading, Modal, PageHeader, Select, Table, Td } from '@/components/ui';

const method = { bank: { l: 'Virement bancaire', i: Building2 }, moncash: { l: 'MonCash', i: Smartphone }, paypal: { l: 'PayPal', i: Wallet } };
const status = { paid: { l: 'Versé', tone: 'green' as const }, processing: { l: 'En cours', tone: 'amber' as const }, scheduled: { l: 'Programmé', tone: 'brand' as const } };

export default function Payouts() {
  const { lang, toast, feePercent } = useApp();
  const { data, loading } = useAsync(() => listPayouts(), []);
  const [acc, setAcc] = useState(false);

  if (loading) return <Loading />;
  const gross = 5_628_500;
  const fees = Math.round(gross * (feePercent / 100));
  const refunded = 10_000;
  const paid = (data ?? []).filter((p) => p.status === 'paid' && p.currency === 'HTG').reduce((a, p) => a + p.amount, 0);
  const balance = gross - fees - refunded - paid;

  return (
    <div>
      <PageHeader
        title="Versements & factures"
        subtitle="Vos revenus nets, versés automatiquement chaque semaine."
        actions={<Button variant="outline" onClick={() => setAcc(true)}>Compte de versement</Button>}
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="rounded-3xl bg-brand-100 p-6">
          <div className="text-sm font-semibold text-ink-soft">Solde disponible</div>
          <div className="mt-1 text-4xl font-extrabold tracking-tight">{moneyRaw(balance, 'HTG', lang)}</div>
          <div className="mt-1 text-sm text-ink-soft">+ {moneyRaw(1240, 'USD', lang)} en USD</div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={() => toast('Versement anticipé demandé')}>Demander un versement</Button>
            <span className="self-center text-xs text-ink-muted">Prochain versement auto : 15/11/2026</span>
          </div>
        </div>
        <Card className="space-y-3 text-sm">
          <div className="font-bold">Détail (HTG)</div>
          <div className="flex justify-between"><span className="text-ink-soft">Ventes brutes</span><span className="font-semibold">{moneyRaw(gross, 'HTG', lang)}</span></div>
          <div className="flex justify-between"><span className="text-ink-soft">Commission Event509 ({feePercent}%)</span><span className="font-semibold text-red-600">−{moneyRaw(fees, 'HTG', lang)}</span></div>
          <div className="flex justify-between"><span className="text-ink-soft">Remboursements</span><span className="font-semibold text-red-600">−{moneyRaw(refunded, 'HTG', lang)}</span></div>
          <div className="flex justify-between"><span className="text-ink-soft">Déjà versé</span><span className="font-semibold">−{moneyRaw(paid, 'HTG', lang)}</span></div>
          <div className="flex justify-between border-t border-line pt-3"><span className="font-bold">Solde</span><span className="font-extrabold">{moneyRaw(balance, 'HTG', lang)}</span></div>
        </Card>
      </div>

      <Card className="mb-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold">Historique des versements</h2>
          <Button size="sm" variant="outline" onClick={() => exportCSV((data ?? []).map((p) => ({ Référence: p.reference, Date: p.date, Montant: p.amount, Devise: p.currency, Méthode: method[p.method].l, Statut: status[p.status].l })), 'versements')}>
            <Download className="h-4 w-4" /> Exporter
          </Button>
        </div>
        <Table head={['Référence', 'Date', 'Méthode', 'Montant', 'Statut']}>
          {(data ?? []).map((p) => {
            const M = method[p.method];
            return (
              <tr key={p.id}>
                <Td className="font-mono text-xs">{p.reference}</Td>
                <Td className="text-ink-soft">{dateNumeric(p.date, lang)}</Td>
                <Td><span className="flex items-center gap-2"><M.i className="h-4 w-4 text-ink-muted" />{M.l}</span></Td>
                <Td className="font-bold">{moneyRaw(p.amount, p.currency, lang)}</Td>
                <Td><Badge tone={status[p.status].tone}>{status[p.status].l}</Badge></Td>
              </tr>
            );
          })}
        </Table>
      </Card>

      <Card>
        <h2 className="mb-4 font-bold">Factures de commission</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {['Octobre 2026', 'Septembre 2026', 'Août 2026'].map((m, i) => (
            <button key={m} onClick={() => toast(`Facture ${m} téléchargée`, 'info')} className="flex items-center gap-3 rounded-2xl bg-canvas p-4 text-left hover:bg-brand-50">
              <IconBadge tone="red"><FileText className="h-[18px] w-[18px]" /></IconBadge>
              <div className="flex-1"><div className="text-sm font-bold">{m}</div><div className="text-xs text-ink-muted">FAC-2026-{10 - i} · PDF</div></div>
              <Download className="h-4 w-4 text-ink-muted" />
            </button>
          ))}
        </div>
      </Card>

      <Modal open={acc} onClose={() => setAcc(false)} title="Compte de versement" size="sm" footer={<Button className="flex-1" onClick={() => { setAcc(false); toast('Compte enregistré'); }}>Enregistrer</Button>}>
        <div className="space-y-4">
          <Field label="Méthode"><Select><option>Virement bancaire</option><option>MonCash</option><option>NatCash</option><option>PayPal</option></Select></Field>
          <Field label="Titulaire"><Input defaultValue="Lakay Productions SA" /></Field>
          <Field label="Numéro de compte / téléphone"><Input defaultValue="•••• 4567" /></Field>
          <Field label="Fréquence"><Select><option>Chaque semaine</option><option>Toutes les 2 semaines</option><option>Après chaque événement</option></Select></Field>
        </div>
      </Modal>
    </div>
  );
}

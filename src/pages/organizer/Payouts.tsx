import { useState } from 'react';
import { Building2, Download, FileText, Smartphone, Wallet } from 'lucide-react';
import { getBalance, listPayouts, requestPayout } from '@/services/api';
import { useAsync, useTitle } from '@/lib/hooks';
import { load, persist, useApp } from '@/store/app';
import { dateNumeric, moneyRaw } from '@/lib/format';
import { exportCSV } from '@/lib/export';
import { orgOf } from '@/lib/permissions';
import { useForm } from '@/lib/form';
import { Badge, Button, Card, Field, IconBadge, Input, Loading, Modal, PageHeader, Segmented, Select, Table, Td, type Tone } from '@/components/ui';
import type { Currency, Payout } from '@/types';

const method: Record<Payout['method'], { l: string; i: typeof Wallet }> = {
  bank: { l: 'Virement bancaire', i: Building2 },
  moncash: { l: 'MonCash', i: Smartphone },
  paypal: { l: 'PayPal', i: Wallet },
};
const status: Record<Payout['status'], { l: string; tone: Tone }> = {
  paid: { l: 'Versé', tone: 'green' },
  processing: { l: 'En cours', tone: 'amber' },
  scheduled: { l: 'Programmé', tone: 'brand' },
};
const ACC = 'e509.payoutAccount';

export default function Payouts() {
  const { lang, toast, feePercent, t, user } = useApp();
  useTitle(t('Versements et factures'));
  const orgId = orgOf(user);
  const { data, loading, reload } = useAsync(() => Promise.all([listPayouts(), getBalance(orgId, feePercent)]), [orgId, feePercent]);
  const [cur, setCur] = useState<Currency>('HTG');
  const [accOpen, setAccOpen] = useState(false);
  const [reqOpen, setReqOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [account, setAccount] = useState(() => load(ACC, { method: 'bank' as Payout['method'], holder: 'Lakay Productions SA', number: '•••• 4567', frequency: 'weekly' }));
  const acc = useForm(account, {
    holder: (v) => (!String(v).trim() ? t('Indiquez le titulaire du compte') : undefined),
    number: (v) => (String(v).replace(/\D/g, '').length < 4 && !String(v).includes('•') ? t('Indiquez le numéro de compte ou de téléphone') : undefined),
  });
  const req = useForm({ amount: '' }, {});

  if (loading || !data) return <Loading />;
  const [payouts, balance] = data;
  const b = balance[cur];

  const saveAccount = () => {
    if (!acc.validate()) return;
    setAccount(acc.values);
    persist(ACC, acc.values);
    setAccOpen(false);
    toast(t('Compte de versement enregistré'));
  };

  const askPayout = async () => {
    const amount = Number(req.values.amount);
    if (!(amount > 0)) return req.setErrors({ amount: t('Indiquez un montant supérieur à 0') });
    if (amount > b.balance) return req.setErrors({ amount: t('Le montant dépasse votre solde disponible ({max})', { max: moneyRaw(b.balance, cur, lang) }) });
    setBusy(true);
    await requestPayout(amount, cur, account.method);
    setBusy(false);
    setReqOpen(false);
    toast(t('Versement demandé : il arrive sous 1 à 2 jours ouvrés'));
    reload();
  };

  const invoices = Array.from({ length: 3 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i - 1);
    return { label: d.toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR', { month: 'long', year: 'numeric' }), ref: `FAC-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, fees: Math.round(b.fees / (i + 3)) };
  });

  return (
    <div>
      <PageHeader title={t('Versements et factures')} subtitle={t('Vos revenus nets, versés automatiquement selon la fréquence choisie.')} actions={<Button variant="outline" onClick={() => { acc.reset(account); setAccOpen(true); }}>{t('Compte de versement')}</Button>} />

      <Segmented label={t('Devise')} className="mb-4" value={cur} onChange={setCur} options={[{ value: 'HTG', label: 'HTG' }, { value: 'USD', label: 'USD' }]} />
      <div className="mb-6 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="rounded-3xl bg-brand-100 p-6">
          <h2 className="text-sm font-semibold text-ink-soft">{t('Solde disponible')}</h2>
          <div className="mt-1 text-4xl font-extrabold tracking-tight">{moneyRaw(b.balance, cur, lang)}</div>
          <p className="mt-1 text-sm text-ink-soft">{t('Versé sur : {method}', { method: `${t(method[account.method].l)} ${account.number}` })}</p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button onClick={() => { req.reset({ amount: String(Math.floor(b.balance)) }); setReqOpen(true); }}>{t('Demander un versement')}</Button>
          </div>
        </div>
        <Card>
          <h2 className="mb-3 font-bold">{t('Détail ({cur})', { cur })}</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-ink-soft">{t('Ventes brutes')}</dt><dd className="font-semibold">{moneyRaw(b.gross, cur, lang)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-soft">{t('Commission Event509 ({n} %)', { n: feePercent })}</dt><dd className="font-semibold text-red-600">−{moneyRaw(b.fees, cur, lang)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-soft">{t('Remboursements')}</dt><dd className="font-semibold text-red-600">−{moneyRaw(b.refunded, cur, lang)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-soft">{t('Déjà versé')}</dt><dd className="font-semibold">−{moneyRaw(b.paid, cur, lang)}</dd></div>
            <div className="flex justify-between border-t border-line pt-3"><dt className="font-bold">{t('Solde')}</dt><dd className="font-extrabold">{moneyRaw(b.balance, cur, lang)}</dd></div>
          </dl>
        </Card>
      </div>

      <Card className="mb-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold">{t('Historique des versements')}</h2>
          <Button size="sm" variant="outline" onClick={() => exportCSV(payouts.map((p) => ({ [t('Référence')]: p.reference, [t('Date')]: p.date, [t('Montant')]: p.amount, [t('Devise')]: p.currency, [t('Méthode')]: t(method[p.method].l), [t('Statut')]: t(status[p.status].l) })), 'versements')}>
            <Download className="h-4 w-4" aria-hidden /> {t('Exporter')}
          </Button>
        </div>
        <Table caption={t('Historique des versements')} head={[t('Référence'), t('Date'), t('Méthode'), t('Montant'), t('Statut')]}>
          {payouts.map((p) => {
            const M = method[p.method];
            return (
              <tr key={p.id}>
                <Td className="font-mono text-xs">{p.reference}</Td>
                <Td className="text-ink-soft">{dateNumeric(p.date, lang)}</Td>
                <Td><span className="flex items-center gap-2"><M.i className="h-4 w-4 text-ink-muted" aria-hidden />{t(M.l)}</span></Td>
                <Td className="font-bold">{moneyRaw(p.amount, p.currency, lang)}</Td>
                <Td><Badge tone={status[p.status].tone}>{t(status[p.status].l)}</Badge></Td>
              </tr>
            );
          })}
        </Table>
      </Card>

      <Card>
        <h2 className="mb-4 font-bold">{t('Factures de commission')}</h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {invoices.map((inv) => (
            <li key={inv.ref}>
              <button
                type="button"
                onClick={() => exportCSV([{ [t('Facture')]: inv.ref, [t('Période')]: inv.label, [t('Commission')]: inv.fees, [t('Devise')]: cur }], inv.ref)}
                className="flex w-full items-center gap-3 rounded-2xl bg-canvas p-4 text-left hover:bg-brand-50"
              >
                <IconBadge tone="red"><FileText className="h-[18px] w-[18px]" /></IconBadge>
                <span className="flex-1"><span className="block text-sm font-bold first-letter:uppercase">{inv.label}</span><span className="block text-xs text-ink-muted">{inv.ref}</span></span>
                <Download className="h-4 w-4 text-ink-muted" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Modal open={accOpen} onClose={() => setAccOpen(false)} title={t('Compte de versement')} size="sm" footer={<Button className="flex-1" onClick={saveAccount}>{t('Enregistrer')}</Button>}>
        <form noValidate onSubmit={(e) => { e.preventDefault(); saveAccount(); }} className="space-y-4">
          <Field label={t('Méthode')}>
            <Select {...acc.bind('method')}>
              {(Object.keys(method) as Payout['method'][]).map((m) => <option key={m} value={m}>{t(method[m].l)}</option>)}
            </Select>
          </Field>
          <Field label={t('Titulaire')} error={acc.errors.holder} required><Input autoComplete="name" {...acc.bind('holder')} /></Field>
          <Field label={acc.values.method === 'moncash' ? t('Numéro MonCash') : acc.values.method === 'paypal' ? t('Email PayPal') : t('Numéro de compte')} error={acc.errors.number} required><Input {...acc.bind('number')} /></Field>
          <Field label={t('Fréquence')}>
            <Select {...acc.bind('frequency')}>
              <option value="weekly">{t('Chaque semaine')}</option>
              <option value="biweekly">{t('Toutes les 2 semaines')}</option>
              <option value="event">{t('Après chaque événement')}</option>
            </Select>
          </Field>
        </form>
      </Modal>

      <Modal open={reqOpen} onClose={() => setReqOpen(false)} title={t('Demander un versement')} description={t('Disponible : {max}', { max: moneyRaw(b.balance, cur, lang) })} size="sm" footer={<Button className="flex-1" onClick={askPayout} loading={busy}>{t('Confirmer')}</Button>}>
        <form noValidate onSubmit={(e) => { e.preventDefault(); askPayout(); }}>
          <Field label={t('Montant ({cur})', { cur })} error={req.errors.amount} required><Input type="number" inputMode="decimal" min={1} {...req.bind('amount')} /></Field>
        </form>
      </Modal>
    </div>
  );
}

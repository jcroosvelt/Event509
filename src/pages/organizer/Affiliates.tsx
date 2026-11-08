import { useState } from 'react';
import { Copy, MousePointerClick, Plus, Share2, Ticket, Wallet } from 'lucide-react';
import { listAmbassadors, saveAmbassador } from '@/services/api';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { compact, moneyRaw, num, uid } from '@/lib/format';
import { isEmail, useForm } from '@/lib/form';
import { ApiError } from '@/lib/errors';
import { Avatar, Button, Card, EmptyState, Field, Input, Loading, Modal, PageHeader, StatCard, Table, Td } from '@/components/ui';

export default function Affiliates() {
  const { lang, toast, t } = useApp();
  useTitle(t('Ambassadeurs'));
  const { data, loading, reload } = useAsync(() => listAmbassadors(), []);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const form = useForm(
    { name: '', email: '', code: '', commission: '5' },
    {
      name: (v) => (!String(v).trim() ? t('Indiquez le nom de l’ambassadeur') : undefined),
      email: (v) => (!isEmail(v) ? t('Saisissez une adresse comme nom@domaine.com') : undefined),
      code: (v) => (String(v).length < 3 ? t('Au moins 3 lettres ou chiffres') : undefined),
      commission: (v) => (!(Number(v) >= 1 && Number(v) <= 30) ? t('Entre 1 et 30 %') : undefined),
    },
  );

  if (loading) return <Loading />;
  const list = data ?? [];
  const sum = (k: 'clicks' | 'sales' | 'revenue') => list.reduce((a, x) => a + x[k], 0);

  const invite = async () => {
    if (!form.validate()) return;
    setBusy(true);
    try {
      await saveAmbassador({ id: uid('am'), name: form.values.name, code: form.values.code, clicks: 0, sales: 0, revenue: 0, commission: Number(form.values.commission) });
      setOpen(false);
      toast(t('Invitation envoyée à {email}', { email: form.values.email }));
      form.reset();
      reload();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) form.setErrors({ code: t('Ce code est déjà utilisé : choisissez-en un autre') });
      else toast(t('L’invitation n’a pas pu être envoyée. Réessayez.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title={t('Ambassadeurs et affiliation')} subtitle={t('Des promoteurs qui vendent vos billets contre une commission.')} actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden /> {t('Inviter un ambassadeur')}</Button>} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('Ambassadeurs')} value={list.length} icon={<Share2 className="h-[18px] w-[18px]" />} />
        <StatCard label={t('Clics')} value={compact(sum('clicks'), lang)} icon={<MousePointerClick className="h-[18px] w-[18px]" />} tone="violet" />
        <StatCard label={t('Billets vendus')} value={num(sum('sales'), lang)} icon={<Ticket className="h-[18px] w-[18px]" />} tone="orange" />
        <StatCard label={t('Revenus générés')} value={compact(sum('revenue'), lang)} unit="HTG" icon={<Wallet className="h-[18px] w-[18px]" />} tone="green" />
      </div>
      {!list.length ? (
        <EmptyState icon={<Share2 className="h-5 w-5" />} title={t('Aucun ambassadeur')} action={<Button onClick={() => setOpen(true)}>{t('Inviter un ambassadeur')}</Button>} />
      ) : (
        <Card>
          <Table caption={t('Ambassadeurs')} head={[t('Ambassadeur'), t('Code / lien'), t('Clics'), t('Ventes'), t('Conversion'), t('Revenus'), t('Commission due')]}>
            {list.map((a) => (
              <tr key={a.id}>
                <Td><span className="flex items-center gap-3"><Avatar name={a.name} size={34} /><b>{a.name}</b></span></Td>
                <Td>
                  <button type="button" className="flex items-center gap-2 font-mono text-xs font-bold text-brand" aria-label={t('Copier le lien de {name}', { name: a.name })} onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/?ref=${a.code}`).then(() => toast(t('Lien copié')))}>
                    {a.code} <Copy className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </Td>
                <Td>{num(a.clicks, lang)}</Td>
                <Td>{num(a.sales, lang)}</Td>
                <Td>{a.clicks ? ((a.sales / a.clicks) * 100).toFixed(1) : '0'} %</Td>
                <Td>{moneyRaw(a.revenue, 'HTG', lang)}</Td>
                <Td className="font-bold">{moneyRaw((a.revenue * a.commission) / 100, 'HTG', lang)} <span className="font-normal text-ink-muted">({a.commission} %)</span></Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={t('Inviter un ambassadeur')} size="sm" footer={<Button className="flex-1" onClick={invite} loading={busy}>{t('Inviter')}</Button>}>
        <form noValidate onSubmit={(e) => { e.preventDefault(); invite(); }} className="space-y-4">
          <Field label={t('Nom')} error={form.errors.name} required>
            <Input
              autoComplete="off"
              {...form.bind('name')}
              onChange={(e) => {
                form.set('name', e.target.value);
                if (!form.values.code || form.values.code === form.values.name.split(' ')[0].toUpperCase().normalize('NFD').replace(/[^A-Z]/g, ''))
                  form.set('code', e.target.value.split(' ')[0].toUpperCase().normalize('NFD').replace(/[^A-Z]/g, ''));
              }}
            />
          </Field>
          <Field label={t('Email')} error={form.errors.email} required><Input type="email" autoComplete="off" {...form.bind('email')} /></Field>
          <Field label={t('Code de parrainage')} error={form.errors.code} required><Input autoCapitalize="characters" {...form.bind('code')} onChange={(e) => form.set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} /></Field>
          <Field label={t('Commission (%)')} error={form.errors.commission} required><Input type="number" inputMode="decimal" min={1} max={30} {...form.bind('commission')} /></Field>
        </form>
      </Modal>
    </div>
  );
}

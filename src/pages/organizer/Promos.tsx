import { useState } from 'react';
import { BadgePercent, Copy, Plus } from 'lucide-react';
import { events } from '@/data/mock';
import { listPromoCodes, savePromo } from '@/services/api';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { dateNumeric, uid } from '@/lib/format';
import { orgOf } from '@/lib/permissions';
import { useForm } from '@/lib/form';
import { ApiError } from '@/lib/errors';
import { Badge, Button, Card, EmptyState, Field, Input, Loading, Modal, PageHeader, ProgressBar, Segmented, Select, Table, Td, Toggle } from '@/components/ui';
import type { PromoCode } from '@/types';

export default function Promos() {
  const { toast, lang, t, user } = useApp();
  useTitle(t('Codes promo'));
  const { data, loading, reload } = useAsync(() => listPromoCodes(), []);
  const [editing, setEditing] = useState<PromoCode | null>(null);
  const [busy, setBusy] = useState(false);
  const myEvents = events.filter((e) => e.organizerId === orgOf(user));

  const form = useForm(
    { code: '', type: 'percent', value: '10', limit: '100', expiresAt: '', eventId: 'all', active: 'true' },
    {
      code: (v) => (String(v).length < 3 ? t('Au moins 3 lettres ou chiffres') : undefined),
      value: (v, all) => (!(Number(v) > 0) ? t('Indiquez une valeur supérieure à 0') : all.type === 'percent' && Number(v) > 100 ? t('Un pourcentage ne peut pas dépasser 100') : undefined),
      limit: (v) => (!(Number(v) >= 1) ? t('Au moins 1 utilisation') : undefined),
      expiresAt: (v) => (!v ? t('Choisissez une date de fin') : new Date(String(v)) < new Date() ? t('La date de fin doit être dans le futur') : undefined),
    },
  );

  if (loading) return <Loading />;

  const open = (p?: PromoCode) => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    const base = p ?? { id: uid('p'), code: '', type: 'percent' as const, value: 10, used: 0, limit: 100, expiresAt: d.toISOString().slice(0, 16), eventId: 'all', active: true };
    setEditing(base);
    form.reset({ code: base.code, type: base.type, value: String(base.value), limit: String(base.limit), expiresAt: base.expiresAt.slice(0, 16), eventId: base.eventId, active: String(base.active) });
  };

  const save = async () => {
    if (!editing || !form.validate()) return;
    setBusy(true);
    try {
      const v = form.values;
      await savePromo({ ...editing, code: v.code, type: v.type as PromoCode['type'], value: Number(v.value), limit: Number(v.limit), expiresAt: v.expiresAt, eventId: v.eventId, active: v.active === 'true' });
      setEditing(null);
      toast(t('Code promo enregistré'));
      reload();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) form.setErrors({ code: t('Ce code existe déjà : choisissez-en un autre') });
      else toast(t('L’enregistrement a échoué. Réessayez.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title={t('Codes promo')} subtitle={t('Réductions en pourcentage ou montant fixe, limitées en nombre et dans le temps.')} actions={<Button onClick={() => open()}><Plus className="h-4 w-4" aria-hidden /> {t('Nouveau code')}</Button>} />
      {!data?.length ? (
        <EmptyState icon={<BadgePercent className="h-5 w-5" />} title={t('Aucun code promo')} body={t('Créez un code pour vos ambassadeurs, vos abonnés ou une offre de lancement.')} action={<Button onClick={() => open()}>{t('Nouveau code')}</Button>} />
      ) : (
        <Card>
          <Table caption={t('Codes promo')} head={[t('Code'), t('Réduction'), t('Événement'), t('Utilisation'), t('Expire le'), t('Statut'), '']}>
            {data.map((p) => {
              const expired = new Date(p.expiresAt) < new Date();
              const statusLabel = p.used >= p.limit ? t('Épuisé') : expired ? t('Expiré') : p.active ? t('Actif') : t('Désactivé');
              return (
                <tr key={p.id}>
                  <Td><span className="flex items-center gap-2 font-mono font-bold"><BadgePercent className="h-4 w-4 text-brand" aria-hidden />{p.code}</span></Td>
                  <Td className="font-semibold">{p.type === 'percent' ? `−${p.value} %` : `−${p.value} HTG`}</Td>
                  <Td className="max-w-[200px] truncate text-ink-soft">{p.eventId === 'all' ? t('Tous les événements') : events.find((e) => e.id === p.eventId)?.title}</Td>
                  <Td><div className="w-32"><div className="mb-1 text-xs text-ink-muted">{p.used}/{p.limit}</div><ProgressBar value={p.used / p.limit} label={t('Utilisation de {code}', { code: p.code })} /></div></Td>
                  <Td className="text-ink-soft">{dateNumeric(p.expiresAt, lang)}</Td>
                  <Td><Badge tone={p.active && p.used < p.limit && !expired ? 'green' : 'gray'}>{statusLabel}</Badge></Td>
                  <Td>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => navigator.clipboard?.writeText(p.code).then(() => toast(t('Code copié')))} aria-label={t('Copier le code {code}', { code: p.code })}><Copy className="h-4 w-4" aria-hidden /></Button>
                      <Button size="sm" variant="ghost" onClick={() => open(p)}>{t('Modifier')}</Button>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </Table>
        </Card>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.code ? t('Code {code}', { code: editing.code }) : t('Nouveau code promo')} footer={<Button className="flex-1" onClick={save} loading={busy}>{t('Enregistrer')}</Button>}>
        <form noValidate onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4">
          <Field label={t('Code')} error={form.errors.code} hint={t('Lettres et chiffres, sans espace')} required>
            <Input placeholder="NOEL2026" autoCapitalize="characters" {...form.bind('code')} onChange={(e) => form.set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="mb-1.5 block text-sm font-semibold">{t('Type')}</span>
              <Segmented label={t('Type de réduction')} value={form.values.type} onChange={(v) => form.set('type', v)} options={[{ value: 'percent', label: '%' }, { value: 'fixed', label: t('Montant') }]} />
            </div>
            <Field label={t('Valeur')} error={form.errors.value} required><Input type="number" inputMode="decimal" min={1} {...form.bind('value')} /></Field>
            <Field label={t('Utilisations max.')} error={form.errors.limit} required><Input type="number" inputMode="numeric" min={1} {...form.bind('limit')} /></Field>
            <Field label={t('Expiration')} error={form.errors.expiresAt} required><Input type="datetime-local" {...form.bind('expiresAt')} /></Field>
          </div>
          <Field label={t('Événement')}>
            <Select {...form.bind('eventId')}>
              <option value="all">{t('Tous mes événements')}</option>
              {myEvents.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
            </Select>
          </Field>
          <Toggle checked={form.values.active === 'true'} onChange={(v) => form.set('active', String(v))} label={t('Actif')} />
        </form>
      </Modal>
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Link2, Lock, Plus, Trash2 } from 'lucide-react';
import { DEMO } from '@/services/api';
import { createLink, deleteLink, listLinks } from '@/services/premium';
import { ApiError } from '@/lib/errors';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { moneyRaw } from '@/lib/format';
import { orgOf } from '@/lib/permissions';
import { events } from '@/data/mock';
import { Button, Card, EmptyState, Field, Input, Loading, PageHeader, Select, Table, Td } from '@/components/ui';

/** Liens de suivi : un lien par canal (Instagram, affiches…) pour savoir d'où viennent les clics et les ventes. */
export default function Links() {
  const { t, lang, toast, user } = useApp();
  useTitle(t('Liens de suivi'));
  const q = useAsync(() => (DEMO ? Promise.resolve(null) : listLinks()), []);
  const [label, setLabel] = useState('');
  const [eventId, setEventId] = useState('');
  const [busy, setBusy] = useState(false);
  const mine = events.filter((e) => e.organizerId === orgOf(user) && e.status === 'published');
  if (DEMO) return <EmptyState icon={<Lock className="h-5 w-5" />} title={t('Programme disponible sur le site en ligne')} body={t('Les liens de suivi nécessitent le serveur.')} />;
  if (q.error instanceof ApiError && q.error.status === 403)
    return <EmptyState icon={<Lock className="h-5 w-5" />} title={t('Réservé aux organisateurs vérifiés')} body={t('Liens de suivi, codes promo avancés et campagnes auprès de vos acheteurs consentants.')} action={<Link to="/organisateur-verifie" className="font-semibold text-brand-ink">{t('Découvrir le programme')}</Link>} />;
  if (!q.data) return <Loading />;
  const urlFor = (code: string, ev: string | null) => {
    const slug = ev ? events.find((e) => e.id === ev)?.slug : '';
    return `${window.location.origin}${slug ? `/e/${slug}` : '/'}?src=${code}`;
  };
  const add = async () => {
    setBusy(true);
    try {
      await createLink(label.trim(), eventId);
      setLabel('');
      toast(t('Lien créé'));
      q.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Action impossible. Réessayez.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('Liens de suivi')} subtitle={t('Partagez un lien différent par canal et comparez clics, ventes et conversion.')} />
      <Card>
        <h2 className="mb-3 font-bold">{t('Nouveau lien')}</h2>
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label={t('Nom du canal')}><Input value={label} maxLength={60} placeholder="Instagram" onChange={(e) => setLabel(e.target.value)} /></Field>
          <Field label={t('Page ciblée')}>
            <Select value={eventId} onChange={(e) => setEventId(e.target.value)}>
              <option value="">{t('Accueil du site')}</option>
              {mine.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
            </Select>
          </Field>
          <Button loading={busy} onClick={add}><Plus className="h-4 w-4" aria-hidden /> {t('Créer')}</Button>
        </div>
      </Card>

      {!q.data.length ? <EmptyState icon={<Link2 className="h-5 w-5" />} title={t('Aucun lien')} body={t('Créez un lien pour chaque endroit où vous annoncez vos événements.')} /> : (
        <Card className="!p-0 overflow-hidden">
          <Table caption={t('Liens de suivi')} head={[t('Canal'), t('Clics'), t('Ventes'), t('Chiffre d’affaires'), t('Conversion'), '']}>
            {q.data.map((l) => (
              <tr key={l.id}>
                <Td><b className="block">{l.label}</b><span className="block max-w-[260px] truncate text-xs text-ink-muted">{l.event ?? t('Accueil du site')}</span></Td>
                <Td>{l.clicks}</Td><Td>{l.orders}</Td><Td>{moneyRaw(l.revenue, 'HTG', lang)}</Td><Td>{l.conversion} %</Td>
                <Td>
                  <span className="flex gap-1">
                    <Button size="sm" variant="ghost" aria-label={t('Copier le lien {label}', { label: l.label })} onClick={() => navigator.clipboard?.writeText(urlFor(l.code, l.eventId)).then(() => toast(t('Lien copié')))}><Copy className="h-4 w-4" aria-hidden /></Button>
                    <Button size="sm" variant="ghost" aria-label={t('Supprimer le lien {label}', { label: l.label })} onClick={async () => { await deleteLink(l.id).catch(() => {}); q.reload(); }}><Trash2 className="h-4 w-4" aria-hidden /></Button>
                  </span>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}

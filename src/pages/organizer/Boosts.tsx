import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Lock, Rocket } from 'lucide-react';
import { DEMO, listOrganizerEvents } from '@/services/api';
import { createBoost, getBoostConfig, listBoosts, type OrgBoost } from '@/services/premium';
import { orgOf } from '@/lib/permissions';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { dateShort, moneyRaw } from '@/lib/format';
import { Badge, Button, Card, EmptyState, Field, Loading, PageHeader, Select, Table, Td, type Tone } from '@/components/ui';

const STATE: Record<OrgBoost['state'], { l: string; tone: Tone }> = {
  pending: { l: 'En attente de paiement', tone: 'amber' }, active: { l: 'En cours', tone: 'green' }, ended: { l: 'Terminé', tone: 'gray' }, canceled: { l: 'Annulé', tone: 'red' }, failed: { l: 'Paiement échoué', tone: 'red' },
};
const METHODS: { v: string; l: string }[] = [{ v: 'moncash', l: 'MonCash' }, { v: 'natcash', l: 'NatCash' }, { v: 'kashpaw', l: 'KashPaw' }, { v: 'card', l: 'Carte bancaire' }];

/** Boost par événement : mise en avant payante (« Sponsorisé ») pour une durée au choix, avec les résultats obtenus. */
export default function Boosts() {
  const { t, lang, toast, user } = useApp();
  useTitle(t('Boost'));
  const [params] = useSearchParams();
  const orgId = orgOf(user);
  const cfg = useAsync(() => (DEMO ? Promise.resolve(null) : getBoostConfig()), []);
  const list = useAsync(() => (DEMO ? Promise.resolve(null) : listBoosts()), []);
  const evs = useAsync(() => (DEMO ? Promise.resolve(null) : listOrganizerEvents(orgId)), [orgId]);
  const [eventId, setEventId] = useState(params.get('e') ?? '');
  const [days, setDays] = useState(0);
  const [method, setMethod] = useState('moncash');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (cfg.data && !days) setDays(cfg.data.packages[Math.min(1, cfg.data.packages.length - 1)]!.days); }, [cfg.data, days]);
  if (DEMO) return <EmptyState icon={<Lock className="h-5 w-5" />} title={t('Programme disponible sur le site en ligne')} body={t('Le boost nécessite le serveur.')} />;
  if (!cfg.data || !list.data || !evs.data) return <Loading />;
  const c = cfg.data;
  const now = new Date().toISOString().slice(0, 16);
  const eligible = evs.data.filter((e) => e.status === 'published' && e.end >= now);
  const pack = c.packages.find((p) => p.days === days);

  const pay = async () => {
    if (!eventId || !pack) return toast(t('Choisissez un événement et une durée'), 'error');
    setBusy(true);
    try {
      const r = await createBoost(eventId, pack.days, method);
      if (r.payUrl) { window.location.assign(r.payUrl); return; }
      toast(r.paid ? t('Boost activé : votre événement est mis en avant') : t('Demande enregistrée : le boost démarre dès que l’administration a confirmé votre paiement.'));
      list.reload(); cfg.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Action impossible. Réessayez.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={t('Boost')} subtitle={t('Mettez un événement en avant sur l’accueil et en tête du classement « Populaires », avec l’étiquette « Sponsorisé ».')} />
      {!c.enabled ? <Card><p className="text-sm text-ink-soft">{t('Le boost n’est pas disponible pour le moment.')}</p></Card> : (
        <Card>
          <h2 className="mb-3 font-bold">{t('Nouveau boost')}</h2>
          {!eligible.length ? <p className="text-sm text-ink-soft">{t('Aucun événement publié et à venir à booster.')}</p> : (
            <div className="space-y-4">
              <Field label={t('Événement')}>
                <Select value={eventId} onChange={(e) => setEventId(e.target.value)}>
                  <option value="">{t('Choisir…')}</option>
                  {eligible.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
                </Select>
              </Field>
              <div role="radiogroup" aria-label={t('Durée du boost')} className="grid gap-3 sm:grid-cols-3">
                {c.packages.map((p) => (
                  <button key={p.days} type="button" role="radio" aria-checked={days === p.days} onClick={() => setDays(p.days)} className={`rounded-3xl border p-4 text-left transition ${days === p.days ? 'border-brand ring-4 ring-brand/10' : 'border-line hover:border-ink/20'}`}>
                    <span className="block font-bold">{p.days} {t('jours')}</span>
                    <span className="mt-1 block text-2xl font-extrabold">{moneyRaw(p.price, 'HTG', lang)}</span>
                    <span className="text-xs text-ink-muted">{moneyRaw(Math.round(p.price / p.days), 'HTG', lang)} / {t('jour')}</span>
                  </button>
                ))}
              </div>
              {c.onlinePayment && <div className="max-w-xs"><Field label={t('Moyen de paiement')}><Select value={method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map((m) => <option key={m.v} value={m.v}>{t(m.l)}</option>)}</Select></Field></div>}
              {!c.onlinePayment && <p className="rounded-2xl bg-canvas p-3 text-sm text-ink-soft">{t('Le paiement en ligne n’est pas encore disponible : votre demande est enregistrée et l’administration la confirme dès réception de votre paiement.')}</p>}
              <p className="text-xs text-ink-muted">{t('Places de boost disponibles : {n} sur {max}. Le boost augmente la visibilité mais ne garantit pas un nombre de ventes.', { n: c.slotsLeft, max: c.maxActive })}</p>
              <Button loading={busy} disabled={c.slotsLeft === 0} onClick={pay}><Rocket className="h-4 w-4" aria-hidden /> {pack ? t('Booster pour {price}', { price: moneyRaw(pack.price, 'HTG', lang) }) : t('Booster')}</Button>
            </div>
          )}
        </Card>
      )}

      <section aria-labelledby="h-bl">
        <h2 id="h-bl" className="mb-3 text-lg font-extrabold">{t('Mes boosts')}</h2>
        {!list.data.length ? <p className="text-sm text-ink-muted">{t('Aucun boost pour le moment.')}</p> : (
          <Card className="!p-0 overflow-hidden">
            <Table caption={t('Mes boosts')} head={[t('Événement'), t('Durée'), t('Montant'), t('Période'), t('Résultats'), t('Statut')]}>
              {list.data.map((b) => (
                <tr key={b.id}>
                  <Td className="max-w-[200px] truncate font-semibold">{b.event}</Td>
                  <Td>{b.days} {t('jours')}</Td>
                  <Td>{moneyRaw(b.amount, 'HTG', lang)}</Td>
                  <Td className="text-ink-soft">{b.startsAt && b.endsAt ? `${dateShort(b.startsAt, lang)} → ${dateShort(b.endsAt, lang)}` : '—'}</Td>
                  <Td className="text-sm">{b.startsAt ? t('{v} vues · {n} billets', { v: b.views, n: b.tickets }) : '—'}</Td>
                  <Td><Badge tone={STATE[b.state].tone}>{t(STATE[b.state].l)}</Badge></Td>
                </tr>
              ))}
            </Table>
          </Card>
        )}
      </section>
    </div>
  );
}

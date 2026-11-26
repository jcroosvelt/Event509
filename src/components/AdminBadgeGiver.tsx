import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { DEMO, setOrganizerVerified } from '@/services/api';
import { getAdminOrganizers, type AdminOrganizerRow } from '@/services/premium';
import { useApp } from '@/store/app';
import { dateShort } from '@/lib/format';
import { Avatar, Badge, Button, Card, Spinner } from '@/components/ui';
import { VerifiedBadge } from '@/components/VerifiedBadge';

/** L'administration choisit librement n'importe quel organisateur pour lui donner (1 an) ou lui retirer le badge rouge, sans demande ni paiement. */
export function AdminBadgeGiver() {
  const { t, toast, lang } = useApp();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<AdminOrganizerRow[] | null>(null);
  const [busy, setBusy] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (DEMO) return;
    let alive = true;
    const id = window.setTimeout(() => {
      getAdminOrganizers(q.trim()).then((r) => alive && setRows(r)).catch(() => alive && setRows([]));
    }, q ? 250 : 0);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [q, tick]);

  const toggle = async (o: AdminOrganizerRow, lifetime = false) => {
    setBusy(o.id);
    try {
      await setOrganizerVerified(o.id, !o.verified || lifetime, lifetime);
      toast(o.verified && !lifetime ? t('Badge retiré : {name}', { name: o.name }) : lifetime ? t('Badge à vie donné : {name}', { name: o.name }) : t('Badge donné pour 1 an : {name}', { name: o.name }));
      setTick((n) => n + 1);
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Action impossible. Réessayez.'), 'error');
    } finally {
      setBusy('');
    }
  };

  if (DEMO) return null;
  return (
    <Card className="mb-6">
      <h2 className="font-bold">{t('Donner le badge à un organisateur')}</h2>
      <p className="mt-1 text-sm text-ink-muted">{t('Choisissez n’importe quel organisateur : le badge rouge est offert pour 1 an, sans demande ni paiement. Il est aussi offert automatiquement après {n} billets vendus.', { n: 500 })}</p>
      <label className="relative mt-3 block">
        <span className="sr-only">{t('Rechercher un organisateur')}</span>
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('Rechercher un organisateur')}
          className="h-11 w-full rounded-2xl border border-line bg-surface pl-9 pr-3 text-sm outline-none focus:border-brand"
        />
      </label>
      <div className="mt-3 max-h-96 overflow-y-auto">
        {rows === null ? <div className="grid place-items-center py-6"><Spinner /></div> : !rows.length ? <p className="py-4 text-sm text-ink-muted">{t('Aucun organisateur trouvé.')}</p> : (
          <ul className="divide-y divide-line">
            {rows.map((o) => (
              <li key={o.id} className="flex items-center gap-3 py-2.5">
                <Avatar name={o.name} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 truncate font-semibold">{o.name} {o.verified && <VerifiedBadge size={16} />}</p>
                  <p className="truncate text-xs text-ink-muted">
                    {[o.owner, t('{n} billets payés vendus', { n: o.ticketsSold })].filter(Boolean).join(' · ')}
                    {o.verified && o.lifetime ? ` · ${t('à vie')}` : o.verified && o.until ? ` · ${t('jusqu’au {d}', { d: dateShort(o.until, lang) })}` : ''}
                  </p>
                </div>
                {o.verified && <Badge tone="green">{o.lifetime ? t('À vie') : o.bySales ? t('Offert (ventes)') : o.gift ? t('Offert') : t('Vérifié')}</Badge>}
                {!o.lifetime && <Button size="sm" variant="outline" loading={busy === o.id} onClick={() => void toggle(o, true)}>{t('À vie')}</Button>}
                <Button size="sm" variant={o.verified ? 'outline' : 'primary'} loading={busy === o.id} onClick={() => void toggle(o)}>
                  {o.verified ? t('Retirer') : t('Donner le badge')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

import { Link } from 'react-router-dom';
import { Undo2 } from 'lucide-react';
import { events } from '@/data/mock';
import { useApp } from '@/store/app';
import { useTitle } from '@/lib/hooks';
import { dateNumeric, moneyRaw } from '@/lib/format';
import { Badge, Card, EmptyState, PageHeader, type Tone } from '@/components/ui';

const st: Record<string, { l: string; tone: Tone }> = { pending: { l: 'En cours d’examen', tone: 'amber' }, approved: { l: 'Accepté', tone: 'green' }, declined: { l: 'Refusé', tone: 'red' } };

/** Suivi des demandes de remboursement de l'acheteur. */
export default function BuyerRefunds() {
  const { orders, t, lang } = useApp();
  useTitle(t('Remboursements'));
  const list = orders.filter((o) => o.refundRequest).sort((a, b) => (b.refundRequest!.at ?? '').localeCompare(a.refundRequest!.at ?? ''));
  return (
    <div>
      <PageHeader title={t('Remboursements')} subtitle={t('Suivez vos demandes. Pour en faire une, ouvrez la commande dans votre historique d’achats.')} />
      {!list.length ? (
        <EmptyState icon={<Undo2 className="h-5 w-5" />} title={t('Aucune demande de remboursement')} body={t('Vos demandes apparaîtront ici avec leur décision.')} action={<Link to="/compte/achats" className="text-sm font-semibold text-brand-ink">{t('Historique des achats')}</Link>} />
      ) : (
        <ul className="space-y-3">
          {list.map((o) => {
            const r = o.refundRequest!;
            const s = st[r.status] ?? st.pending!;
            return (
              <li key={o.id}>
                <Card className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-bold">{events.find((e) => e.id === o.eventId)?.title ?? o.eventId}</h2>
                    <p className="text-sm text-ink-soft">{t('Commande {id}', { id: o.id })} · {moneyRaw(o.total, o.currency, lang)} · {t('demandé le {date}', { date: dateNumeric(r.at, lang) })}</p>
                    <p className="text-xs text-ink-muted">{t(r.reason)}</p>
                  </div>
                  <Badge tone={s.tone}>{t(s.l)}</Badge>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

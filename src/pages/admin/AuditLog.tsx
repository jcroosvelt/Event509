import { useState } from 'react';
import { Download, History, Search } from 'lucide-react';
import { listAudit } from '@/services/api';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { dateLong, time } from '@/lib/format';
import { exportCSV } from '@/lib/export';
import { Button, Card, EmptyState, Input, Loading, PageHeader } from '@/components/ui';

export default function AuditLog() {
  const { t, lang } = useApp();
  useTitle(t('Journal d’activité'));
  const { data, loading } = useAsync(() => listAudit(), []);
  const [q, setQ] = useState('');

  if (loading) return <Loading />;
  const list = (data ?? []).filter((a) => `${a.action} ${a.target} ${a.actor}`.toLowerCase().includes(q.toLowerCase()));
  const byDay = list.reduce<Record<string, typeof list>>((acc, a) => {
    (acc[a.at.slice(0, 10)] ??= []).push(a);
    return acc;
  }, {});

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={t('Journal d’activité')}
        subtitle={t('Toutes les actions de l’administration, de la plus récente à la plus ancienne.')}
        actions={<Button variant="outline" onClick={() => exportCSV(list.map((a) => ({ [t('Date')]: a.at, [t('Auteur')]: a.actor, [t('Action')]: t(a.action), [t('Objet')]: a.target })), 'journal-admin')}><Download className="h-4 w-4" aria-hidden /> CSV</Button>}
      />
      <div className="mb-4" role="search">
        <label htmlFor="audit-q" className="sr-only">{t('Rechercher dans le journal')}</label>
        <Input id="audit-q" type="search" icon={<Search className="h-4 w-4" />} placeholder={t('Action, objet, auteur…')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!list.length ? (
        <EmptyState icon={<History className="h-5 w-5" />} title={t('Aucune action enregistrée')} />
      ) : (
        <div className="space-y-6">
          {Object.entries(byDay).map(([day, entries]) => (
            <section key={day} aria-label={dateLong(`${day}T12:00:00`, lang)}>
              <h2 className="mb-2 text-sm font-semibold text-ink-muted first-letter:uppercase">{dateLong(`${day}T12:00:00`, lang)}</h2>
              <Card className="p-2">
                <ol className="divide-y divide-line">
                  {entries.map((a) => (
                    <li key={a.id} className="flex items-start gap-3 px-3 py-3 text-sm">
                      <span className="w-12 shrink-0 text-xs font-semibold text-ink-muted">{time(a.at, lang)}</span>
                      <span className="min-w-0 flex-1"><b>{t(a.action)}</b> <span className="text-ink-soft">· {a.target}</span><span className="block text-xs text-ink-muted">{a.actor}</span></span>
                    </li>
                  ))}
                </ol>
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

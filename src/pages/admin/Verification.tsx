import { useState } from 'react';
import { BadgeCheck, Check, FileText, X } from 'lucide-react';
import { organizers } from '@/data/mock';
import { saveOrganizer } from '@/services/api';
import { useApp } from '@/store/app';
import { useTitle } from '@/lib/hooks';
import { Avatar, Badge, Button, Card, EmptyState, PageHeader, Segmented } from '@/components/ui';

type Status = 'pending' | 'approved' | 'rejected';
const DOCS = ['Pièce d’identité', 'Patente / NIF', 'Justificatif bancaire'];

const initial: { id: string; orgId?: string; name: string; owner: string; city: string; docs: string[]; status: Status }[] = [
  { id: 'v1', orgId: 'org3', name: 'Jakmèl Arts Collectif', owner: 'Carl-Henry Michel', city: 'Jacmel', docs: DOCS, status: 'pending' },
  { id: 'v2', name: 'Konbit Events', owner: 'Darline Etienne', city: 'Les Cayes', docs: ['Pièce d’identité'], status: 'pending' },
  { id: 'v3', orgId: 'org4', name: 'Saveurs du Nord', owner: 'Jameson Noel', city: 'Cap-Haïtien', docs: DOCS, status: 'approved' },
];

export default function Verification() {
  const { toast, t } = useApp();
  useTitle(t('Vérification des organisateurs'));
  const [list, setList] = useState(initial);
  const [tab, setTab] = useState<'pending' | 'done'>('pending');
  const shown = list.filter((v) => (tab === 'pending' ? v.status === 'pending' : v.status !== 'pending'));

  const set = async (id: string, status: Status) => {
    const v = list.find((x) => x.id === id)!;
    if (v.orgId) await saveOrganizer(v.orgId, { verified: status === 'approved' });
    const o = organizers.find((x) => x.id === v.orgId);
    if (o) o.verified = status === 'approved';
    setList((l) => l.map((x) => (x.id === id ? { ...x, status } : x)));
    toast(status === 'approved' ? t('{name} est vérifié', { name: v.name }) : t('Demande de {name} refusée : l’organisateur est prévenu', { name: v.name }));
  };

  return (
    <div>
      <PageHeader title={t('Vérification des organisateurs')} subtitle={t('Contrôlez les documents avant d’attribuer le badge vérifié.')} />
      <Segmented label={t('Filtre')} className="mb-5" value={tab} onChange={setTab} options={[{ value: 'pending', label: t('À vérifier') }, { value: 'done', label: t('Traitées') }]} />
      {!shown.length ? (
        <EmptyState icon={<BadgeCheck className="h-5 w-5" />} title={t('Aucune demande')} />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {shown.map((v) => {
            const complete = DOCS.every((d) => v.docs.includes(d));
            return (
              <li key={v.id}>
                <Card className="h-full">
                  <div className="flex items-center gap-3">
                    <Avatar name={v.name} size={48} />
                    <div className="flex-1">
                      <h2 className="flex items-center gap-1 font-bold">{v.name} {v.status === 'approved' && <BadgeCheck className="h-4 w-4 text-brand-ink" aria-label={t('Vérifié')} />}</h2>
                      <p className="text-sm text-ink-muted">{v.owner} · {v.city}</p>
                    </div>
                    <Badge tone={v.status === 'approved' ? 'green' : v.status === 'rejected' ? 'red' : 'amber'}>{v.status === 'approved' ? t('Vérifié') : v.status === 'rejected' ? t('Refusé') : t('À vérifier')}</Badge>
                  </div>
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {DOCS.map((d) => {
                      const ok = v.docs.includes(d);
                      return (
                        <li key={d} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-canvas text-ink-muted'}`}>
                          <FileText className="h-3.5 w-3.5" aria-hidden /> {t(d)} <span className="sr-only">{ok ? t('fourni') : t('manquant')}</span>{!ok && <span aria-hidden> — {t('manquant')}</span>}
                        </li>
                      );
                    })}
                  </ul>
                  {v.status === 'pending' && (
                    <div className="mt-4 flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={() => set(v.id, 'rejected')}><X className="h-4 w-4" aria-hidden /> {complete ? t('Refuser') : t('Demander les documents')}</Button>
                      <Button className="flex-1" onClick={() => (complete ? set(v.id, 'approved') : toast(t('Des documents manquent : demandez-les avant de vérifier'), 'info'))}><Check className="h-4 w-4" aria-hidden /> {t('Vérifier')}</Button>
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

import { useState } from 'react';
import { BadgeCheck, Check, FileText, X } from 'lucide-react';
import { useApp } from '@/store/app';
import { Avatar, Badge, Button, Card, PageHeader } from '@/components/ui';

const initial = [
  { id: 'v1', name: 'Jakmèl Arts Collectif', owner: 'Carl-Henry Michel', city: 'Jacmel', docs: ['Pièce d’identité', 'Patente', 'RIB'], status: 'pending' as 'pending' | 'approved' | 'rejected' },
  { id: 'v2', name: 'Konbit Events', owner: 'Darline Etienne', city: 'Les Cayes', docs: ['Pièce d’identité'], status: 'pending' as 'pending' | 'approved' | 'rejected' },
  { id: 'v3', name: 'Saveurs du Nord', owner: 'Jameson Noel', city: 'Cap-Haïtien', docs: ['Pièce d’identité', 'Patente', 'RIB'], status: 'approved' as 'pending' | 'approved' | 'rejected' },
];

export default function Verification() {
  const { toast } = useApp();
  const [list, setList] = useState(initial);
  const set = (id: string, status: 'approved' | 'rejected') => {
    setList((l) => l.map((x) => (x.id === id ? { ...x, status } : x)));
    toast(status === 'approved' ? 'Organisateur vérifié' : 'Demande refusée');
  };

  return (
    <div>
      <PageHeader title="Vérification des organisateurs" subtitle="Contrôlez les documents avant d’attribuer le badge vérifié." />
      <div className="grid gap-4 lg:grid-cols-2">
        {list.map((v) => (
          <Card key={v.id}>
            <div className="flex items-center gap-3">
              <Avatar name={v.name} size={48} />
              <div className="flex-1">
                <div className="flex items-center gap-1 font-bold">{v.name} {v.status === 'approved' && <BadgeCheck className="h-4 w-4 text-brand" />}</div>
                <div className="text-sm text-ink-muted">{v.owner} · {v.city}</div>
              </div>
              <Badge tone={v.status === 'approved' ? 'green' : v.status === 'rejected' ? 'red' : 'amber'}>{v.status === 'approved' ? 'Vérifié' : v.status === 'rejected' ? 'Refusé' : 'À vérifier'}</Badge>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {['Pièce d’identité', 'Patente', 'RIB'].map((d) => (
                <span key={d} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${v.docs.includes(d) ? 'bg-emerald-50 text-emerald-700' : 'bg-canvas text-ink-muted line-through'}`}>
                  <FileText className="h-3.5 w-3.5" /> {d}
                </span>
              ))}
            </div>
            {v.status === 'pending' && (
              <div className="mt-4 flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => set(v.id, 'rejected')}><X className="h-4 w-4" /> Refuser</Button>
                <Button className="flex-1" disabled={v.docs.length < 3} onClick={() => set(v.id, 'approved')}><Check className="h-4 w-4" /> Vérifier</Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

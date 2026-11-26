import { useEffect, useState } from 'react';
import { UserX } from 'lucide-react';
import { useApp } from '@/store/app';
import { communityAvailable, myBlocks, unblock } from '@/services/community';
import { Avatar, Button, Card } from '@/components/ui';

/** Membres bloqués : on ne voit plus leurs commentaires ni leurs photos ; on peut les débloquer à tout moment. */
export function BlockedMembers() {
  const { t, toast } = useApp();
  const [list, setList] = useState<{ id: string; name: string; avatarUrl?: string }[] | null>(null);
  useEffect(() => { if (communityAvailable) myBlocks().then(setList).catch(() => setList([])); }, []);
  if (!communityAvailable || !list) return null;
  return (
    <Card className="mt-4">
      <h2 className="flex items-center gap-2 font-bold"><UserX className="h-4 w-4" aria-hidden /> {t('Membres bloqués')}</h2>
      {!list.length ? <p className="mt-2 text-sm text-ink-muted">{t('Vous n’avez bloqué personne.')}</p> : (
        <ul className="mt-3 divide-y divide-line">
          {list.map((b) => (
            <li key={b.id} className="flex items-center gap-3 py-2">
              <Avatar name={b.name} src={b.avatarUrl} size={32} />
              <span className="flex-1 text-sm font-semibold">{b.name}</span>
              <Button size="sm" variant="outline" onClick={() => void unblock(b.id).then(() => { setList((l) => (l ?? []).filter((x) => x.id !== b.id)); toast(t('Membre débloqué')); }).catch(() => toast(t('Action impossible. Réessayez.'), 'error'))}>{t('Débloquer')}</Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

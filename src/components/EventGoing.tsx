import { useCallback, useEffect, useState } from 'react';
import { Check, UserPlus, Users } from 'lucide-react';
import { useApp } from '@/store/app';
import { communityAvailable, getGoing, setGoing, type GoingState } from '@/services/community';
import { Avatar, Button } from '@/components/ui';

/** « Je participe » : intention de venir (sans billet), avec le nom et la photo de quelques participants ; « Inviter des amis » ouvre le partage. */
export function EventGoing({ eventId, open, onInvite }: { eventId: string; open: boolean; onInvite: () => void }) {
  const { t, user, toast } = useApp();
  const [s, setS] = useState<GoingState | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { getGoing(eventId).then(setS).catch(() => {}); }, [eventId]);
  useEffect(() => { if (communityAvailable) load(); }, [load, user?.id]);
  if (!communityAvailable || !s) return null;
  if (!open && s.count === 0) return null;

  const toggle = async () => {
    if (!user) return toast(t('Connectez-vous pour participer'), 'error');
    setBusy(true);
    try {
      setS(await setGoing(eventId, !s.me));
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Action impossible. Réessayez.'), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-4 rounded-3xl bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-3">
        {s.people.length > 0 && (
          <ul className="flex -space-x-2" aria-label={t('Personnes qui participent')}>
            {s.people.slice(0, 6).map((p, i) => <li key={`${p.name}${i}`} title={p.name}><Avatar name={p.name} src={p.avatarUrl} size={32} className="ring-2 ring-surface" /></li>)}
          </ul>
        )}
        <p className="min-w-0 flex-1 text-sm text-ink-soft">
          <Users className="mr-1 inline h-4 w-4" aria-hidden />
          {s.count === 0 ? t('Soyez le premier à participer') : s.count === 1 ? t('1 personne participe') : t('{n} personnes participent', { n: s.count })}
          {s.people.length > 0 && <span className="block truncate text-xs text-ink-muted">{s.people.slice(0, 3).map((p) => p.name).join(', ')}{s.count > 3 ? '…' : ''}</span>}
        </p>
        {open && (
          <div className="flex gap-2">
            <Button size="sm" variant={s.me ? 'soft' : 'primary'} aria-pressed={s.me} loading={busy} onClick={() => void toggle()}>{s.me && <Check className="h-4 w-4" aria-hidden />} {s.me ? t('Vous participez') : t('Je participe')}</Button>
            <Button size="sm" variant="outline" onClick={onInvite}><UserPlus className="h-4 w-4" aria-hidden /> {t('Inviter des amis')}</Button>
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Hourglass } from 'lucide-react';
import { useApp } from '@/store/app';
import { communityAvailable, joinWaitlist, leaveWaitlist, myWaitlist } from '@/services/community';
import { Button } from '@/components/ui';

/** Billet complet : liste d'attente. On est prévenu dès que des places se libèrent (premier arrivé, premier servi : aucune place n'est réservée). */
export function WaitlistButton({ eventId, ticketTypeId }: { eventId: string; ticketTypeId: string }) {
  const { t, user, toast } = useApp();
  const loc = useLocation();
  const [on, setOn] = useState<boolean | null>(null);
  const [pos, setPos] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!communityAvailable || !user) return setOn(false);
    myWaitlist(eventId).then((l) => setOn(l.some((x) => x.ticketTypeId === ticketTypeId))).catch(() => setOn(false));
  }, [eventId, ticketTypeId, user]);
  if (!communityAvailable) return null;
  if (!user)
    return <Link to={`/connexion?next=${encodeURIComponent(loc.pathname)}`} className="mt-3 inline-block text-sm font-semibold text-brand-ink">{t('Connectez-vous pour rejoindre la liste d’attente')}</Link>;
  const toggle = async () => {
    setBusy(true);
    try {
      if (on) { await leaveWaitlist(eventId, ticketTypeId); setOn(false); setPos(null); toast(t('Vous avez quitté la liste d’attente')); }
      else { const r = await joinWaitlist(eventId, ticketTypeId, 1); setOn(true); setPos(r.position); toast(t('Vous êtes sur la liste d’attente. Nous vous préviendrons si des places se libèrent.')); }
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Action impossible. Réessayez.'), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-3">
      <Button size="sm" variant={on ? 'soft' : 'outline'} loading={busy} disabled={on === null} onClick={() => void toggle()}>
        <Hourglass className="h-4 w-4" aria-hidden /> {on ? t('Quitter la liste d’attente') : t('Me prévenir si des places se libèrent')}
      </Button>
      {on && pos && <p className="mt-1 text-xs text-ink-muted">{t('Votre rang : {n}', { n: pos })}</p>}
    </div>
  );
}

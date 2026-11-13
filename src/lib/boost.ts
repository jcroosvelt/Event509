import type { EventItem } from '@/types';

/** Un événement est « sponsorisé » tant que la fin de son boost (fixée par le serveur) n'est pas passée. */
export const isBoosted = (e: Pick<EventItem, 'boostedUntil'>, now = Date.now()) => !!e.boostedUntil && Date.parse(e.boostedUntil) > now;

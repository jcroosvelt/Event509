import type { AppUser, TeamRole } from '@/types';

/** Permissions de l'espace organisateur et de l'administration. */
export type Perm =
  | 'dashboard' | 'events' | 'attendees' | 'checkin' | 'promos' | 'refunds' | 'payouts'
  | 'marketing' | 'team' | 'settings' | 'admin';

const teamPerms: Record<TeamRole, Perm[]> = {
  admin: ['dashboard', 'events', 'attendees', 'checkin', 'promos', 'refunds', 'payouts', 'marketing', 'team', 'settings'],
  staff: ['checkin'],
  accountant: ['dashboard', 'attendees', 'refunds', 'payouts'],
};

export const teamRoleLabel: Record<TeamRole, string> = {
  admin: 'Administrateur',
  staff: 'Staff d’entrée',
  accountant: 'Comptable',
};

export function permsOf(user: AppUser | null): Perm[] {
  if (!user) return [];
  if (user.role === 'admin') return [...teamPerms.admin, 'admin'];
  if (user.role === 'organizer') return teamPerms[user.teamRole ?? 'admin'];
  return [];
}

export function can(user: AppUser | null, perm: Perm) {
  return permsOf(user).includes(perm);
}

/** L'utilisateur a-t-il accès à au moins une page de l'espace organisateur ? */
export function hasOrganizerAccess(user: AppUser | null) {
  return permsOf(user).some((p) => p !== 'admin');
}

/** Organisation de l'utilisateur connecté (le backend la renverra avec la session). */
export function orgOf(user: AppUser | null) {
  return user?.role === 'organizer' || user?.role === 'admin' ? 'org1' : '';
}

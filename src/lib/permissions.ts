import type { AppUser, TeamRole } from '@/types';

/** Permissions de l'espace organisateur et de l'administration. */
export type Perm =
  | 'dashboard' | 'events' | 'attendees' | 'checkin' | 'promos' | 'refunds' | 'payouts'
  | 'marketing' | 'team' | 'settings' | 'admin';

export const teamPerms: Record<TeamRole, Perm[]> = {
  admin: ['dashboard', 'events', 'attendees', 'checkin', 'promos', 'refunds', 'payouts', 'marketing', 'team', 'settings'],
  manager: ['dashboard', 'events', 'attendees', 'checkin', 'promos', 'refunds', 'marketing'],
  lead: ['attendees', 'checkin'],
  staff: ['checkin'],
  accountant: ['dashboard', 'attendees', 'refunds', 'payouts'],
};

/** Permissions attribuables une à une à un membre (avantage « équipes avancées »). */
export const MEMBER_PERMS: Perm[] = ['dashboard', 'events', 'attendees', 'checkin', 'promos', 'refunds', 'payouts', 'marketing', 'settings'];
export const permLabel: Record<string, string> = {
  dashboard: 'Voir les ventes et le tableau de bord', events: 'Créer et modifier des événements', attendees: 'Voir et exporter les participants', checkin: 'Scanner les billets',
  promos: 'Codes promo', refunds: 'Gérer les remboursements', payouts: 'Versements', marketing: 'Marketing et campagnes', settings: 'Paramètres de l’organisation',
};

export const teamRoleLabel: Record<TeamRole, string> = {
  admin: 'Administrateur',
  manager: 'Gestionnaire',
  lead: 'Responsable de contrôle',
  staff: 'Agent de contrôle',
  accountant: 'Comptable',
};

export function permsOf(user: AppUser | null): Perm[] {
  if (!user) return [];
  if (user.role === 'admin') return [...teamPerms.admin, 'admin'];
  if (user.role === 'organizer') return user.teamPerms ? (user.teamPerms as Perm[]) : teamPerms[user.teamRole ?? 'admin'];
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
  if (user?.organizerId) return user.organizerId;
  // Version de démonstration seulement : toutes les équipes partagent la même organisation fictive
  if (import.meta.env.VITE_API_URL) return '';
  return user?.role === 'organizer' || user?.role === 'admin' ? 'org1' : '';
}

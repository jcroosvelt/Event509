import * as live from './mock';
import * as demo from './demo-data';

const swap = <T,>(target: T[], source: T[]) => void target.splice(0, target.length, ...source);

/**
 * Charge les données fictives dans l'application. Appelé uniquement par la version de démonstration
 * (voir src/main.tsx) et par les tests : le site en ligne ne l'importe jamais.
 */
export function loadDemo() {
  swap(live.events, demo.events);
  swap(live.organizers, demo.organizers);
  swap(live.myTickets, demo.myTickets);
  swap(live.myOrders, demo.myOrders);
  swap(live.attendees, demo.attendees);
  swap(live.resaleListings, demo.resaleListings);
  swap(live.customCommissions, demo.customCommissions);
  swap(live.promoCodes, demo.promoCodes);
  swap(live.team, demo.team);
  swap(live.refunds, demo.refunds);
  swap(live.payouts, demo.payouts);
  swap(live.campaigns, demo.campaigns);
  swap(live.ambassadors, demo.ambassadors);
  swap(live.users, demo.users);
  swap(live.disputes, demo.disputes);
  swap(live.reports, demo.reports);
  swap(live.verificationRequests, demo.verificationRequests);
  swap(live.auditLog, demo.auditLog);
  swap(live.platformTargets, demo.platformTargets);
  swap(live.platformOrders, demo.platformOrders);
  swap(live.notifications, demo.notifications);
  Object.assign(live.platformSettings.fees, demo.platformSettings.fees);
  // Les réglages modifiés pendant la démonstration survivent au rechargement de la page
  try {
    const stored = JSON.parse(localStorage.getItem('e509.demo.customFees') ?? 'null');
    if (Array.isArray(stored)) swap(live.customCommissions, stored);
  } catch {
    /* stockage indisponible */
  }
}

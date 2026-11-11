import { lazy, Suspense, type ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import {
  BadgePercent, BarChart3, History, Receipt, CalendarDays, CircleDollarSign, Flag, Gavel, Home, LayoutDashboard, Mail, Megaphone, Percent,
  ScanLine, Settings, Share2, ShieldCheck, Undo2, UserCog, Users, Wallet,
} from 'lucide-react';
import { Loading, Toaster } from '@/components/ui';
import { InstallPrompt } from '@/components/InstallPrompt';
import { RequireAuth, SessionWatcher } from '@/components/guards';
import PublicLayout from '@/layouts/PublicLayout';
import DashboardLayout from '@/layouts/DashboardLayout';
import { useApp } from '@/store/app';
import * as db from '@/data/mock';

// Participants
const HomePage = lazy(() => import('@/pages/public/Home'));
const Explore = lazy(() => import('@/pages/public/Explore'));
const EventDetail = lazy(() => import('@/pages/public/EventDetail'));
const Checkout = lazy(() => import('@/pages/public/Checkout'));
const Confirmation = lazy(() => import('@/pages/public/Confirmation'));
const OrganizerPage = lazy(() => import('@/pages/public/OrganizerPage'));
const Resale = lazy(() => import('@/pages/public/Resale'));
const Auth = lazy(() => import('@/pages/public/Auth'));
const ForgotPassword = lazy(() => import('@/pages/public/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/public/ResetPassword'));
const Legal = lazy(() => import('@/pages/public/Legal'));
const Ambassador = lazy(() => import('@/pages/public/Ambassador'));
const NotFound = lazy(() => import('@/pages/public/NotFound'));
const Wallet_ = lazy(() => import('@/pages/account/Wallet'));
const TicketDetail = lazy(() => import('@/pages/account/TicketDetail'));
const Favorites = lazy(() => import('@/pages/account/Favorites'));
const Profile = lazy(() => import('@/pages/account/Profile'));
const Orders = lazy(() => import('@/pages/account/Orders'));
const AccountSettings = lazy(() => import('@/pages/account/Settings'));
const Notifications = lazy(() => import('@/pages/account/Notifications'));

// Organisateurs
const OrgDashboard = lazy(() => import('@/pages/organizer/Dashboard'));
const OrgEvents = lazy(() => import('@/pages/organizer/Events'));
const EventEditor = lazy(() => import('@/pages/organizer/EventEditor'));
const EventStats = lazy(() => import('@/pages/organizer/EventStats'));
const Attendees = lazy(() => import('@/pages/organizer/Attendees'));
const CheckInHome = lazy(() => import('@/pages/organizer/CheckInHome'));
const CheckIn = lazy(() => import('@/pages/organizer/CheckIn'));
const Promos = lazy(() => import('@/pages/organizer/Promos'));
const Refunds = lazy(() => import('@/pages/organizer/Refunds'));
const Marketing = lazy(() => import('@/pages/organizer/Marketing'));
const Automations = lazy(() => import('@/pages/organizer/Automations'));
const Affiliates = lazy(() => import('@/pages/organizer/Affiliates'));
const Team = lazy(() => import('@/pages/organizer/Team'));
const Payouts = lazy(() => import('@/pages/organizer/Payouts'));
const OrgSettings = lazy(() => import('@/pages/organizer/Settings'));

// Administration
const AdminOverview = lazy(() => import('@/pages/admin/Overview'));
const Moderation = lazy(() => import('@/pages/admin/Moderation'));
const AdminUsers = lazy(() => import('@/pages/admin/Users'));
const Disputes = lazy(() => import('@/pages/admin/Disputes'));
const Commissions = lazy(() => import('@/pages/admin/Commissions'));
const Verification = lazy(() => import('@/pages/admin/Verification'));
const UserDetail = lazy(() => import('@/pages/admin/UserDetail'));
const Transactions = lazy(() => import('@/pages/admin/Transactions'));
const AdminPayouts = lazy(() => import('@/pages/admin/AdminPayouts'));
const AuditLog = lazy(() => import('@/pages/admin/AuditLog'));

const O = '/organisateur';
const A = '/admin';

const auth = (el: ReactNode) => <RequireAuth>{el}</RequireAuth>;

/** Compteurs affichés dans la navigation admin (données de démo). */
const pending = {
  get events() {
    return db.events.filter((e) => e.status === 'pending').length;
  },
  get reports() {
    return db.reports.filter((r) => r.status === 'open').length;
  },
};

export default function App() {
  const { t } = useApp();
  return (
    <>
      <SessionWatcher />
      <Toaster />
      <InstallPrompt />
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route index element={<HomePage />} />
            <Route path="explorer" element={<Explore />} />
            <Route path="e/:slug" element={<EventDetail />} />
            <Route path="e/:slug/achat" element={<Checkout />} />
            <Route path="commande/:id" element={<Confirmation />} />
            <Route path="o/:slug" element={<OrganizerPage />} />
            <Route path="revente" element={<Resale />} />
            <Route path="connexion" element={<Auth mode="login" />} />
            <Route path="inscription" element={<Auth mode="signup" />} />
            <Route path="mot-de-passe-oublie" element={<ForgotPassword />} />
            <Route path="reinitialiser" element={<ResetPassword />} />
            <Route path="cgu" element={<Legal page="terms" />} />
            <Route path="confidentialite" element={<Legal page="privacy" />} />
            <Route path="ambassadeurs" element={<Ambassador />} />
            <Route path="billets" element={<Wallet_ />} />
            <Route path="billets/:id" element={auth(<TicketDetail />)} />
            <Route path="favoris" element={auth(<Favorites />)} />
            <Route path="notifications" element={auth(<Notifications />)} />
            <Route path="compte" element={auth(<Profile />)} />
            <Route path="compte/achats" element={auth(<Orders />)} />
            <Route path="compte/parametres" element={auth(<AccountSettings />)} />
            <Route path="*" element={<NotFound />} />
          </Route>

          <Route
            path={O}
            element={auth(
              <DashboardLayout
                title={t('Espace organisateur')}
                base={O}
                sections={[
                  { items: [
                    { to: O, label: t('Tableau de bord'), icon: LayoutDashboard, end: true, perm: 'dashboard' },
                    { to: `${O}/evenements`, label: t('Événements'), icon: CalendarDays, perm: 'events' },
                    { to: `${O}/participants`, label: t('Participants'), icon: Users, perm: 'attendees' },
                    { to: `${O}/checkin`, label: t('Check-in QR'), icon: ScanLine, perm: 'checkin' },
                  ] },
                  { title: t('Ventes'), items: [
                    { to: `${O}/codes-promo`, label: t('Codes promo'), icon: BadgePercent, perm: 'promos' },
                    { to: `${O}/remboursements`, label: t('Remboursements'), icon: Undo2, perm: 'refunds' },
                    { to: `${O}/versements`, label: t('Versements'), icon: Wallet, perm: 'payouts' },
                  ] },
                  { title: t('Croissance'), items: [
                    { to: `${O}/marketing`, label: t('Campagnes'), icon: Megaphone, perm: 'marketing' },
                    { to: `${O}/emails`, label: t('Emails automatiques'), icon: Mail, perm: 'marketing' },
                    { to: `${O}/ambassadeurs`, label: t('Ambassadeurs'), icon: Share2, perm: 'marketing' },
                  ] },
                  { title: t('Organisation'), items: [
                    { to: `${O}/equipe`, label: t('Équipe & rôles'), icon: UserCog, perm: 'team' },
                    { to: `${O}/parametres`, label: t('Paramètres'), icon: Settings, perm: 'settings' },
                  ] },
                ]}
                bottom={[
                  { to: O, label: t('Accueil'), icon: Home, end: true, perm: 'dashboard' },
                  { to: `${O}/evenements`, label: t('Événements'), icon: CalendarDays, perm: 'events' },
                  { to: `${O}/participants`, label: t('Participants'), icon: Users, perm: 'attendees' },
                  { to: `${O}/versements`, label: t('Revenus'), icon: Wallet, perm: 'payouts' },
                ]}
                center={{ to: `${O}/checkin`, label: t('Scanner'), icon: ScanLine, perm: 'checkin' }}
              />,
            )}
          >
            <Route index element={<OrgDashboard />} />
            <Route path="evenements" element={<OrgEvents />} />
            <Route path="evenements/nouveau" element={<EventEditor />} />
            <Route path="evenements/:id" element={<EventEditor />} />
            <Route path="evenements/:id/stats" element={<EventStats />} />
            <Route path="participants" element={<Attendees />} />
            <Route path="checkin" element={<CheckInHome />} />
            <Route path="checkin/:id" element={<CheckIn />} />
            <Route path="codes-promo" element={<Promos />} />
            <Route path="remboursements" element={<Refunds />} />
            <Route path="marketing" element={<Marketing />} />
            <Route path="emails" element={<Automations />} />
            <Route path="ambassadeurs" element={<Affiliates />} />
            <Route path="equipe" element={<Team />} />
            <Route path="versements" element={<Payouts />} />
            <Route path="parametres" element={<OrgSettings />} />
          </Route>

          <Route
            path={A}
            element={auth(
              <DashboardLayout
                title={t('Administration')}
                base={A}
                sections={[
                  { items: [
                    { to: A, label: t('Vue d’ensemble'), icon: BarChart3, end: true, perm: 'admin' },
                    { to: `${A}/moderation`, label: t('Modération'), icon: Flag, perm: 'admin', badge: String(pending.events + pending.reports || '') || undefined },
                    { to: `${A}/utilisateurs`, label: t('Utilisateurs'), icon: Users, perm: 'admin' },
                    { to: `${A}/verification`, label: t('Vérification organisateurs'), icon: ShieldCheck, perm: 'admin' },
                  ] },
                  { title: t('Finances'), items: [
                    { to: `${A}/transactions`, label: t('Transactions'), icon: Receipt, perm: 'admin' },
                    { to: `${A}/versements`, label: t('Versements'), icon: Wallet, perm: 'admin' },
                    { to: `${A}/litiges`, label: t('Litiges'), icon: Gavel, perm: 'admin' },
                    { to: `${A}/commissions`, label: t('Commissions'), icon: Percent, perm: 'admin' },
                  ] },
                  { title: t('Suivi'), items: [
                    { to: `${A}/journal`, label: t('Journal d’activité'), icon: History, perm: 'admin' },
                  ] },
                ]}
                bottom={[
                  { to: A, label: t('Stats'), icon: BarChart3, end: true, perm: 'admin' },
                  { to: `${A}/utilisateurs`, label: t('Utilisateurs'), icon: Users, perm: 'admin' },
                  { to: `${A}/litiges`, label: t('Litiges'), icon: Gavel, perm: 'admin' },
                  { to: `${A}/commissions`, label: t('Frais'), icon: CircleDollarSign, perm: 'admin' },
                ]}
                center={{ to: `${A}/moderation`, label: t('Modération'), icon: Flag, perm: 'admin' }}
              />,
            )}
          >
            <Route index element={<AdminOverview />} />
            <Route path="moderation" element={<Moderation />} />
            <Route path="utilisateurs" element={<AdminUsers />} />
            <Route path="verification" element={<Verification />} />
            <Route path="litiges" element={<Disputes />} />
            <Route path="commissions" element={<Commissions />} />
            <Route path="utilisateurs/:id" element={<UserDetail />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="versements" element={<AdminPayouts />} />
            <Route path="journal" element={<AuditLog />} />
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}

import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import {
  BadgePercent, BarChart3, CalendarDays, CircleDollarSign, Gavel, Home, LayoutDashboard, Mail, Megaphone, ScanLine,
  Settings, ShieldCheck, Ticket, Undo2, UserCog, Users, Wallet, Flag, Percent, Share2,
} from 'lucide-react';
import { Loading } from '@/components/ui';
import PublicLayout from '@/layouts/PublicLayout';
import DashboardLayout from '@/layouts/DashboardLayout';

// Participants
const Home_ = lazy(() => import('@/pages/public/Home'));
const Explore = lazy(() => import('@/pages/public/Explore'));
const EventDetail = lazy(() => import('@/pages/public/EventDetail'));
const Checkout = lazy(() => import('@/pages/public/Checkout'));
const Confirmation = lazy(() => import('@/pages/public/Confirmation'));
const Auth = lazy(() => import('@/pages/public/Auth'));
const Ambassador = lazy(() => import('@/pages/public/Ambassador'));
const NotFound = lazy(() => import('@/pages/public/NotFound'));
const Wallet_ = lazy(() => import('@/pages/account/Wallet'));
const TicketDetail = lazy(() => import('@/pages/account/TicketDetail'));
const Favorites = lazy(() => import('@/pages/account/Favorites'));
const Profile = lazy(() => import('@/pages/account/Profile'));
const Orders = lazy(() => import('@/pages/account/Orders'));
const AccountSettings = lazy(() => import('@/pages/account/Settings'));

// Organisateurs
const OrgDashboard = lazy(() => import('@/pages/organizer/Dashboard'));
const OrgEvents = lazy(() => import('@/pages/organizer/Events'));
const EventEditor = lazy(() => import('@/pages/organizer/EventEditor'));
const Attendees = lazy(() => import('@/pages/organizer/Attendees'));
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

const O = '/organisateur';
const A = '/admin';

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Home_ />} />
          <Route path="explorer" element={<Explore />} />
          <Route path="e/:slug" element={<EventDetail />} />
          <Route path="e/:slug/achat" element={<Checkout />} />
          <Route path="commande/:id" element={<Confirmation />} />
          <Route path="billets" element={<Wallet_ />} />
          <Route path="billets/:id" element={<TicketDetail />} />
          <Route path="favoris" element={<Favorites />} />
          <Route path="connexion" element={<Auth mode="login" />} />
          <Route path="inscription" element={<Auth mode="signup" />} />
          <Route path="compte" element={<Profile />} />
          <Route path="compte/achats" element={<Orders />} />
          <Route path="compte/parametres" element={<AccountSettings />} />
          <Route path="ambassadeurs" element={<Ambassador />} />
          <Route path="*" element={<NotFound />} />
        </Route>

        <Route
          path={O}
          element={
            <DashboardLayout
              title="Espace organisateur"
              sections={[
                { items: [
                  { to: O, label: 'Tableau de bord', icon: LayoutDashboard, end: true },
                  { to: `${O}/evenements`, label: 'Événements', icon: CalendarDays },
                  { to: `${O}/participants`, label: 'Participants', icon: Users },
                  { to: `${O}/checkin`, label: 'Check-in QR', icon: ScanLine },
                ] },
                { title: 'Ventes', items: [
                  { to: `${O}/codes-promo`, label: 'Codes promo', icon: BadgePercent },
                  { to: `${O}/remboursements`, label: 'Remboursements', icon: Undo2, badge: '2' },
                  { to: `${O}/versements`, label: 'Versements & factures', icon: Wallet },
                ] },
                { title: 'Croissance', items: [
                  { to: `${O}/marketing`, label: 'Campagnes', icon: Megaphone },
                  { to: `${O}/emails`, label: 'Emails automatiques', icon: Mail },
                  { to: `${O}/ambassadeurs`, label: 'Ambassadeurs', icon: Share2 },
                ] },
                { title: 'Organisation', items: [
                  { to: `${O}/equipe`, label: 'Équipe & rôles', icon: UserCog },
                  { to: `${O}/parametres`, label: 'Paramètres', icon: Settings },
                ] },
              ]}
              bottom={[
                { to: O, label: 'Accueil', icon: Home, end: true },
                { to: `${O}/evenements`, label: 'Événements', icon: CalendarDays },
                { to: `${O}/participants`, label: 'Participants', icon: Users },
                { to: `${O}/versements`, label: 'Revenus', icon: Wallet },
              ]}
              center={{ to: `${O}/checkin`, label: 'Scanner', icon: ScanLine }}
            />
          }
        >
          <Route index element={<OrgDashboard />} />
          <Route path="evenements" element={<OrgEvents />} />
          <Route path="evenements/nouveau" element={<EventEditor />} />
          <Route path="evenements/:id" element={<EventEditor />} />
          <Route path="participants" element={<Attendees />} />
          <Route path="checkin" element={<CheckIn />} />
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
          element={
            <DashboardLayout
              title="Administration"
              sections={[
                { items: [
                  { to: A, label: 'Vue d’ensemble', icon: BarChart3, end: true },
                  { to: `${A}/moderation`, label: 'Modération', icon: Flag, badge: '1' },
                  { to: `${A}/utilisateurs`, label: 'Utilisateurs', icon: Users },
                  { to: `${A}/verification`, label: 'Vérification organisateurs', icon: ShieldCheck },
                ] },
                { title: 'Finances', items: [
                  { to: `${A}/litiges`, label: 'Litiges', icon: Gavel },
                  { to: `${A}/commissions`, label: 'Commissions', icon: Percent },
                ] },
              ]}
              bottom={[
                { to: A, label: 'Stats', icon: BarChart3, end: true },
                { to: `${A}/utilisateurs`, label: 'Utilisateurs', icon: Users },
                { to: `${A}/litiges`, label: 'Litiges', icon: Gavel },
                { to: `${A}/commissions`, label: 'Frais', icon: CircleDollarSign },
              ]}
              center={{ to: `${A}/moderation`, label: 'Modération', icon: Ticket }}
            />
          }
        >
          <Route index element={<AdminOverview />} />
          <Route path="moderation" element={<Moderation />} />
          <Route path="utilisateurs" element={<AdminUsers />} />
          <Route path="verification" element={<Verification />} />
          <Route path="litiges" element={<Disputes />} />
          <Route path="commissions" element={<Commissions />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

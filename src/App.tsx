import { lazy, Suspense, type ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { BarChart3, CalendarDays, CircleDollarSign, Flag, Gavel, Home, Heart, Receipt, ScanLine, Search, Ticket, Users, Wallet } from 'lucide-react';
import { Loading, Toaster } from '@/components/ui';
import { A, O, adminSections, buyerSections, organizerSections } from '@/lib/spaces';
import { hasOrganizerAccess } from '@/lib/permissions';
import { AppInstallPopup, AppUpdateBanner } from '@/components/AppInstall';
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
const PaymentReturn = lazy(() => import('@/pages/public/PaymentReturn'));
const DownloadApp = lazy(() => import('@/pages/public/DownloadApp'));
const OrganizerPage = lazy(() => import('@/pages/public/OrganizerPage'));
const Resale = lazy(() => import('@/pages/public/Resale'));
const Auth = lazy(() => import('@/pages/public/Auth'));
const ForgotPassword = lazy(() => import('@/pages/public/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/public/ResetPassword'));
const VerifyEmail = lazy(() => import('@/pages/public/VerifyEmail'));
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
const BuyerDashboard = lazy(() => import('@/pages/buyer/BuyerDashboard'));
const BuyerRefunds = lazy(() => import('@/pages/buyer/BuyerRefunds'));
const LiveEntries = lazy(() => import('@/pages/organizer/LiveEntries'));
const BecomeOrganizer = lazy(() => import('@/pages/buyer/BecomeOrganizer'));

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
const Reviews = lazy(() => import('@/pages/organizer/Reviews'));
const OrgMessages = lazy(() => import('@/pages/organizer/Messages'));
const Messages = lazy(() => import('@/pages/account/Messages'));
const Feed = lazy(() => import('@/pages/account/Feed'));
const ContentReports = lazy(() => import('@/pages/admin/ContentReports'));
const VerifiedProgram = lazy(() => import('@/pages/public/VerifiedProgram'));
const OrgVerification = lazy(() => import('@/pages/organizer/Verification'));
const Subscription = lazy(() => import('@/pages/organizer/Subscription'));
const PremiumSettings = lazy(() => import('@/pages/admin/PremiumSettings'));
const Calendar = lazy(() => import('@/pages/organizer/Calendar'));
const Activity = lazy(() => import('@/pages/organizer/Activity'));
const OrgSupport = lazy(() => import('@/pages/organizer/Support'));
const AdminSupport = lazy(() => import('@/pages/admin/AdminSupport'));
const Links = lazy(() => import('@/pages/organizer/Links'));
const Unsubscribe = lazy(() => import('@/pages/public/Unsubscribe'));
const Finances = lazy(() => import('@/pages/organizer/Finances'));
const Boosts = lazy(() => import('@/pages/organizer/Boosts'));
const AdminBoosts = lazy(() => import('@/pages/admin/AdminBoosts'));
const ApiPage = lazy(() => import('@/pages/organizer/Api'));
const Widget = lazy(() => import('@/pages/public/Widget'));
const Analytics = lazy(() => import('@/pages/organizer/Analytics'));
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
const AdminContent = lazy(() => import('@/pages/admin/AdminContent'));
const Verification = lazy(() => import('@/pages/admin/Verification'));
const UserDetail = lazy(() => import('@/pages/admin/UserDetail'));
const Transactions = lazy(() => import('@/pages/admin/Transactions'));
const AdminPayouts = lazy(() => import('@/pages/admin/AdminPayouts'));
const AppRelease = lazy(() => import('@/pages/admin/AppRelease'));
const AuditLog = lazy(() => import('@/pages/admin/AuditLog'));
const RecoveryRequests = lazy(() => import('@/pages/admin/RecoveryRequests'));
const AuthEntry = lazy(() => import('@/pages/auth/GoogleAuth'));
const CompleteSignup = lazy(() => import('@/pages/auth/CompleteSignup'));
const CompleteProfile = lazy(() => import('@/pages/auth/CompleteProfile'));
const RecoverAccount = lazy(() => import('@/pages/auth/RecoverAccount'));
const Security = lazy(() => import('@/pages/account/Security'));


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
  const { t, user } = useApp();
  return (
    <>
      <SessionWatcher />
      <Toaster />
      <AppInstallPopup />
      <AppUpdateBanner />
      <Suspense fallback={<Loading />}>
        <Routes>
          {/* Widget intégrable : sans en-tête ni menu du site */}
          <Route path="widget/:slug" element={<Widget />} />
          <Route element={<PublicLayout />}>
            <Route index element={<HomePage />} />
            <Route path="explorer" element={<Explore />} />
            <Route path="e/:slug" element={<EventDetail />} />
            <Route path="e/:slug/achat" element={<Checkout />} />
            <Route path="commande/:id" element={<Confirmation />} />
            <Route path="retour-paiement" element={<PaymentReturn />} />
            <Route path="telecharger" element={<DownloadApp />} />
            <Route path="o/:slug" element={<OrganizerPage />} />
            <Route path="revente" element={<Resale />} />
            <Route path="connexion" element={<AuthEntry mode="login" />} />
            <Route path="inscription" element={<AuthEntry mode="signup" />} />
            <Route path="connexion/ancien" element={<Auth mode="login" />} />
            <Route path="connexion/recuperation" element={<RecoverAccount />} />
            <Route path="inscription/profil" element={<CompleteSignup />} />
            <Route path="mot-de-passe-oublie" element={<ForgotPassword />} />
            <Route path="reinitialiser" element={<ResetPassword />} />
            <Route path="verifier-email" element={<VerifyEmail />} />
            <Route path="cgu" element={<Legal page="terms" />} />
            <Route path="confidentialite" element={<Legal page="privacy" />} />
            <Route path="remboursement" element={<Legal page="refund" />} />
            <Route path="ambassadeurs" element={<Ambassador />} />
            <Route path="organisateur-verifie" element={<VerifiedProgram />} />
            <Route path="desinscription" element={<Unsubscribe />} />
            <Route path="organisateur/:slug" element={<OrganizerPage />} />
            <Route path="billets" element={<Wallet_ />} />
            <Route path="billets/:id" element={auth(<TicketDetail />)} />
            <Route path="favoris" element={<Favorites />} />
            <Route path="notifications" element={auth(<Notifications />)} />
            <Route path="fil" element={auth(<Feed />)} />
            <Route path="compte/completer" element={auth(<CompleteProfile />)} />
            <Route path="*" element={<NotFound />} />
          </Route>

          {/* Espace acheteur : tout compte connecté */}
          <Route
            path="/compte"
            element={auth(
              <DashboardLayout
                title={t('Mon espace')}
                base="/compte"
                sections={buyerSections(t, !hasOrganizerAccess(user))}
                bottom={[
                  { to: '/compte', label: t('Accueil'), icon: Home, end: true, perm: 'buyer' },
                  { to: '/compte/achats', label: t('Achats'), icon: Receipt, perm: 'buyer' },
                  { to: '/compte/favoris', label: t('Favoris'), icon: Heart, perm: 'buyer' },
                  { to: '/explorer', label: t('Explorer'), icon: Search, perm: 'buyer' },
                ]}
                center={{ to: '/compte/billets', label: t('Billets'), icon: Ticket, perm: 'buyer' }}
              />,
            )}
          >
            <Route index element={<BuyerDashboard />} />
            <Route path="billets" element={<Wallet_ />} />
            <Route path="achats" element={<Orders />} />
            <Route path="favoris" element={<Favorites />} />
            <Route path="remboursements" element={<BuyerRefunds />} />
            <Route path="devenir-organisateur" element={<BecomeOrganizer />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="messages" element={<Messages />} />
            <Route path="profil" element={<Profile />} />
            <Route path="parametres" element={<AccountSettings />} />
            <Route path="securite" element={<Security />} />
            <Route path="appareils" element={<Security />} />
          </Route>

          <Route
            path={O}
            element={auth(
              <DashboardLayout
                title={t('Espace organisateur')}
                base={O}
                sections={organizerSections(t)}
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
            <Route path="checkin/:id/direct" element={<LiveEntries />} />
            <Route path="codes-promo" element={<Promos />} />
            <Route path="remboursements" element={<Refunds />} />
            <Route path="marketing" element={<Marketing />} />
            <Route path="emails" element={<Automations />} />
            <Route path="avis" element={<Reviews />} />
            <Route path="messages" element={<OrgMessages />} />
            <Route path="analyses" element={<Analytics />} />
            <Route path="calendrier" element={<Calendar />} />
            <Route path="activite" element={<Activity />} />
            <Route path="support" element={<OrgSupport />} />
            <Route path="liens" element={<Links />} />
            <Route path="boosts" element={<Boosts />} />
            <Route path="api" element={<ApiPage />} />
            <Route path="finances" element={<Finances />} />
            <Route path="ambassadeurs" element={<Affiliates />} />
            <Route path="equipe" element={<Team />} />
            <Route path="versements" element={<Payouts />} />
            <Route path="parametres" element={<OrgSettings />} />
            <Route path="verification" element={<OrgVerification />} />
            <Route path="abonnement" element={<Subscription />} />
          </Route>

          <Route
            path={A}
            element={auth(
              <DashboardLayout
                title={t('Administration')}
                base={A}
                sections={adminSections(t, String(pending.events + pending.reports || '') || undefined)}
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
            <Route path="signalements" element={<ContentReports />} />
            <Route path="utilisateurs" element={<AdminUsers />} />
            <Route path="verification" element={<Verification />} />
            <Route path="recuperations" element={<RecoveryRequests />} />
            <Route path="programme-verifie" element={<PremiumSettings />} />
            <Route path="support" element={<AdminSupport />} />
            <Route path="boosts" element={<AdminBoosts />} />
            <Route path="litiges" element={<Disputes />} />
            <Route path="commissions" element={<Commissions />} />
            <Route path="contenu" element={<AdminContent />} />
            <Route path="utilisateurs/:id" element={<UserDetail />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="versements" element={<AdminPayouts />} />
            <Route path="journal" element={<AuditLog />} />
            <Route path="application" element={<AppRelease />} />
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}

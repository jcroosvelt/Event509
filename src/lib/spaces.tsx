import {
  BadgeCheck, BadgePercent, BarChart3, CalendarRange, ClipboardList, Code2, Headphones, LineChart, Link2, Rocket, CreditCard, History, Receipt, CalendarDays, Flag, Gavel, LayoutDashboard, Mail, Megaphone, Percent,
  FileText, Heart, LifeBuoy, Bell, MessageCircle, Newspaper, Repeat2, ScanLine, Settings, Ticket, Share2, Star, TrendingUp, ShieldCheck, Undo2, UserCog, Users, Wallet,
} from 'lucide-react';
import type { NavItem } from '@/layouts/DashboardLayout';

/** Entrées du menu des trois espaces (acheteur, organisateur, administration) : un seul menu pour tout le site, le même sur toutes les pages. */
export const O = '/organisateur';
export const A = '/admin';
export type Translate = (fr: string) => string;
export interface MenuSection { title?: string; items: NavItem[] }

export const buyerSections = (t: Translate, canBecomeOrganizer = false): MenuSection[] => [
                  { items: [
                    { to: '/compte', label: t('Tableau de bord'), icon: LayoutDashboard, end: true, perm: 'buyer' },
                    { to: '/compte/billets', label: t('Mes billets'), icon: Ticket, perm: 'buyer' },
                    { to: '/compte/achats', label: t('Historique des achats'), icon: Receipt, perm: 'buyer' },
                    { to: '/compte/favoris', label: t('Favoris'), icon: Heart, perm: 'buyer' },
                    { to: '/fil', label: t('Fil d’actualité'), icon: Newspaper, perm: 'buyer' },
                  ] },
                  { title: t('Après l’achat'), items: [
                    { to: '/compte/remboursements', label: t('Remboursements'), icon: Undo2, perm: 'buyer' },
                    { to: '/revente', label: t('Billets en revente'), icon: Repeat2, perm: 'buyer' },
                    { to: '/compte/messages', label: t('Messages'), icon: MessageCircle, perm: 'buyer' },
                    { to: '/compte/notifications', label: t('Notifications'), icon: Bell, perm: 'buyer' },
                  ] },
                  { title: t('Compte'), items: [
                    { to: '/compte/profil', label: t('Profil'), icon: Users, perm: 'buyer' },
                    { to: '/compte/parametres', label: t('Paramètres'), icon: Settings, perm: 'buyer' },
                    { to: '/compte/securite', label: t('Sécurité'), icon: ShieldCheck, perm: 'buyer' },
                  ] },
                
  ...(canBecomeOrganizer ? [{ title: t('Organisateur'), items: [{ to: '/compte/devenir-organisateur', label: t('Devenir organisateur'), icon: Rocket, perm: 'buyer' as const }] }] : []),
];

export const organizerSections = (t: Translate): MenuSection[] => [
                  { items: [
                    { to: O, label: t('Tableau de bord'), icon: LayoutDashboard, end: true, perm: 'dashboard' },
                    { to: `${O}/evenements`, label: t('Événements'), icon: CalendarDays, perm: 'events' },
                    { to: `${O}/calendrier`, label: t('Calendrier'), icon: CalendarRange, perm: 'events' },
                    { to: `${O}/participants`, label: t('Participants'), icon: Users, perm: 'attendees' },
                    { to: `${O}/checkin`, label: t('Check-in QR'), icon: ScanLine, perm: 'checkin' },
                  ] },
                  { title: t('Ventes'), items: [
                    { to: `${O}/codes-promo`, label: t('Codes promo'), icon: BadgePercent, perm: 'promos' },
                    { to: `${O}/remboursements`, label: t('Remboursements'), icon: Undo2, perm: 'refunds' },
                    { to: `${O}/versements`, label: t('Versements'), icon: Wallet, perm: 'payouts' },
                    { to: `${O}/finances`, label: t('Finances'), icon: LineChart, perm: 'payouts' },
                  ] },
                  { title: t('Croissance'), items: [
                    { to: `${O}/marketing`, label: t('Campagnes'), icon: Megaphone, perm: 'marketing' },
                    { to: `${O}/emails`, label: t('Emails automatiques'), icon: Mail, perm: 'marketing' },
                    { to: `${O}/ambassadeurs`, label: t('Ambassadeurs'), icon: Share2, perm: 'marketing' },
                    { to: `${O}/boosts`, label: t('Boost'), icon: Rocket, perm: 'events' },
                    { to: `${O}/liens`, label: t('Liens de suivi'), icon: Link2, perm: 'marketing' },
                    { to: `${O}/api`, label: t('API et intégrations'), icon: Code2, perm: 'settings' },
                    { to: `${O}/avis`, label: t('Avis'), icon: Star, perm: 'marketing' },
                    { to: `${O}/messages`, label: t('Messages'), icon: MessageCircle, perm: 'marketing' },
                    { to: `${O}/analyses`, label: t('Statistiques avancées'), icon: TrendingUp, perm: 'dashboard' },
                  ] },
                  { title: t('Organisation'), items: [
                    { to: `${O}/equipe`, label: t('Équipe & rôles'), icon: UserCog, perm: 'team' },
                    { to: `${O}/activite`, label: t('Activité de l’équipe'), icon: ClipboardList, perm: 'team' },
                    { to: `${O}/verification`, label: t('Organisateur vérifié'), icon: BadgeCheck, perm: 'settings' },
                    { to: `${O}/abonnement`, label: t('Mon abonnement'), icon: CreditCard, perm: 'settings' },
                    { to: `${O}/support`, label: t('Support prioritaire'), icon: Headphones, perm: 'settings' },
                    { to: `${O}/parametres`, label: t('Paramètres'), icon: Settings, perm: 'settings' },
                  ] },
                ];

export const adminSections = (t: Translate, pendingBadge?: string): MenuSection[] => [
                  { items: [
                    { to: A, label: t('Vue d’ensemble'), icon: BarChart3, end: true, perm: 'admin' },
                    { to: `${A}/moderation`, label: t('Modération'), icon: Flag, perm: 'admin', badge: pendingBadge },
                    { to: `${A}/signalements`, label: t('Signalements de contenu'), icon: Flag, perm: 'admin' },
                    { to: `${A}/utilisateurs`, label: t('Utilisateurs'), icon: Users, perm: 'admin' },
                    { to: `${A}/verification`, label: t('Vérification organisateurs'), icon: ShieldCheck, perm: 'admin' },
                    { to: `${A}/recuperations`, label: t('Récupérations de compte'), icon: LifeBuoy, perm: 'admin' },
                    { to: `${A}/programme-verifie`, label: t('Programme vérifié'), icon: BadgeCheck, perm: 'admin' },
                    { to: `${A}/support`, label: t('Support'), icon: Headphones, perm: 'admin' },
                    { to: `${A}/boosts`, label: t('Boosts'), icon: Rocket, perm: 'admin' },
                  ] },
                  { title: t('Finances'), items: [
                    { to: `${A}/transactions`, label: t('Transactions'), icon: Receipt, perm: 'admin' },
                    { to: `${A}/versements`, label: t('Versements'), icon: Wallet, perm: 'admin' },
                    { to: `${A}/litiges`, label: t('Litiges'), icon: Gavel, perm: 'admin' },
                    { to: `${A}/commissions`, label: t('Commissions'), icon: Percent, perm: 'admin' },
                  ] },
                  { title: t('Suivi'), items: [
                    { to: `${A}/contenu`, label: t('Contenu et réglages'), icon: FileText, perm: 'admin' },
                    { to: `${A}/journal`, label: t('Journal d’activité'), icon: History, perm: 'admin' },
                  ] },
                ];

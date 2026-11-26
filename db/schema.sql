-- Schéma Event509 (Postgres / Neon).
-- Chaque table garde l'objet complet dans `data` (jsonb, au format de src/types.ts)
-- et recopie dans des colonnes les champs utilisés pour filtrer, joindre ou garantir l'unicité.
-- Le script est idempotent : il peut être relancé sans effet sur une base déjà créée.

create table if not exists organizers (
  id text primary key,
  slug text unique not null,
  data jsonb not null
);

create table if not exists users (
  id text primary key,
  email text unique not null,
  password_hash text,
  role text not null default 'participant' check (role in ('participant', 'organizer', 'admin')),
  team_role text check (team_role in ('admin', 'staff', 'accountant')),
  organizer_id text references organizers(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  data jsonb not null
);

create table if not exists events (
  id text primary key,
  slug text unique not null,
  organizer_id text not null references organizers(id),
  status text not null,
  start_at timestamptz,
  data jsonb not null
);
create index if not exists events_status on events(status);
create index if not exists events_org on events(organizer_id);

create table if not exists orders (
  id text primary key,
  event_id text references events(id),
  user_id text references users(id) on delete set null,
  buyer_email text,
  status text not null,
  created_at timestamptz not null default now(),
  data jsonb not null
);
create index if not exists orders_event on orders(event_id);
create index if not exists orders_buyer on orders(lower(buyer_email));

-- Billets émis. Le code est unique ; une place ne peut être vendue qu'une fois par session.
create table if not exists tickets (
  id text primary key,
  code text unique not null,
  event_id text not null references events(id),
  order_id text,
  owner_email text,
  seat text,
  session_label text,
  status text not null,
  checked_in_at timestamptz,
  data jsonb not null
);
create index if not exists tickets_event on tickets(event_id);
create index if not exists tickets_owner on tickets(lower(owner_email));
create unique index if not exists tickets_seat_once on tickets(event_id, coalesce(session_label, ''), seat)
  where seat is not null and status in ('valid', 'used', 'resale');

create table if not exists resale_listings (
  id text primary key,
  ticket_id text unique not null references tickets(id) on delete cascade,
  event_id text not null,
  price numeric not null,
  data jsonb not null
);

create table if not exists promo_codes (
  id text primary key,
  organizer_id text not null,
  code text unique not null,
  data jsonb not null
);

create table if not exists team_members (
  id text primary key,
  organizer_id text not null,
  email text not null,
  data jsonb not null,
  unique (organizer_id, email)
);

create table if not exists refunds (
  id text primary key,
  organizer_id text,
  order_id text,
  status text not null,
  created_at timestamptz not null default now(),
  data jsonb not null
);

create table if not exists payouts (
  id text primary key,
  organizer_id text not null,
  status text not null,
  created_at timestamptz not null default now(),
  data jsonb not null
);

create table if not exists campaigns (
  id text primary key,
  organizer_id text not null,
  data jsonb not null
);

create table if not exists ambassadors (
  id text primary key,
  organizer_id text not null,
  code text unique not null,
  data jsonb not null
);

create table if not exists custom_commissions (
  organizer_id text primary key references organizers(id) on delete cascade,
  rate numeric not null,
  reason text not null default ''
);

create table if not exists reports (
  id text primary key,
  event_id text,
  status text not null,
  created_at timestamptz not null default now(),
  data jsonb not null
);

create table if not exists verification_requests (
  id text primary key,
  organizer_id text,
  status text not null,
  data jsonb not null
);

create table if not exists disputes (
  id text primary key,
  order_id text,
  status text not null,
  created_at timestamptz not null default now(),
  data jsonb not null
);

create table if not exists audit_log (
  id text primary key,
  at timestamptz not null default now(),
  data jsonb not null
);

create table if not exists platform_targets (
  id text primary key,
  data jsonb not null
);

create table if not exists settings (
  key text primary key,
  value jsonb not null
);

-- Fichiers envoyés (affiches, logos : publics ; documents de vérification : privés).
-- Le contenu est gardé dans la base, après réduction des images côté navigateur.
create table if not exists files (
  id text primary key,
  organizer_id text,
  user_id text,
  kind text not null,
  doc_type text,
  visibility text not null check (visibility in ('public', 'private')),
  mime text not null,
  name text not null,
  size integer not null,
  data bytea not null,
  created_at timestamptz not null default now()
);
create index if not exists files_org on files(organizer_id, kind);
-- Photo de profil (tout compte, organisateur et administrateur compris) : un seul fichier par personne, sans organisation
alter table files alter column organizer_id drop not null;
alter table files drop constraint if exists files_kind_check;
alter table files add constraint files_kind_check check (kind in ('event_cover', 'org_logo', 'verification', 'avatar'));
create unique index if not exists files_avatar_user on files(user_id) where kind = 'avatar';

-- Achat sans compte : la clé d'accès (dans le lien reçu par email) permet de retrouver une commande et ses billets.
alter table orders add column if not exists access_key text;

-- Une place numérotée n'est vendue qu'une fois, y compris tant que le virement n'est pas confirmé (billet « pending »).
create unique index if not exists tickets_seat_once_v2 on tickets(event_id, coalesce(session_label, ''), seat)
  where seat is not null and status in ('pending', 'valid', 'used', 'resale');
drop index if exists tickets_seat_once;

-- Notifications push (application Android) : jetons d'appareil.
-- Un appareil peut être lié à un compte (user_id) et/ou à l'email d'un acheteur (participant sans compte,
-- prouvé par la clé de sa commande). Un même jeton n'est jamais enregistré deux fois pour le même propriétaire.
create table if not exists device_tokens (
  token text not null,
  owner text not null,                       -- 'u:<id utilisateur>' ou 'e:<email en minuscules>'
  user_id text references users(id) on delete cascade,
  buyer_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (token, owner)
);
-- Position approximative (arrondie à environ 1 km) pour les alertes « près de chez moi » ; effacée si l'alerte est désactivée.
alter table device_tokens add column if not exists lat double precision;
alter table device_tokens add column if not exists lng double precision;
alter table device_tokens add column if not exists located_at timestamptz;
create index if not exists device_tokens_user on device_tokens(user_id);
create index if not exists device_tokens_email on device_tokens(buyer_email);

-- Évite d'envoyer deux fois la même notification (rappels, « presque complet »).
create table if not exists notification_log (
  key text primary key,
  sent_at timestamptz not null default now()
);

-- Avis et notes : un seul avis par commande payée (achat vérifié), après la fin de l'événement.
create table if not exists reviews (
  id text primary key,
  event_id text not null references events(id) on delete cascade,
  order_id text not null unique,
  rating integer not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  data jsonb not null
);
create index if not exists reviews_event on reviews(event_id, created_at desc);

-- Programme « Organisateur vérifié » : abonnement (un par organisation), paiements, historique des décisions.
-- Migration additive : rien n'est supprimé. Retour arrière : drop table des quatre tables ci-dessous.
create table if not exists premium_subscriptions (
  id text primary key,
  organizer_id text not null unique references organizers(id) on delete cascade,
  plan text not null check (plan in ('monthly', 'yearly')),
  status text not null check (status in ('pending_payment', 'active', 'canceled', 'expired', 'suspended')),
  started_at timestamptz,
  expires_at timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists premium_payments (
  id text primary key,
  organizer_id text not null references organizers(id) on delete cascade,
  plan text not null check (plan in ('monthly', 'yearly')),
  amount numeric not null,
  status text not null check (status in ('pending', 'paid', 'failed', 'refund_due', 'refunded')),
  method text not null,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  data jsonb not null default '{}'
);
create index if not exists premium_payments_org on premium_payments(organizer_id, created_at desc);
-- Forfait « à vie » : une troisième formule en plus de mensuel et annuel
alter table premium_subscriptions drop constraint if exists premium_subscriptions_plan_check;
alter table premium_subscriptions add constraint premium_subscriptions_plan_check check (plan in ('monthly', 'yearly', 'lifetime'));
alter table premium_payments drop constraint if exists premium_payments_plan_check;
alter table premium_payments add constraint premium_payments_plan_check check (plan in ('monthly', 'yearly', 'lifetime'));

-- Historique des décisions et commentaires internes (visibles seulement de l'administration quand internal = true).
create table if not exists verification_log (
  id text primary key,
  organizer_id text not null references organizers(id) on delete cascade,
  at timestamptz not null default now(),
  actor text not null,
  action text not null,
  note text,
  internal boolean not null default false
);
create index if not exists verification_log_org on verification_log(organizer_id, at desc);

-- Chaque consultation d'un document d'identité par l'administration est enregistrée.
create table if not exists document_access_log (
  id text primary key,
  file_id text not null,
  organizer_id text not null,
  admin_id text not null,
  admin_name text not null,
  at timestamptz not null default now()
);
create index if not exists document_access_org on document_access_log(organizer_id, at desc);

-- Modèles d'événements (avantage « gestionnaire multi-événements ») : un événement type, sans dates ni ventes.
create table if not exists event_templates (
  id text primary key,
  organizer_id text not null references organizers(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  data jsonb not null
);
create index if not exists event_templates_org on event_templates(organizer_id, created_at desc);

-- Équipes avancées : nouveaux rôles (gestionnaire, responsable de contrôle), permissions personnalisées par membre
-- et journal d'activité. Migration additive ; retour arrière : réajouter l'ancienne contrainte (admin, staff, accountant).
alter table users drop constraint if exists users_team_role_check;
alter table users add constraint users_team_role_check check (team_role in ('admin', 'manager', 'lead', 'staff', 'accountant'));
alter table users add column if not exists team_perms jsonb;

create table if not exists activity_log (
  id text primary key,
  organizer_id text not null references organizers(id) on delete cascade,
  at timestamptz not null default now(),
  user_id text,
  user_name text not null,
  action text not null,
  target text,
  meta jsonb
);
create index if not exists activity_log_org on activity_log(organizer_id, at desc);

-- Support prioritaire (avantage des organisateurs vérifiés) : tickets et conversations.
create table if not exists support_tickets (
  id text primary key,
  organizer_id text not null references organizers(id) on delete cascade,
  user_id text,
  subject text not null,
  category text not null check (category in ('technical', 'billing', 'event', 'other')),
  priority text not null check (priority in ('normal', 'priority', 'urgent')),
  status text not null check (status in ('open', 'pending', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists support_tickets_org on support_tickets(organizer_id, updated_at desc);
create index if not exists support_tickets_inbox on support_tickets(status, priority, updated_at desc);

create table if not exists support_messages (
  id text primary key,
  ticket_id text not null references support_tickets(id) on delete cascade,
  from_role text not null check (from_role in ('organizer', 'admin')),
  author text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists support_messages_ticket on support_messages(ticket_id, created_at);

-- Outils marketing (avantage des organisateurs vérifiés) : liens de suivi et désinscription des communications.
create table if not exists tracking_links (
  id text primary key,
  organizer_id text not null references organizers(id) on delete cascade,
  event_id text,
  code text unique not null,
  label text not null,
  clicks integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists tracking_links_org on tracking_links(organizer_id, created_at desc);

-- Un acheteur qui se désinscrit ne reçoit plus de campagne de cet organisateur (le consentement se donne à l'achat).
create table if not exists marketing_optouts (
  organizer_id text not null references organizers(id) on delete cascade,
  email text not null,
  at timestamptz not null default now(),
  primary key (organizer_id, email)
);

-- Boost par événement : mise en avant payante pour une durée donnée (visible comme « Sponsorisé »).
create table if not exists event_boosts (
  id text primary key,
  organizer_id text not null references organizers(id) on delete cascade,
  event_id text not null references events(id) on delete cascade,
  days integer not null check (days between 1 and 90),
  amount numeric not null,
  status text not null check (status in ('pending', 'active', 'canceled', 'failed')),
  method text not null,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  views_at_start integer not null default 0
);
create index if not exists event_boosts_org on event_boosts(organizer_id, created_at desc);
create index if not exists event_boosts_event on event_boosts(event_id, status);

-- API et intégrations (avantage des organisateurs vérifiés) : clés API (stockées hachées), journal des requêtes,
-- compteurs pour la limite d'utilisation, webhooks signés et leurs envois.
create table if not exists api_keys (
  id text primary key,
  organizer_id text not null references organizers(id) on delete cascade,
  name text not null,
  prefix text not null,
  key_hash text unique not null,
  scopes text[] not null default '{events:read}',
  created_by text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists api_keys_org on api_keys(organizer_id);

create table if not exists api_usage (
  key_id text not null references api_keys(id) on delete cascade,
  minute timestamptz not null,
  count integer not null default 0,
  primary key (key_id, minute)
);

create table if not exists api_requests (
  id text primary key,
  key_id text not null references api_keys(id) on delete cascade,
  at timestamptz not null default now(),
  method text not null,
  path text not null,
  status integer not null
);
create index if not exists api_requests_key on api_requests(key_id, at desc);

create table if not exists webhooks (
  id text primary key,
  organizer_id text not null references organizers(id) on delete cascade,
  url text not null,
  secret text not null,
  events text[] not null default '{ticket.sold}',
  active boolean not null default true,
  failures integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists webhooks_org on webhooks(organizer_id);

create table if not exists webhook_deliveries (
  id text primary key,
  webhook_id text not null references webhooks(id) on delete cascade,
  event text not null,
  at timestamptz not null default now(),
  status_code integer,
  ok boolean not null,
  error text
);
create index if not exists webhook_deliveries_hook on webhook_deliveries(webhook_id, at desc);

-- Limite de fréquence (créations de compte, renvois de lien de confirmation) : un événement par action.
create table if not exists rate_events (
  key text not null,
  at timestamptz not null default now()
);
create index if not exists rate_events_key on rate_events(key, at);

-- Codes à usage unique (OTP) envoyés sur WhatsApp : seule l'empreinte du code est gardée.
-- La limite (3 demandes par 24 h glissantes, tous motifs confondus) se calcule sur cette table, sous verrou consultatif.
create table if not exists otp_verifications (
  id text primary key,
  user_id text references users(id) on delete cascade,
  phone_number text not null,
  otp_hash text not null,
  purpose text not null check (purpose in ('register', 'forgot_password', 'change_password')),
  expires_at timestamptz not null,
  attempts int not null default 0,
  verified_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  send_failed boolean not null default false,
  wamid text,
  delivery_status text
);
create index if not exists otp_verifications_phone on otp_verifications(phone_number, created_at);
create index if not exists otp_verifications_user on otp_verifications(user_id, created_at);
create index if not exists otp_verifications_wamid on otp_verifications(wamid);

-- Journal de sécurité : jamais de code, numéros masqués. Conservé 90 jours.
create table if not exists otp_security_log (
  id text primary key,
  at timestamptz not null default now(),
  event text not null,
  purpose text,
  user_id text,
  phone_masked text,
  detail jsonb not null default '{}'::jsonb
);
create index if not exists otp_security_log_at on otp_security_log(at);

-- Sessions ouvertes avant cette date : fermées (après un changement de mot de passe par code)
alter table users add column if not exists sessions_valid_from timestamptz;

-- ====================================================================================================
-- Authentification par Google (OpenID Connect), passkeys, récupération de compte. Migration additive :
-- rien n'est supprimé ni modifié dans les comptes existants. Retour arrière : drop des tables ci-dessous.
-- ====================================================================================================

-- Identités d'authentification d'un compte EVENT509 (l'identifiant interne users.id ne change jamais).
-- Google : « subject » = le « sub » stable de Google (jamais l'email). Plusieurs identités possibles par compte.
create table if not exists auth_identities (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  provider text not null check (provider in ('google')),
  subject text not null,
  email text,
  status text not null default 'active' check (status in ('active', 'replaced')),
  created_at timestamptz not null default now(),
  replaced_at timestamptz
);
-- Une identité Google active n'appartient qu'à un seul compte ; un seul Google actif par compte
create unique index if not exists auth_identities_active_subject on auth_identities(provider, subject) where status = 'active';
create unique index if not exists auth_identities_active_user on auth_identities(user_id, provider) where status = 'active';

-- Départ d'une connexion Google : état, nonce et vérificateur PKCE (usage unique, 10 minutes)
create table if not exists oauth_states (
  state_hash text primary key,
  nonce text not null,
  code_verifier text not null,
  purpose text not null check (purpose in ('login', 'link', 'reauth', 'recover')),
  user_id text references users(id) on delete cascade,
  recovery_id text,
  next_path text,
  browser_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Inscription provisoire : pas encore un compte. Expire seule (24 h) ; supprimée à la création du compte.
create table if not exists pending_signups (
  id_hash text primary key,
  google_sub text not null,
  email text not null,
  given_name text,
  family_name text,
  picture text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create unique index if not exists pending_signups_sub on pending_signups(google_sub);

-- Nouveau compte Google en attente de confirmation explicite (changement de compte Google)
create table if not exists pending_links (
  id_hash text primary key,
  user_id text not null references users(id) on delete cascade,
  google_sub text not null,
  email text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Questions de sécurité (3 par compte, formulées par l'utilisateur). Réponses : Argon2id, jamais en clair.
create table if not exists security_questions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  position int not null check (position between 1 and 3),
  question text not null,
  answer_hash text not null,
  created_at timestamptz not null default now(),
  unique (user_id, position)
);

-- Passkeys (WebAuthn / FIDO2) : seule la clé publique est gardée
create table if not exists webauthn_credentials (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  credential_id text not null unique,
  public_key text not null,
  counter bigint not null default 0,
  transports text[],
  device_type text,
  backed_up boolean not null default false,
  name text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists webauthn_credentials_user on webauthn_credentials(user_id);

-- Défis WebAuthn (usage unique, 5 minutes)
create table if not exists auth_challenges (
  id_hash text primary key,
  purpose text not null,
  challenge text not null,
  user_id text references users(id) on delete cascade,
  recovery_id text,
  expires_at timestamptz not null
);

-- Codes de récupération : seule l'empreinte est gardée, un code ne sert qu'une fois
create table if not exists recovery_codes (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  code_hash text not null unique,
  batch text not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists recovery_codes_user on recovery_codes(user_id);

-- Sessions (cookie HttpOnly) : l'identifiant du cookie n'est jamais stocké, seulement son empreinte
create table if not exists auth_sessions (
  id_hash text primary key,
  user_id text not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  recent_auth_at timestamptz not null default now(),
  limited boolean not null default false,
  user_agent text,
  device_label text,
  ip_masked text,
  method text
);
create index if not exists auth_sessions_user on auth_sessions(user_id);

-- Parcours « je n'ai plus accès à mon compte Google » : facteurs validés pour une tentative donnée
create table if not exists recovery_sessions (
  id_hash text primary key,
  user_id text references users(id) on delete cascade,
  factors text[] not null default '{}',
  attempts int not null default 0,
  locked_until timestamptz,
  expires_at timestamptz not null,
  completed_at timestamptz,
  request_id text,
  created_at timestamptz not null default now()
);

-- Demandes de récupération avec assistance de l'administration
create table if not exists recovery_requests (
  id text primary key,
  token_hash text not null unique,
  user_id text references users(id) on delete cascade,
  identifier text not null,
  reason text not null,
  contact text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'blocked', 'cancelled', 'completed')),
  decided_by text references users(id) on delete set null,
  decided_at timestamptz,
  note text,
  execute_after timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists recovery_requests_status on recovery_requests(status, created_at);

-- Historique des opérations de sécurité (jamais de secret, de code ni de réponse)
create table if not exists security_events (
  id text primary key,
  user_id text references users(id) on delete cascade,
  event text not null,
  detail jsonb not null default '{}'::jsonb,
  ip_masked text,
  at timestamptz not null default now()
);
create index if not exists security_events_user on security_events(user_id, at desc);

-- Profil de compte
alter table users add column if not exists username text;
create unique index if not exists users_username_lower on users (lower(username)) where username is not null;
-- Faux tant que les questions de sécurité et l'acceptation des conditions ne sont pas enregistrées (comptes d'avant la refonte)
alter table users add column if not exists auth_complete boolean not null default false;
alter table recovery_sessions add column if not exists request_id text;

-- Connexion Google depuis l'application Android : Google refuse les WebView, la connexion se fait dans le navigateur du téléphone
-- (Chrome Custom Tab) puis revient dans l'application avec un code à usage unique (2 min) échangé contre une vraie session,
-- à condition de présenter le secret (PKCE) que seule l'application connaît.
alter table oauth_states add column if not exists app_challenge text;
create table if not exists app_handoffs (
  code_hash text primary key,
  kind text not null check (kind in ('session', 'signup')),
  user_id text references users(id) on delete cascade,
  pending_hash text,
  challenge text not null,
  next_path text,
  method text not null default 'google',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Application Android hébergée par la plateforme : un seul APK (le dernier), stocké en morceaux et remplacé à chaque envoi
create table if not exists app_release (
  id int primary key check (id = 1),
  version_code int not null,
  version_name text not null,
  size bigint not null,
  sha256 text not null,
  chunks int not null,
  upload_id text not null,
  uploaded_by text,
  created_at timestamptz not null default now()
);
create table if not exists app_upload (
  upload_id text primary key,
  created_by text,
  created_at timestamptz not null default now()
);
create table if not exists app_chunk (
  upload_id text not null,
  idx int not null,
  data bytea not null,
  primary key (upload_id, idx)
);

-- Réseau social : abonnements aux organisateurs, commentaires sur les événements, messages privés aux organisateurs.
create table if not exists follows (
  user_id text not null references users(id) on delete cascade,
  organizer_id text not null references organizers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, organizer_id)
);
create index if not exists follows_org on follows(organizer_id);

create table if not exists event_comments (
  id text primary key,
  event_id text not null references events(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  parent_id text references event_comments(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists event_comments_event on event_comments(event_id, created_at desc);
create index if not exists event_comments_parent on event_comments(parent_id);
create index if not exists event_comments_user on event_comments(user_id, created_at desc);

create table if not exists conversations (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  organizer_id text not null references organizers(id) on delete cascade,
  event_id text,
  last_at timestamptz not null default now(),
  user_unread integer not null default 0,
  org_unread integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, organizer_id)
);
create index if not exists conversations_org on conversations(organizer_id, last_at desc);
create index if not exists conversations_user on conversations(user_id, last_at desc);

create table if not exists messages (
  id text primary key,
  conversation_id text not null references conversations(id) on delete cascade,
  sender text not null check (sender in ('user', 'org')),
  sender_user_id text,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists messages_conv on messages(conversation_id, created_at);

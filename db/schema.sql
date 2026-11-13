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
  organizer_id text not null,
  user_id text,
  kind text not null check (kind in ('event_cover', 'org_logo', 'verification')),
  doc_type text,
  visibility text not null check (visibility in ('public', 'private')),
  mime text not null,
  name text not null,
  size integer not null,
  data bytea not null,
  created_at timestamptz not null default now()
);
create index if not exists files_org on files(organizer_id, kind);

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

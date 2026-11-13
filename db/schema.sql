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

-- Historical identity fixture boundary after migrations 0075/0078/0081 and
-- before issue #643. Columns mirror those migrations/current schema. Identity
-- guardrails are intentionally absent so the versioned matrix can represent
-- production drift that the preflight must detect before contract deployment.
create table __SCHEMA__.canteens (
  id uuid primary key,
  name text not null,
  location text,
  announcement text,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create table __SCHEMA__.canteen_menu_sources (
  id uuid primary key,
  canteen_id uuid not null,
  provider text not null,
  external_owner_id text,
  external_store_id text not null,
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  last_attempt_id uuid,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_snapshot_hash text,
  observed_state text,
  last_error_code text,
  last_error text,
  legacy_takeover_at timestamptz,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create table __SCHEMA__.canteen_menu_items (
  id uuid primary key,
  canteen_id uuid not null,
  name text not null default 'fixture item',
  price integer,
  meal_periods text[] not null default '{allday}',
  sort_order integer not null default 0,
  svg_key text not null default 'default',
  menu_source_id uuid,
  external_product_id text,
  external_source text,
  external_key text,
  is_available boolean not null default true,
  last_synced_at timestamptz,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create table __SCHEMA__.canteen_menu_item_prices (
  id uuid primary key,
  menu_item_id uuid not null,
  label text,
  amount_minor integer not null,
  currency text not null default 'HKD',
  sort_order integer not null default 0,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create table __SCHEMA__.canteen_dish_votes (
  id uuid primary key,
  menu_item_id uuid not null,
  user_id uuid,
  anonymous_session_id uuid,
  vote text,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create table __SCHEMA__.canteen_dish_comments (
  id uuid primary key,
  menu_item_id uuid not null,
  user_id uuid not null,
  content text not null,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create table __SCHEMA__.canteen_menu_sync_runs (
  id uuid primary key,
  menu_source_id uuid not null,
  status text not null default 'running',
  snapshot_hash text,
  item_count integer,
  created_count integer,
  updated_count integer,
  deactivated_count integer,
  observation jsonb not null default '{}'::jsonb,
  error_code text,
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table __SCHEMA__.__drizzle_migrations (
  id serial primary key,
  hash text not null,
  created_at bigint
);

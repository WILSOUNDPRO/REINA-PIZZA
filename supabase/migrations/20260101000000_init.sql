-- Reina Pizza — schéma initial.
-- Montants : entiers en unités mineures (centimes). La devise est un réglage explicite (settings.currency).
-- Sécurité : RLS activé sur toutes les tables, SANS politique pour anon/authenticated.
-- Tout l'accès aux données passe par le serveur Next.js (connexion DATABASE_URL, rôle propriétaire).
-- Aucune donnée n'est donc lisible ni modifiable avec la clé anon publique.

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ───────────── Réglages du restaurant (ligne unique) ─────────────
create table settings (
  id int primary key default 1 check (id = 1),
  restaurant_name text not null default 'Reina Pizza',
  address text not null default 'Delmas 33, rue Charbonnier, impasse Costo',
  phone text not null default '+509 4646-1212',
  whatsapp_number text not null default '50946461212' check (whatsapp_number ~ '^[0-9]{8,15}$'),
  hours_text text not null default 'Ouvert 24 h/24, 7 j/7',
  -- NULL tant que le propriétaire n'a pas confirmé la devise : les commandes sont alors impossibles.
  currency text check (currency in ('HTG', 'USD')),
  orders_paused boolean not null default false,
  pause_message text,
  proposal_ttl_hours int not null default 24 check (proposal_ttl_hours between 1 and 168),
  payment_ttl_minutes int not null default 30 check (payment_ttl_minutes between 5 and 1440),
  updated_at timestamptz not null default now()
);
insert into settings (id) values (1);
create trigger settings_updated before update on settings for each row execute function set_updated_at();

-- ───────────── Catalogue ─────────────
create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 80),
  position int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references categories(id) on delete set null,
  name text not null check (length(name) between 1 and 120),
  description text not null default '' check (length(description) <= 1000),
  image_url text,
  available boolean not null default true,
  position int not null default 0,
  -- Produit de démonstration : jamais payable avec un vrai prestataire.
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger products_updated before update on products for each row execute function set_updated_at();

create table product_sizes (
  product_id uuid not null references products(id) on delete cascade,
  size text not null check (size in ('S', 'M', 'L', 'XL', 'XXL')),
  price_minor int not null check (price_minor >= 0),
  available boolean not null default true,
  primary key (product_id, size)
);

-- Suppléments (aucune offre n'est préchargée).
create table extras (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 80),
  price_minor int not null check (price_minor >= 0),
  available boolean not null default true,
  position int not null default 0,
  is_demo boolean not null default false
);

-- ───────────── Livraison ─────────────
create table delivery_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  commune text,
  fee_minor int not null check (fee_minor >= 0),
  active boolean not null default true,
  position int not null default 0,
  is_demo boolean not null default false
);

-- ───────────── Commandes ─────────────
create table orders (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  -- Jeton imprévisible (256 bits) donnant accès à la page client ; la référence seule ne suffit jamais.
  access_token text not null unique check (length(access_token) >= 32),
  -- Clé générée par le navigateur : empêche les doubles soumissions.
  idempotency_key text not null unique check (length(idempotency_key) between 16 and 100),

  order_status text not null default 'to_confirm'
    check (order_status in ('to_confirm', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled')),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'pending', 'paid', 'failed', 'cancelled', 'review')),

  delivery_mode text not null check (delivery_mode in ('zone', 'quote')),
  delivery_zone_id uuid references delivery_zones(id) on delete set null,
  delivery_zone_name text,
  -- Le total (frais inclus) expire à cette date s'il n'est pas payé.
  -- to_confirm : frais à fixer par l'admin ; proposed : fixés, en attente d'acceptation ; accepted : total approuvé.
  fee_status text not null check (fee_status in ('to_confirm', 'proposed', 'accepted')),
  total_expires_at timestamptz,

  currency text not null check (currency in ('HTG', 'USD')),
  subtotal_minor int not null check (subtotal_minor >= 0),
  delivery_fee_minor int check (delivery_fee_minor >= 0),
  total_minor int check (total_minor >= 0),
  -- Incrémenté à chaque modification du total ; lie un paiement à un total précis.
  total_version int not null default 1,

  customer_name text not null,
  customer_phone text not null,
  customer_whatsapp text,
  customer_email text,
  commune text not null,
  quarter text not null,
  address text not null,
  landmark text not null,
  gps_location text,
  delivery_instructions text,
  notes text,

  has_demo_items boolean not null default false,
  acknowledged_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint fee_consistency check ((fee_status = 'to_confirm') = (delivery_fee_minor is null)),
  constraint total_consistency check (
    (delivery_fee_minor is null and total_minor is null)
    or (delivery_fee_minor is not null and total_minor = subtotal_minor + delivery_fee_minor)
  )
);
create index orders_created_idx on orders (created_at desc);
create index orders_status_idx on orders (order_status);
create index orders_payment_idx on orders (payment_status);
create index orders_unack_idx on orders (created_at) where acknowledged_at is null;
create trigger orders_updated before update on orders for each row execute function set_updated_at();

-- Lignes : instantané des noms, descriptions et prix au moment de l'achat.
create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  position int not null default 0,
  product_id uuid references products(id) on delete set null,
  product_name text not null,
  product_description text not null default '',
  size text not null,
  unit_price_minor int not null check (unit_price_minor >= 0),
  quantity int not null check (quantity between 1 and 50),
  extras jsonb not null default '[]'::jsonb,   -- [{id, name, price_minor}]
  line_total_minor int not null check (line_total_minor >= 0),
  is_demo boolean not null default false
);
create index order_items_order_idx on order_items (order_id);

-- Historique des changements importants (statut, frais de livraison, paiement).
create table order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references orders(id) on delete cascade,
  kind text not null,       -- created | status | delivery_fee | fee_accepted | payment | note
  from_value text,
  to_value text,
  actor text not null,      -- system | customer | e-mail de l'admin
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index order_events_order_idx on order_events (order_id, id);

-- ───────────── Paiements ─────────────
create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  provider text not null,
  provider_ref text,
  amount_minor int not null check (amount_minor >= 0),
  currency text not null,
  total_version int not null,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'cancelled', 'expired', 'duplicate', 'mismatch')),
  redirect_url text,
  expires_at timestamptz not null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_ref)
);
create index payments_order_idx on payments (order_id);
-- Garde-fou ultime contre un double encaissement : un seul paiement « paid » par commande.
create unique index payments_one_paid_per_order on payments (order_id) where status = 'paid';

-- Déduplication des notifications du prestataire (rejeu = no-op).
create table payment_events (
  provider text not null,
  event_id text not null,
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);

-- ───────────── Divers ─────────────
create table rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  count int not null default 0
);

create table admin_users (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);

-- ───────────── RLS : tout est verrouillé pour anon / authenticated ─────────────
do $$
declare t text;
begin
  foreach t in array array['settings','categories','products','product_sizes','extras','delivery_zones',
    'orders','order_items','order_events','payments','payment_events','rate_limits','admin_users']
  loop
    execute format('alter table %I enable row level security', t);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on %I from anon', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on %I from authenticated', t);
    end if;
  end loop;
end $$;

-- ───────────── Stockage des photos (Supabase uniquement) ─────────────
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('menu-images', 'menu-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;
    -- Lecture publique des photos du menu ; aucune politique d'écriture : seules les actions
    -- admin côté serveur (clé de service) peuvent téléverser.
  end if;
end $$;

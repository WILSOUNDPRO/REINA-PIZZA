-- Reina Pizza — installation complète pour un NOUVEAU projet Supabase (éditeur SQL → coller → Run).
-- À exécuter UNE SEULE FOIS sur une base vide. Généré par `npm run db:bundle` : ne pas modifier à la main.
-- Ensuite, autorisez l'administrateur :
--   insert into admin_users (email) values ('votre-email@exemple.com');  -- en minuscules

-- ═════════ 20260101000000_init.sql ═════════
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

-- ═════════ 20260102000000_offline_payment_real_catalog.sql ═════════
-- Version 1 : aucun paiement sur le site. Le paiement est organisé directement avec la pizzeria.
-- Migration IDEMPOTENTE : ne supprime aucune commande, ne modifie aucun montant existant et n'écrase pas
-- les données réelles déjà saisies (produits/prix existants conservés).

-- ───────────── Statut de paiement : « à organiser / en attente / confirmé manuellement » ─────────────
-- Les anciennes valeurs (unpaid, paid, failed, cancelled, review) restent autorisées pour préserver l'historique.
alter table orders drop constraint if exists orders_payment_status_check;
alter table orders add constraint orders_payment_status_check
  check (payment_status in ('to_arrange', 'pending', 'confirmed_manually', 'unpaid', 'paid', 'failed', 'cancelled', 'review'));
alter table orders alter column payment_status set default 'to_arrange';
-- Une commande « non payée » n'a jamais été encaissée : elle devient simplement « à organiser » (montants inchangés).
update orders set payment_status = 'to_arrange' where payment_status = 'unpaid';

-- Frais : « set » (fixés) s'ajoute aux anciennes valeurs proposed / accepted, conservées.
alter table orders drop constraint if exists orders_fee_status_check;
alter table orders add constraint orders_fee_status_check check (fee_status in ('to_confirm', 'set', 'proposed', 'accepted'));

-- Traçabilité de la confirmation manuelle d'un paiement.
alter table orders add column if not exists payment_confirmed_by text;
alter table orders add column if not exists payment_method text;        -- libellé choisi (instantané)
alter table orders add column if not exists payment_method_note text;   -- précision libre du client

-- ───────────── Moyens de paiement activés par l'administrateur ─────────────
create table if not exists payment_methods (
  id uuid primary key default gen_random_uuid(),
  label text not null unique check (length(label) between 1 and 80),
  enabled boolean not null default true,
  position int not null default 0
);
alter table payment_methods enable row level security;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on payment_methods from anon; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then revoke all on payment_methods from authenticated; end if;
end $$;
insert into payment_methods (label, position) values ('À convenir avec la pizzeria', 0) on conflict (label) do nothing;

-- ───────────── Devise confirmée : HTG ─────────────
update settings set currency = 'HTG' where id = 1 and currency is null;

-- ───────────── Catalogue : retrait des données de démonstration, ajout des produits réels ─────────────
-- Les lignes de commande conservent leur instantané (product_id passe simplement à NULL).
delete from products where is_demo;
delete from extras where is_demo;
delete from delivery_zones where is_demo;
delete from categories where name = 'Pizzas (démo)' and not exists (select 1 from products p where p.category_id = categories.id);

insert into categories (name, position)
select 'Pizzas', 1 where not exists (select 1 from categories where lower(name) = 'pizzas');

-- Produits réels (descriptions volontairement vides : aucun ingrédient n'est inventé).
-- Seule la taille S a un prix confirmé ; les autres tailles ne sont pas proposées tant qu'aucun prix n'est saisi.
do $$
declare
  cat uuid := (select id from categories where lower(name) = 'pizzas' order by position limit 1);
  r record;
  pid uuid;
begin
  for r in select * from (values
    ('Pizza pepperoni', 1, 150000), ('Pizza jambon', 2, 125000), ('Pizza hareng saur', 3, 180000)
  ) as t(name, pos, price) loop
    select id into pid from products where lower(name) = lower(r.name) limit 1;
    if pid is null then
      insert into products (category_id, name, description, position, is_demo) values (cat, r.name, '', r.pos, false) returning id into pid;
    end if;
    -- Ne remplace jamais un prix déjà saisi.
    insert into product_sizes (product_id, size, price_minor, available) values (pid, 'S', r.price, true) on conflict (product_id, size) do nothing;
  end loop;
end $$;

-- ═════════ 20260103000000_default_product_images.sql ═════════
-- Visuels par défaut (illustrations générées) associés aux trois produits réels.
-- La photo ajoutée par l'administrateur (products.image_url) prime TOUJOURS : l'illustration ne sert que lorsqu'il n'y en a pas.
-- Idempotent : ne remplace jamais une valeur déjà renseignée. Aucune description ni recette n'est modifiée.
alter table products add column if not exists default_image text
  check (default_image is null or default_image ~ '^[a-z0-9-]{1,60}$');

update products set default_image = 'pepperoni'   where default_image is null and lower(name) = 'pizza pepperoni';
update products set default_image = 'jambon'      where default_image is null and lower(name) = 'pizza jambon';
update products set default_image = 'hareng-saur' where default_image is null and lower(name) = 'pizza hareng saur';

-- ═════════ 20260104000000_product_archive.sql ═════════
-- Archivage des produits : un produit lié à des commandes n'est jamais supprimé, il est archivé (masqué du site et des listes courantes).
-- Les commandes gardent leur instantané (nom, taille, prix) et ne changent pas.
alter table products add column if not exists archived_at timestamptz;

-- ═════════ 20260105000000_payment_methods_details.sql ═════════
-- Moyens de paiement : instructions, compte destinataire et bénéficiaire (facultatifs), puis activation de MonCash.
-- Le paiement reste organisé HORS SITE avec la pizzeria : aucune intégration de paiement en ligne.
-- Idempotent : ne réactive jamais un moyen désactivé par l'administrateur et n'écrase aucune saisie existante.
alter table payment_methods add column if not exists instructions text check (instructions is null or length(instructions) <= 500);
alter table payment_methods add column if not exists recipient_account text check (recipient_account is null or length(recipient_account) <= 60);
alter table payment_methods add column if not exists recipient_name text check (recipient_name is null or length(recipient_name) <= 100);

-- MonCash est accepté. Le numéro de réception n'est PAS supposé identique au numéro de contact de Reina Pizza :
-- il reste vide, à compléter par l'administrateur (Administration → Moyens de paiement).
insert into payment_methods (label, enabled, position) values ('MonCash', true, 1) on conflict (label) do nothing;

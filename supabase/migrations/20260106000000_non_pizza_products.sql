-- Produits hors pizzas (Burger, Wings) : prix, unité de vente et variantes facultatives, configurés dans l'administration.
-- Aucun prix, aucune portion, aucune recette n'est inventé : les produits sont créés NON configurés et s'affichent « Bientôt disponible ».
-- Idempotent : n'ajoute aucun doublon et n'écrase aucune saisie.
alter table products add column if not exists product_type text not null default 'pizza' check (product_type in ('pizza', 'other'));
-- Unité de vente d'un produit « other » : à l'unité ou par portion. NULL = non configurée. (Les pizzas se vendent par taille S–XXL.)
alter table products add column if not exists sale_unit text check (sale_unit in ('unit', 'portion'));
alter table products add column if not exists base_price_minor int check (base_price_minor > 0);
alter table products add column if not exists pieces_per_portion int check (pieces_per_portion between 1 and 200);
alter table products add column if not exists ingredients text check (ingredients is null or length(ingredients) <= 1000);
-- visible : affiché au catalogue ; available : commandable (activation par l'administrateur).
alter table products add column if not exists visible boolean not null default true;

create table if not exists product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  label text not null check (length(label) between 1 and 40),
  price_minor int not null check (price_minor > 0),
  position int not null default 0,
  available boolean not null default true,
  unique (product_id, label)
);
alter table product_variants enable row level security;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on product_variants from anon; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then revoke all on product_variants from authenticated; end if;
end $$;

-- Lignes de commande : une taille n'existe que pour les pizzas. option_label = instantané de l'unité / variante des autres produits.
alter table order_items alter column size drop not null;
alter table order_items add column if not exists option_label text;

insert into categories (name, position) select 'Burgers', 2 where not exists (select 1 from categories where lower(name) = 'burgers');
insert into categories (name, position) select 'Wings', 3 where not exists (select 1 from categories where lower(name) = 'wings');

-- Non configurés (sans prix ni unité), non commandables (available = false), avec leur illustration par défaut.
insert into products (category_id, name, description, position, product_type, available, default_image, is_demo)
select (select id from categories where lower(name) = 'burgers' order by position limit 1), 'Burger', '', 10, 'other', false, 'burger', false
where not exists (select 1 from products where lower(name) in ('burger', 'burger + frites') or default_image in ('burger', 'burger-frites'));
insert into products (category_id, name, description, position, product_type, available, default_image, is_demo)
select (select id from categories where lower(name) = 'wings' order by position limit 1), 'Wings', '', 11, 'other', false, 'wings', false
where not exists (select 1 from products where lower(name) in ('wings', 'wings bbq') or default_image = 'wings');

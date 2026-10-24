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

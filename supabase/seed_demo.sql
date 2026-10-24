-- DONNÉES DE DÉMONSTRATION — pour le développement uniquement. Jamais le vrai catalogue.
-- Tous les produits, suppléments et zones sont marqués is_demo = true : ils ne peuvent pas
-- être payés avec un vrai prestataire de paiement.
-- Prix et zones fictifs ; la devise HTG n'est posée ici que pour tester (à confirmer par le propriétaire).
update settings set currency = 'HTG' where id = 1 and currency is null;

insert into categories (id, name, position) values
  ('11111111-1111-1111-1111-111111111111', 'Pizzas (démo)', 1)
on conflict do nothing;

insert into products (id, category_id, name, description, position, is_demo) values
  ('22222222-2222-2222-2222-222222222221', '11111111-1111-1111-1111-111111111111',
   '[DÉMO] Pizza exemple A', 'Produit de démonstration : description à remplacer par le vrai menu.', 1, true),
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
   '[DÉMO] Pizza exemple B', 'Produit de démonstration : ingrédients à renseigner par le restaurant.', 2, true)
on conflict do nothing;

insert into product_sizes (product_id, size, price_minor) values
  ('22222222-2222-2222-2222-222222222221', 'S', 100000),
  ('22222222-2222-2222-2222-222222222221', 'M', 150000),
  ('22222222-2222-2222-2222-222222222221', 'L', 200000),
  ('22222222-2222-2222-2222-222222222222', 'M', 160000),
  ('22222222-2222-2222-2222-222222222222', 'XL', 280000)
on conflict do nothing;

insert into extras (id, name, price_minor, is_demo) values
  ('33333333-3333-3333-3333-333333333331', '[DÉMO] Supplément exemple', 20000, true)
on conflict do nothing;

insert into delivery_zones (id, name, commune, fee_minor, is_demo) values
  ('44444444-4444-4444-4444-444444444441', '[DÉMO] Zone exemple', 'Delmas', 25000, true)
on conflict do nothing;

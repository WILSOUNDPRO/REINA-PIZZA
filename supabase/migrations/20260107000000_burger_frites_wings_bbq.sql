-- Prix et portions confirmés : « Burger + frites » (1 250 HTG) et « Wings BBQ » (6 pièces : 600 HTG, 12 pièces : 1 200 HTG).
-- Idempotente et non destructive :
--  * ne touche qu'aux produits encore non configurés (ni prix, ni unité, ni variante) : une fois configurés, l'administrateur garde la main ;
--  * ne renomme que les noms d'origine (« Burger », « Wings ») ; ne remplace jamais une description, un prix ou une photo saisis dans l'administration ;
--  * ne crée aucun produit : les anciennes commandes (instantanés de nom, prix et option) ne changent pas.

-- Nombre de pièces propre à une variante (portion de 6 ou 12 pièces).
alter table product_variants add column if not exists pieces int check (pieces is null or pieces between 1 and 200);

-- Nouvelle illustration du burger (burger + frites) ; la photo téléversée par l'administrateur (image_url) reste prioritaire.
update products set default_image = 'burger-frites' where product_type = 'other' and default_image = 'burger';

-- Burger + frites : un burger accompagné de frites incluses, boisson non incluse.
update products set
  name = case when name = 'Burger' then 'Burger + frites' else name end,
  description = case when description = '' then 'Un burger accompagné de frites, incluses dans le prix. Boisson non incluse.' else description end,
  sale_unit = 'unit', base_price_minor = 125000, available = true
where product_type = 'other' and default_image = 'burger-frites' and sale_unit is null and base_price_minor is null
  and not exists (select 1 from product_variants v where v.product_id = products.id);

-- Wings BBQ : vente par portion, choix obligatoire entre 6 et 12 pièces (aucun prix de base, aucune frite ni boisson).
with w as (
  update products set
    name = case when name = 'Wings' then 'Wings BBQ' else name end,
    description = case when description = '' then 'Wings barbecue (BBQ), vendus par portion de 6 ou 12 pièces.' else description end,
    sale_unit = 'portion', available = true
  where product_type = 'other' and default_image = 'wings' and sale_unit is null and base_price_minor is null
    and not exists (select 1 from product_variants v where v.product_id = products.id)
  returning id
)
insert into product_variants (product_id, label, price_minor, position, available, pieces)
select w.id, v.label, v.price_minor, v.position, true, v.pieces
from w cross join (values ('6 pièces', 60000, 0, 6), ('12 pièces', 120000, 1, 12)) as v(label, price_minor, position, pieces)
on conflict (product_id, label) do nothing;

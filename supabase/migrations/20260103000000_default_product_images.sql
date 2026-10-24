-- Visuels par défaut (illustrations générées) associés aux trois produits réels.
-- La photo ajoutée par l'administrateur (products.image_url) prime TOUJOURS : l'illustration ne sert que lorsqu'il n'y en a pas.
-- Idempotent : ne remplace jamais une valeur déjà renseignée. Aucune description ni recette n'est modifiée.
alter table products add column if not exists default_image text
  check (default_image is null or default_image ~ '^[a-z0-9-]{1,60}$');

update products set default_image = 'pepperoni'   where default_image is null and lower(name) = 'pizza pepperoni';
update products set default_image = 'jambon'      where default_image is null and lower(name) = 'pizza jambon';
update products set default_image = 'hareng-saur' where default_image is null and lower(name) = 'pizza hareng saur';

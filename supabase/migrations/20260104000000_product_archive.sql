-- Archivage des produits : un produit lié à des commandes n'est jamais supprimé, il est archivé (masqué du site et des listes courantes).
-- Les commandes gardent leur instantané (nom, taille, prix) et ne changent pas.
alter table products add column if not exists archived_at timestamptz;

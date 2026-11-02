-- Moyen de paiement souhaité « Espèces à la livraison » (en plus de MonCash et de « À convenir avec la pizzeria »).
-- Il ne s'agit que d'un souhait : aucun paiement n'est effectué sur le site et une commande n'est jamais marquée payée à cause de ce choix.
-- Idempotent : ne crée pas de doublon et ne réactive pas un moyen que l'administrateur aurait désactivé.
insert into payment_methods (label, enabled, position)
select 'Espèces à la livraison', true, 2
where not exists (select 1 from payment_methods where lower(label) in ('espèces à la livraison', 'especes a la livraison'));

-- Moyens de paiement : instructions, compte destinataire et bénéficiaire (facultatifs), puis activation de MonCash.
-- Le paiement reste organisé HORS SITE avec la pizzeria : aucune intégration de paiement en ligne.
-- Idempotent : ne réactive jamais un moyen désactivé par l'administrateur et n'écrase aucune saisie existante.
alter table payment_methods add column if not exists instructions text check (instructions is null or length(instructions) <= 500);
alter table payment_methods add column if not exists recipient_account text check (recipient_account is null or length(recipient_account) <= 60);
alter table payment_methods add column if not exists recipient_name text check (recipient_name is null or length(recipient_name) <= 100);

-- MonCash est accepté. Le numéro de réception n'est PAS supposé identique au numéro de contact de Reina Pizza :
-- il reste vide, à compléter par l'administrateur (Administration → Moyens de paiement).
insert into payment_methods (label, enabled, position) values ('MonCash', true, 1) on conflict (label) do nothing;

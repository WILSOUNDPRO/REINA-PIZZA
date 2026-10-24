# Reina Pizza — commande et livraison

Next.js 15 (App Router) · TypeScript · Tailwind 4 · Postgres/Supabase (base, Auth admin, Storage des photos). Français, devise HTG ou USD au choix du propriétaire, fuseau `America/Port-au-Prince`.

## Fonctionnement
- **Client** : accueil, menu (tailles S–XXL, prix par taille, suppléments), panier persistant (identifiants + quantités ; prix toujours recalculés par le serveur), formulaire de livraison (validation client + serveur, numéros haïtiens normalisés en `+509…`), page de commande par **jeton secret de 256 bits** (récapitulatif, statuts, impression, reçu après paiement confirmé, bouton WhatsApp avec la seule référence).
- **Livraison** : (A) zone tarifée → total complet immédiat ; (B) adresse hors zones → « Frais de livraison à confirmer », aucun encaissement ; l'admin fixe les frais, copie le lien (ou l'envoie sur WhatsApp), le client accepte le total puis paie. Modifier le total annule les sessions de paiement ouvertes et exige une nouvelle acceptation ; un total non payé expire (réglable).
- **Admin** `/admin` (Supabase Auth + liste `admin_users`, vérifié côté serveur à chaque page/action) : tableau de bord, commandes filtrables (date, statut, paiement, frais à confirmer, recherche), détail, WhatsApp client, frais, lien copiable, historique, menu/photos/tailles/prix/disponibilité, suppléments, zones, réglages (adresse, horaires, contacts, devise, suspension). Alerte visuelle + sonore (activable par clic) sur les nouvelles commandes.
- **Sécurité** : RLS activé sans politique sur toutes les tables (la clé anon ne lit rien) ; accès données uniquement serveur ; clé de service jamais exposée ; idempotence des commandes (clé unique) ; limitation de débit en base ; champ piège anti-robots ; instantané des prix/descriptions dans chaque ligne de commande ; journaux sans données personnelles.
- **Paiement** : voir [docs/PAIEMENT.md](docs/PAIEMENT.md). **Non opérationnel tant qu'un prestataire n'est pas connecté.**

## Lancer en local
```bash
npm install
cp .env.example .env.local        # puis renseigner
npm run db:migrate                # applique supabase/migrations
npm run db:seed-demo              # DONNÉES FICTIVES (is_demo) pour développer — jamais en production
npm run dev
```
Sans compte Supabase : `npm run mock:supabase` (faux Auth/Storage sur :54321, comptes `admin@reina.test` / `mot-de-passe-test`), avec `SUPABASE_URL=http://localhost:54321`, `SUPABASE_ANON_KEY=anon-test-key`, `SUPABASE_SERVICE_ROLE_KEY=service-test-key`, puis :
```sql
insert into admin_users(email) values ('admin@reina.test');
```
Paiement simulé : `PAYMENT_PROVIDER=simulation`, `SIMULATION_WEBHOOK_SECRET=<aléatoire>` (dev uniquement).

## Configurer Supabase (production)
1. Créer le projet ; exécuter `supabase/migrations/*.sql` (CLI `supabase db push` ou éditeur SQL). Le bucket public `menu-images` est créé par la migration.
2. Auth → **désactiver les inscriptions publiques**, créer le compte admin (e-mail confirmé), puis `insert into admin_users(email) values ('<e-mail en minuscules>');`.
3. Renseigner `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SITE_URL`, `RATE_LIMIT_SALT` côté hébergeur. `DATABASE_URL` doit utiliser un rôle contournant la RLS (rôle `postgres` de Supabase).
4. Dans `/admin` : confirmer la devise, saisir menu, photos, zones, réglages ; supprimer les données de démo.

## Vérification
```bash
npm run typecheck
npm test            # unitaires + intégration sur Postgres (TEST_DATABASE_URL, défaut postgres://reina:reina@localhost:5432/reina_test, base migrée)
npm run test:e2e    # navigateur mobile : nécessite `next dev`, le mock Supabase, la base seedée (voir en-tête du fichier)
```

## Avant la mise en production
Vrai menu, descriptions, prix et photos · devise confirmée · zones et tarifs · compte administrateur · prestataire de paiement vérifié (éligibilité Haïti) et connecté · envoi d'e-mails (optionnel, non implémenté) · `SITE_URL` · nom de domaine/HTTPS. Aucun déploiement n'a été fait.

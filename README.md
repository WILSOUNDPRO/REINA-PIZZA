# Reina Pizza — commande et livraison

Next.js 15 (App Router) · TypeScript · Tailwind 4 · Postgres/Supabase (base, Auth admin, Storage des photos). Français, devise HTG ou USD au choix du propriétaire, fuseau `America/Port-au-Prince`.

## Fonctionnement (version 1 : commande sur le site, paiement hors site)
- **Parcours client** : catalogue → panier → formulaire de livraison → enregistrement de la commande → confirmation → bouton WhatsApp avec le récapitulatif complet. **Aucun paiement n'a lieu sur le site** : le paiement et les derniers détails de livraison s'organisent avec la pizzeria (WhatsApp ou téléphone).
- **Catalogue** : Pizza pepperoni (S, 1 500 HTG), Pizza jambon (S, 1 250 HTG), Pizza hareng saur (S, 1 800 HTG). Devise confirmée : HTG. Seules les tailles ayant un prix réel sont commandables ; les autres affichent « Indisponible » (l'admin ajoute les tarifs dans Menu → Modifier). Aucun ingrédient, supplément ni promotion n'est inventé.
- **Livraison** : zone tarifée → frais et total affichés ; sinon « Frais de livraison à confirmer avec la pizzeria selon votre adresse » (sous-total seul, jamais présenté comme total final) et la commande reste possible. L'admin ajoute les frais dans le détail de commande.
- **Formulaire** : champs obligatoires (dont moyen de paiement souhaité) et facultatifs comme spécifié ; moyens de paiement gérés par l'admin (par défaut « À convenir avec la pizzeria » + précision libre) ; numéros haïtiens normalisés ; validation client et serveur ; aucune donnée de carte demandée.
- **Confirmation** : « Votre commande a été enregistrée », référence, articles, montants, livraison, « En attente de confirmation par la pizzeria », bouton « Contacter Reina Pizza pour confirmer la livraison » (message WhatsApp complet construit côté serveur, sans jeton, encodé), « Copier le message », lien d'appel, version imprimable (jamais un « reçu de paiement »). Le bouton ouvre un brouillon que le client doit envoyer lui-même ; la commande est déjà dans l'admin même sans WhatsApp.
- **Admin** `/admin` (Supabase Auth + liste `admin_users`, contrôle serveur à chaque page/action) : commandes (filtres date/statut/paiement/frais), détail complet, appeler / WhatsApp client, frais, historique, menu/photos/tailles/prix, zones, moyens de paiement, réglages ; alerte visuelle et sonore. Statuts de commande (à confirmer, confirmée, en préparation, en livraison, livrée, annulée) séparés des statuts de paiement (à organiser, en attente, confirmé manuellement). Seul un admin connecté confirme un paiement reçu, en cochant une case ; l'action est journalisée (auteur, date). WhatsApp, livraison ou déclaration du client ne confirment jamais un paiement.
- **Identité visuelle** : logo officiel (`public/brand/logo.png`, ratio 1000×414 conservé, transparence conservée ; couleur uniformisée en #921F24 à partir du canal alpha d'origine, forme inchangée), symbole (`public/brand/symbol.png`) et favicons (`src/app/icon.png`, `apple-icon.png`). Palette : rouge #921F24, ivoire #FAF7F2, texte #202020, gris neutres, vert discret pour WhatsApp. Police unique Inter (hébergée localement via `@fontsource-variable/inter`), icônes `lucide-react`. Cartes arrondies à 16 px, ombres légères, zones tactiles ≥ 44 px, `prefers-reduced-motion` respecté. Les images de la maquette ne sont pas utilisées : l'interface est du vrai HTML/CSS.
- **Photos** : cartes au format 4:3 uniforme (`next/image`, WebP/AVIF, chargement différé, dimensions réservées). À l'envoi depuis l'admin, chaque photo est recadrée au centre en 1200×900 WebP (métadonnées EXIF/GPS retirées) ; **aucune retouche** de couleur ou de contenu n'est faite.
- **Sécurité** : RLS sans politique sur toutes les tables ; accès données uniquement serveur ; clé de service jamais exposée ; commandes idempotentes ; limitation de débit ; champ piège anti-robots ; instantané des prix/descriptions ; journaux sans données personnelles ; jeton de 256 bits pour la page client.
- **Paiement en ligne** : reporté. Code conservé mais désactivé (voir [docs/PAIEMENT.md](docs/PAIEMENT.md)). Les anciennes commandes sont conservées sans modification de montant (aucune n'est marquée payée par la migration).

## Lancer en local
```bash
npm install
cp .env.example .env.local        # puis renseigner
npm run db:migrate                # applique supabase/migrations (dont le catalogue réel, idempotent)
npm run dev
```
Sans compte Supabase : `npm run mock:supabase` (faux Auth/Storage sur :54321, comptes `admin@reina.test` / `mot-de-passe-test`), avec `SUPABASE_URL=http://localhost:54321`, `SUPABASE_ANON_KEY=anon-test-key`, `SUPABASE_SERVICE_ROLE_KEY=service-test-key`, puis :
```sql
insert into admin_users(email) values ('admin@reina.test');
```

## Configurer Supabase (production)
1. Créer le projet ; exécuter `supabase/migrations/*.sql` (CLI `supabase db push` ou éditeur SQL). Le bucket public `menu-images` est créé par la migration.
2. Auth → **désactiver les inscriptions publiques**, créer le compte admin (e-mail confirmé), puis `insert into admin_users(email) values ('<e-mail en minuscules>');`.
3. Renseigner `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SITE_URL`, `RATE_LIMIT_SALT` côté hébergeur. `DATABASE_URL` doit utiliser un rôle contournant la RLS (rôle `postgres` de Supabase).
4. Dans `/admin` : vérifier les réglages, ajouter photos, tarifs des autres tailles, zones de livraison et moyens de paiement acceptés.

## Vérification
```bash
npm run typecheck
npm test            # unitaires + intégration sur Postgres (TEST_DATABASE_URL, défaut postgres://reina:reina@localhost:5432/reina_test, base migrée)
npm run test:e2e    # navigateur mobile : nécessite `next dev`, le mock Supabase, une base migrée (voir en-tête du fichier)
```

## Avant la mise en production
Photos des produits (voir ci-dessous) · prix des tailles M, L, XL, XXL · ingrédients/descriptions (si souhaité) · zones de livraison et tarifs · moyens de paiement réellement acceptés · compte administrateur · `SITE_URL`, domaine et HTTPS · (plus tard) prestataire de paiement en ligne et e-mails. Aucun déploiement n'a été fait.

### Visuels restant à préparer
Aucune photo n'est encore intégrée : bandeaux discrets pour les trois pizzas. Les photos de la maquette sont des références de présentation, pas des photos des recettes : elles n'ont pas été utilisées. La photo « dans la boîte » (jambon et ananas apparents) ne doit être associée à la recette jambon qu'après confirmation ; aucune photo de hareng saur n'est confirmée.

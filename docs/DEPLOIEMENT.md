# Déploiement (Supabase + Vercel)

Aucune étape ne doit exposer de secret : les clés se saisissent dans les variables d'environnement de Vercel, jamais dans le code ni dans une conversation.

## 1. Base de données (Supabase → SQL Editor)
1. Ouvrir `supabase/setup.sql` (généré par `npm run db:bundle`), copier tout le contenu, le coller dans l'éditeur SQL, **Run**. À faire une seule fois sur un projet vide.
2. Autoriser l'administrateur (e-mail du compte créé dans Authentication → Users, **en minuscules**) :
   ```sql
   insert into admin_users (email) values ('votre-email@exemple.com');
   ```
3. Authentication → Sign In / Providers : désactiver « Allow new users to sign up ».

### Projet déjà installé : appliquer seulement les nouvelles migrations
`setup.sql` ne sert qu'à une base vide. Sur une base déjà installée, exécutez uniquement la ou les migrations ajoutées depuis (fichiers de `supabase/migrations`, dans l'ordre). Elles sont idempotentes. Dernière en date : `20260105000000_payment_methods_details.sql` (active MonCash et ajoute les champs instructions / compte destinataire / bénéficiaire). Le site continue de fonctionner avant son application, mais MonCash n'apparaît qu'après.

## 2. Variables d'environnement (Vercel → Settings → Environment Variables)
| Variable | Valeur |
|---|---|
| `DATABASE_URL` | Supabase → Connect → **Transaction pooler** (port 6543), avec le mot de passe de la base. À utiliser sur Vercel plutôt que la connexion directe (IPv6 uniquement sur les offres gratuites). |
| `SUPABASE_URL` | URL du projet (`https://<ref>.supabase.co`) — `NEXT_PUBLIC_SUPABASE_URL` est aussi acceptée |
| `SUPABASE_ANON_KEY` | clé « anon » — `NEXT_PUBLIC_SUPABASE_ANON_KEY` est aussi acceptée |
| `SUPABASE_SERVICE_ROLE_KEY` | clé « service_role » (**secrète**), nécessaire uniquement pour téléverser les photos |
| `SITE_URL` | URL publique du site, sans `/` final |
| `RATE_LIMIT_SALT` | chaîne aléatoire longue |

Ne pas définir `ONLINE_PAYMENTS_ENABLED` : le paiement en ligne reste désactivé. **Redéployer** après toute modification des variables.

## 3. Branche déployée
Vercel doit construire la branche qui contient le code (`claude/reina-pizza-platform-5o90st` tant que la PR #1 n'est pas fusionnée ; `main` ne contient pour l'instant qu'un README).

## 4. Vérifier
- `https://<votre-site>/api/health` : doit renvoyer `"ok": true`. La réponse ne contient que des booléens et le **nom** des variables manquantes (`missing_env`), jamais de valeur : `migrations_applied`, `admin_user_registered`, `public_signup_disabled`…
- `https://<votre-site>/admin/login` : connexion avec le compte administrateur.

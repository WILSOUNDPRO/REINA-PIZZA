# Paiement : état et intégration

**Aucun prestataire réel n'est connecté. Le paiement en ligne n'est donc PAS opérationnel.**
Tant que `PAYMENT_PROVIDER` n'est pas un prestataire configuré, le site affiche « Le paiement en ligne n'est pas encore disponible » et la commande reste enregistrée (règlement via WhatsApp).

## Ce qui est prêt (testé)
- Interface `PaymentProvider` (`src/server/payments/types.ts`) : `createCheckout` (session hébergée par le prestataire) et `verifyWebhook` (signature obligatoire).
- Route `POST /api/webhooks/payments/[provider]` : seule source de vérité. Une redirection navigateur ne change jamais un statut.
- Idempotence : table `payment_events` (rejeu = sans effet), index unique « un seul paiement `paid` par commande », verrou par commande au démarrage du paiement.
- Contrôles : montant, devise et version du total doivent correspondre, sinon la commande passe en « Paiement à vérifier » (jamais « payée »).
- Un échec/annulation tardif n'écrase jamais un paiement confirmé. Un second paiement sur une commande déjà payée est marqué `duplicate` (remboursement manuel).
- Aucune donnée de carte ne transite ni n'est stockée ; les secrets restent côté serveur.
- Fournisseur `simulation` : développement uniquement (`PAYMENT_PROVIDER=simulation` + `SIMULATION_WEBHOOK_SECRET`), refusé quand `NODE_ENV=production`. Il passe par le vrai webhook signé.
- Les produits/zones de démonstration ne sont jamais payables avec un vrai prestataire.

## Avant d'ajouter un vrai prestataire
1. Vérifier dans la **documentation officielle** que le prestataire accepte les marchands établis en Haïti (pays, devise HTG/USD, moyens de paiement) et que le compte du restaurant est éligible. Ne rien supposer pour Stripe, MonCash ou autre.
2. Choisir une **page de paiement hébergée** (ou composants sécurisés du prestataire).
3. Créer `src/server/payments/<nom>.ts` implémentant `PaymentProvider`, l'enregistrer dans `src/server/payments/index.ts`.
   - `createCheckout` : renvoie `redirectUrl` absolue + `providerRef` ; transmettre `amountMinor`/`currency` (unités mineures) et l'URL de retour `returnUrl`.
   - `verifyWebhook` : vérifier la signature sur le **corps brut**, mapper vers `paid | failed | cancelled`, fournir un `eventId` unique.
4. Renseigner les clés dans les variables d'environnement serveur (jamais `NEXT_PUBLIC_`), déclarer l'URL du webhook chez le prestataire : `https://<site>/api/webhooks/payments/<nom>`.
5. Tester en mode bac à sable : succès, échec, annulation, notification rejouée, montant altéré, signature invalide.

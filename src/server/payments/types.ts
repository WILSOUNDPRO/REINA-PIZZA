// Contrat d'intégration d'un prestataire de paiement.
// Un prestataire réel doit : (1) créer une session de paiement HÉBERGÉE par lui (aucune donnée de carte ne transite
// par ce serveur) ; (2) notifier le résultat via un webhook dont la signature est vérifiée ici.
export type WebhookEvent = {
  eventId: string;          // identifiant unique de la notification (déduplication)
  providerRef: string;      // identifiant de la session de paiement côté prestataire
  status: "paid" | "failed" | "cancelled";
  amountMinor: number;
  currency: string;
};

export class InvalidWebhookError extends Error {}

export interface PaymentProvider {
  id: string;
  label: string;
  isConfigured(): boolean;
  createCheckout(input: {
    paymentId: string;
    orderRef: string;
    amountMinor: number;
    currency: string;
    returnUrl: string;
  }): Promise<{ providerRef: string; redirectUrl: string }>;
  /** Doit lever InvalidWebhookError si la signature est absente ou invalide. */
  verifyWebhook(rawBody: string, headers: Headers): WebhookEvent;
}

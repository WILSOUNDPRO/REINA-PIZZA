import { env } from "../env";
import { simulationProvider } from "./simulation";
import type { PaymentProvider } from "./types";

// Ajouter ici un prestataire réel une fois choisi, documentation officielle et éligibilité du marchand en Haïti vérifiées
// (voir docs/PAIEMENT.md). Aucun prestataire réel n'est connecté dans cette version.
const providers: Record<string, PaymentProvider> = {
  [simulationProvider.id]: simulationProvider,
};

export function getProvider(id: string): PaymentProvider | null {
  return providers[id] ?? null;
}

/** Prestataire actif et correctement configuré, sinon null : le paiement est alors désactivé et l'interface l'indique. */
export function activeProvider(): PaymentProvider | null {
  if (!env.onlinePaymentsEnabled()) return null;
  const p = getProvider(env.paymentProvider());
  return p && p.isConfigured() ? p : null;
}

export function paymentsAvailable(): boolean {
  return activeProvider() !== null;
}

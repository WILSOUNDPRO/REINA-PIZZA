import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { env, isProd } from "../env";
import { InvalidWebhookError, type PaymentProvider, type WebhookEvent } from "./types";

export const SIMULATION_SIGNATURE_HEADER = "x-simulation-signature";

export function signSimulationPayload(body: string): string {
  return createHmac("sha256", process.env.SIMULATION_WEBHOOK_SECRET ?? "").update(body).digest("hex");
}

// Prestataire FICTIF pour le développement. Il passe par le même webhook signé qu'un vrai prestataire,
// mais est inactif en production quelle que soit la configuration.
export const simulationProvider: PaymentProvider = {
  id: "simulation",
  label: "Simulation (développement)",
  isConfigured: () => !isProd() && env.paymentProvider() === "simulation" && Boolean(process.env.SIMULATION_WEBHOOK_SECRET),
  async createCheckout({ paymentId }) {
    if (isProd()) throw new Error("La simulation de paiement est interdite en production.");
    return { providerRef: "sim_" + randomUUID(), redirectUrl: `/dev/paiement/${paymentId}` };
  },
  verifyWebhook(rawBody: string, headers: Headers): WebhookEvent {
    if (isProd()) throw new InvalidWebhookError("simulation désactivée");
    const sig = headers.get(SIMULATION_SIGNATURE_HEADER) ?? "";
    const expected = signSimulationPayload(rawBody);
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (!process.env.SIMULATION_WEBHOOK_SECRET || a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new InvalidWebhookError("signature invalide");
    }
    const j = JSON.parse(rawBody);
    if (typeof j.eventId !== "string" || typeof j.providerRef !== "string" || !["paid", "failed", "cancelled"].includes(j.status)
      || !Number.isInteger(j.amountMinor) || typeof j.currency !== "string") {
      throw new InvalidWebhookError("corps invalide");
    }
    return { eventId: j.eventId, providerRef: j.providerRef, status: j.status, amountMinor: j.amountMinor, currency: j.currency };
  },
};

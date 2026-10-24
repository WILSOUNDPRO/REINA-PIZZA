import type { OrderStatus, PaymentStatus, FeeStatus } from "./labels";

export type PayState =
  | "order_cancelled"
  | "paid"
  | "review"
  | "await_fee"          // frais à confirmer par le restaurant : aucun paiement possible
  | "needs_acceptance"   // total proposé, le client doit l'accepter
  | "expired"            // total expiré : à renouveler par le restaurant
  | "payable"
  | "pending";           // une session de paiement est ouverte (reprise possible)

export type PayabilityInput = {
  order_status: OrderStatus;
  payment_status: PaymentStatus;
  fee_status: FeeStatus;
  total_expires_at: Date | string | null;
};

/** État du paiement d'une commande, calculé de façon identique côté serveur et dans l'interface. */
export function payState(o: PayabilityInput, now = new Date()): PayState {
  if (o.payment_status === "paid" || o.payment_status === "confirmed_manually") return "paid";
  if (o.payment_status === "review") return "review";
  if (o.order_status === "cancelled") return "order_cancelled";
  if (o.fee_status === "to_confirm") return "await_fee";
  if (o.total_expires_at && new Date(o.total_expires_at) <= now) return "expired";
  if (o.fee_status === "proposed") return "needs_acceptance";
  if (o.payment_status === "pending") return "pending";
  return "payable";
}

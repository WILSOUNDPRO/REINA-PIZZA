export const ORDER_STATUSES = ["to_confirm", "confirmed", "preparing", "out_for_delivery", "delivered", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ["unpaid", "pending", "paid", "failed", "cancelled", "review"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type FeeStatus = "to_confirm" | "proposed" | "accepted";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  to_confirm: "À confirmer",
  confirmed: "Confirmée",
  preparing: "En préparation",
  out_for_delivery: "En livraison",
  delivered: "Livrée",
  cancelled: "Annulée",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: "Non payée",
  pending: "Paiement en attente",
  paid: "Payée",
  failed: "Paiement échoué",
  cancelled: "Paiement annulé",
  review: "Paiement à vérifier",
};

export const FEE_STATUS_LABELS: Record<FeeStatus, string> = {
  to_confirm: "Frais de livraison à confirmer",
  proposed: "Total proposé — en attente d'acceptation",
  accepted: "Total approuvé",
};

export const SIZE_HINT: Record<string, string> = { S: "Small", M: "Medium", L: "Large", XL: "Extra large", XXL: "Extra extra large" };

export const EVENT_LABELS: Record<string, string> = {
  created: "Commande créée",
  status: "Statut de la commande",
  delivery_fee: "Frais de livraison",
  fee_accepted: "Total accepté par le client",
  payment: "Paiement",
  note: "Note",
};

/** Transitions autorisées : on peut avancer ou annuler tant que la commande n'est pas terminée. */
export function allowedNextStatuses(current: OrderStatus): OrderStatus[] {
  if (current === "delivered" || current === "cancelled") return [];
  return ORDER_STATUSES.filter((s) => s !== current && s !== "to_confirm");
}

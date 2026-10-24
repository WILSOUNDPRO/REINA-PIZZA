export const ORDER_STATUSES = ["to_confirm", "confirmed", "preparing", "out_for_delivery", "delivered", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

// Statuts utilisables aujourd'hui (paiement hors site) ; les autres sont l'héritage de l'ancien paiement en ligne.
export const PAYMENT_STATUSES = ["to_arrange", "pending", "confirmed_manually", "unpaid", "paid", "failed", "cancelled", "review"] as const;
export const MANUAL_PAYMENT_STATUSES = ["to_arrange", "pending", "confirmed_manually"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type FeeStatus = "to_confirm" | "set" | "proposed" | "accepted";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  to_confirm: "À confirmer",
  confirmed: "Confirmée",
  preparing: "En préparation",
  out_for_delivery: "En livraison",
  delivered: "Livrée",
  cancelled: "Annulée",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  to_arrange: "À organiser avec la pizzeria",
  pending: "En attente",
  confirmed_manually: "Confirmé manuellement par la pizzeria",
  // Anciennes valeurs (paiement en ligne abandonné pour cette version) :
  unpaid: "À organiser avec la pizzeria",
  paid: "Payée (ancien paiement en ligne)",
  failed: "Paiement en ligne échoué (ancien)",
  cancelled: "Paiement en ligne annulé (ancien)",
  review: "Paiement en ligne à vérifier (ancien)",
};

export const FEE_STATUS_LABELS: Record<FeeStatus, string> = {
  to_confirm: "Frais de livraison à confirmer",
  set: "Frais de livraison fixés",
  proposed: "Total proposé (ancien parcours)",
  accepted: "Frais de livraison fixés",
};

export const SIZE_HINT: Record<string, string> = { S: "Small", M: "Medium", L: "Large", XL: "Extra large", XXL: "Extra extra large" };

export const EVENT_LABELS: Record<string, string> = {
  created: "Commande créée",
  status: "Statut de la commande",
  delivery_fee: "Frais de livraison",
  fee_accepted: "Total accepté par le client",
  payment: "Paiement",
  payment_method: "Moyen de paiement",
  note: "Note",
};

/** Transitions autorisées : on peut avancer ou annuler tant que la commande n'est pas terminée. */
export function allowedNextStatuses(current: OrderStatus): OrderStatus[] {
  if (current === "delivered" || current === "cancelled") return [];
  return ORDER_STATUSES.filter((s) => s !== current && s !== "to_confirm");
}

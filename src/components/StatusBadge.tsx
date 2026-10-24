import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, FEE_STATUS_LABELS, type FeeStatus, type OrderStatus, type PaymentStatus } from "@/lib/labels";

const orderTone: Record<OrderStatus, string> = {
  to_confirm: "bg-amber-100 text-amber-900",
  confirmed: "bg-sky-100 text-sky-900",
  preparing: "bg-orange-100 text-orange-900",
  out_for_delivery: "bg-indigo-100 text-indigo-900",
  delivered: "bg-green-100 text-green-900",
  cancelled: "bg-stone-200 text-stone-700",
};
const payTone: Record<PaymentStatus, string> = {
  unpaid: "bg-stone-200 text-stone-800",
  pending: "bg-amber-100 text-amber-900",
  paid: "bg-green-100 text-green-900",
  failed: "bg-red-100 text-red-900",
  cancelled: "bg-stone-200 text-stone-700",
  review: "bg-red-100 text-red-900",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`badge ${orderTone[status]}`}>Commande : {ORDER_STATUS_LABELS[status]}</span>;
}
export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <span className={`badge ${payTone[status]}`}>Paiement : {PAYMENT_STATUS_LABELS[status]}</span>;
}
export function FeeBadge({ status }: { status: FeeStatus }) {
  if (status === "accepted") return null;
  return <span className="badge bg-amber-200 text-amber-950">{FEE_STATUS_LABELS[status]}</span>;
}

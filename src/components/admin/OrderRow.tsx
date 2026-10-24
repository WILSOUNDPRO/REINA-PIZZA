import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import type { OrderRow } from "@/server/orders";
import { FeeBadge, OrderStatusBadge, PaymentStatusBadge } from "../StatusBadge";

export function OrderListItem({ o }: { o: OrderRow }) {
  return (
    <li>
      <Link href={`/admin/commandes/${o.id}`} className={`card block p-4 hover:border-ink ${o.acknowledged_at ? "" : "!border-tomato"}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-base font-extrabold">
            {o.ref} {!o.acknowledged_at && <span className="badge bg-tomato text-white">Nouvelle</span>} {o.has_demo_items && <span className="badge bg-cream-2 text-ink-soft">Démo</span>}
          </p>
          <p className="font-bold">{o.total_minor === null ? `${formatMoney(o.subtotal_minor, o.currency)} · frais à confirmer` : formatMoney(o.total_minor, o.currency)}</p>
        </div>
        <p className="text-sm text-ink-soft">{o.customer_name} · {o.commune}, {o.quarter} · {formatDateTime(o.created_at)}</p>
        <div className="mt-2 flex flex-wrap gap-2"><OrderStatusBadge status={o.order_status} /><PaymentStatusBadge status={o.payment_status} /><FeeBadge status={o.fee_status} /></div>
      </Link>
    </li>
  );
}

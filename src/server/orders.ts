import { randomBytes, randomInt } from "node:crypto";
import type { Sql, Tx } from "./db";
import { getSettings } from "./settings";
import { priceCart, type CartProblem } from "./pricing";
import { env } from "./env";
import { log } from "./logger";
import type { CheckoutInput } from "@/lib/validation";
import type { Currency } from "@/lib/constants";
import { allowedNextStatuses, MANUAL_PAYMENT_STATUSES, type FeeStatus, type OrderStatus, type PaymentStatus } from "@/lib/labels";

export type OrderRow = {
  id: string;
  ref: string;
  access_token: string;
  order_status: OrderStatus;
  payment_status: PaymentStatus;
  delivery_mode: "zone" | "quote";
  delivery_zone_name: string | null;
  fee_status: FeeStatus;
  total_expires_at: Date | null;
  currency: Currency;
  subtotal_minor: number;
  delivery_fee_minor: number | null;
  total_minor: number | null;
  total_version: number;
  customer_name: string;
  customer_phone: string;
  customer_whatsapp: string | null;
  customer_email: string | null;
  commune: string;
  quarter: string;
  address: string;
  landmark: string;
  gps_location: string | null;
  delivery_instructions: string | null;
  notes: string | null;
  payment_method: string | null;
  payment_method_note: string | null;
  payment_confirmed_by: string | null;
  has_demo_items: boolean;
  acknowledged_at: Date | null;
  paid_at: Date | null;
  created_at: Date;
};

export type OrderItemRow = {
  id: string;
  product_name: string;
  product_description: string;
  size: string;
  unit_price_minor: number;
  quantity: number;
  extras: { id: string; name: string; price_minor: number }[];
  line_total_minor: number;
  is_demo: boolean;
  image_url?: string | null;
  default_image?: string | null;
};

export type OrderEventRow = {
  id: string;
  kind: string;
  from_value: string | null;
  to_value: string | null;
  actor: string;
  meta: Record<string, unknown>;
  created_at: Date;
};

export type CreateOrderResult =
  | { ok: true; ref: string; token: string; existing: boolean }
  | { ok: false; code: "paused" | "currency_missing" | "payment_method_invalid" | "cart_problems" | "zone_invalid" | "price_changed" | "demo_blocked"; message: string; problems?: CartProblem[]; totalMinor?: number };

const REF_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const newRef = () => "RP-" + Array.from({ length: 6 }, () => REF_ALPHABET[randomInt(REF_ALPHABET.length)]).join("");
const newToken = () => randomBytes(32).toString("base64url");

export async function addEvent(
  tx: Sql | Tx,
  orderId: string,
  kind: string,
  actor: string,
  from: string | null,
  to: string | null,
  meta: Record<string, unknown> = {},
) {
  await tx`insert into order_events (order_id, kind, actor, from_value, to_value, meta)
    values (${orderId}, ${kind}, ${actor}, ${from}, ${to}, ${tx.json(meta as never)})`;
}

export async function createOrder(sql: Sql, input: CheckoutInput): Promise<CreateOrderResult> {
  const settings = await getSettings(sql);
  if (settings.orders_paused) {
    return { ok: false, code: "paused", message: settings.pause_message || "Les commandes sont temporairement suspendues. Merci de réessayer plus tard." };
  }
  if (!settings.currency) {
    return { ok: false, code: "currency_missing", message: "La devise du restaurant n'est pas encore configurée : les commandes sont indisponibles." };
  }

  // Doublon (double clic, rechargement, réseau instable) : on renvoie la commande déjà créée.
  const [dup] = await sql<{ ref: string; access_token: string }[]>`select ref, access_token from orders where idempotency_key = ${input.idempotencyKey}`;
  if (dup) return { ok: true, ref: dup.ref, token: dup.access_token, existing: true };

  const cart = await priceCart(sql, input.items);
  if (cart.problems.length > 0 || cart.lines.length === 0) {
    return { ok: false, code: "cart_problems", message: "Certains articles ne sont plus disponibles. Vérifiez votre panier.", problems: cart.problems };
  }
  if (cart.hasDemo && !env.allowDemoOrders()) {
    return { ok: false, code: "demo_blocked", message: "Le menu n'est pas encore le menu officiel : la commande est impossible pour le moment." };
  }

  let zone: { id: string; name: string; fee_minor: number; is_demo: boolean } | undefined;
  if (input.deliveryMode === "zone") {
    [zone] = await sql`select id, name, fee_minor, is_demo from delivery_zones where id = ${input.zoneId!} and active`;
    if (!zone) return { ok: false, code: "zone_invalid", message: "Cette zone de livraison n'est plus disponible. Choisissez-en une autre." };
    if (zone.is_demo && !env.allowDemoOrders()) {
      return { ok: false, code: "demo_blocked", message: "Cette zone est une zone de démonstration." };
    }
    const total = cart.subtotalMinor + zone.fee_minor;
    if (input.expectedTotalMinor !== undefined && input.expectedTotalMinor !== total) {
      return { ok: false, code: "price_changed", message: "Les prix ont changé depuis l'affichage de votre panier. Vérifiez le nouveau total.", totalMinor: total };
    }
  }

  const [method] = await sql<{ label: string }[]>`select label from payment_methods where id = ${input.paymentMethodId} and enabled`;
  if (!method) return { ok: false, code: "payment_method_invalid", message: "Ce moyen de paiement n'est plus proposé. Choisissez-en un autre." };

  const fee = zone ? zone.fee_minor : null;
  const total = fee === null ? null : cart.subtotalMinor + fee;
  const c = input.customer;
  const hasDemo = cart.hasDemo || Boolean(zone?.is_demo);

  for (let attempt = 0; attempt < 5; attempt++) {
    const ref = newRef();
    const token = newToken();
    try {
      const created = await sql.begin(async (tx) => {
        const [row] = await tx<{ id: string }[]>`
          insert into orders (ref, access_token, idempotency_key, delivery_mode, delivery_zone_id, delivery_zone_name,
            fee_status, currency, subtotal_minor, delivery_fee_minor, total_minor, payment_method, payment_method_note,
            customer_name, customer_phone, customer_whatsapp, customer_email, commune, quarter, address, landmark,
            gps_location, delivery_instructions, notes, has_demo_items)
          values (${ref}, ${token}, ${input.idempotencyKey}, ${input.deliveryMode}, ${zone?.id ?? null}, ${zone?.name ?? null},
            ${zone ? "set" : "to_confirm"},
            ${settings.currency!}, ${cart.subtotalMinor}, ${fee}, ${total}, ${method.label}, ${input.paymentMethodNote ?? null},
            ${c.fullName}, ${c.phone}, ${c.whatsapp ?? null}, ${c.email ?? null}, ${c.commune}, ${c.quarter}, ${c.address}, ${c.landmark},
            ${c.gps ?? null}, ${c.deliveryInstructions ?? null}, ${c.notes ?? null}, ${hasDemo})
          on conflict (idempotency_key) do nothing
          returning id`;
        if (!row) return null; // création concurrente avec la même clé
        let pos = 0;
        for (const l of cart.lines) {
          await tx`insert into order_items (order_id, position, product_id, product_name, product_description, size,
              unit_price_minor, quantity, extras, line_total_minor, is_demo)
            values (${row.id}, ${pos++}, ${l.productId}, ${l.productName}, ${l.productDescription}, ${l.size},
              ${l.unitPriceMinor}, ${l.quantity}, ${tx.json(l.extras as never)}, ${l.lineTotalMinor}, ${l.isDemo})`;
        }
        await addEvent(tx, row.id, "created", "customer", null, "to_confirm", { delivery_mode: input.deliveryMode });
        return { ref, token };
      });
      if (created) {
        log("order.created", { ref: created.ref, mode: input.deliveryMode });
        return { ok: true, ref: created.ref, token: created.token, existing: false };
      }
      const [again] = await sql<{ ref: string; access_token: string }[]>`select ref, access_token from orders where idempotency_key = ${input.idempotencyKey}`;
      return { ok: true, ref: again.ref, token: again.access_token, existing: true };
    } catch (e) {
      if ((e as { code?: string }).code === "23505" && attempt < 4) continue; // collision de référence : on retente
      throw e;
    }
  }
  throw new Error("Impossible de générer une référence unique");
}

export async function getOrderByToken(sql: Sql, token: string) {
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return null;
  const [order] = await sql<OrderRow[]>`select * from orders where access_token = ${token}`;
  if (!order) return null;
  // Les visuels viennent du catalogue courant ; noms, descriptions et prix restent ceux de l'achat.
  const items = await sql<OrderItemRow[]>`select i.*, p.image_url, p.default_image from order_items i left join products p on p.id = i.product_id
    where i.order_id = ${order.id} order by i.position`;
  return { order, items };
}

export async function getOrderById(sql: Sql, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [order] = await sql<OrderRow[]>`select * from orders where id = ${id}`;
  if (!order) return null;
  const items = await sql<OrderItemRow[]>`select * from order_items where order_id = ${order.id} order by position`;
  const events = await sql<OrderEventRow[]>`select * from order_events where order_id = ${order.id} order by id`;
  const payments = await sql<{ id: string; provider: string; status: string; amount_minor: number; currency: string; total_version: number; created_at: Date; paid_at: Date | null }[]>`
    select id, provider, status, amount_minor, currency, total_version, created_at, paid_at from payments where order_id = ${order.id} order by created_at`;
  return { order, items, events, payments };
}

export type ActionResult = { ok: true } | { ok: false; message: string };

/** Le client accepte le total détaillé (frais proposés par le restaurant). */
export async function acceptFee(sql: Sql, token: string): Promise<ActionResult> {
  return sql.begin(async (tx) => {
    const [o] = await tx<OrderRow[]>`select * from orders where access_token = ${token} for update`;
    if (!o) return { ok: false, message: "Commande introuvable." } as const;
    if (o.fee_status === "accepted") return { ok: true } as const; // idempotent
    if (o.fee_status !== "proposed") return { ok: false, message: "Les frais de livraison n'ont pas encore été confirmés." } as const;
    if (o.order_status === "cancelled") return { ok: false, message: "Cette commande est annulée." } as const;
    if (o.total_expires_at && o.total_expires_at <= new Date()) return { ok: false, message: "Ce total a expiré. Contactez Reina Pizza pour le renouveler." } as const;
    const s = await getSettings(tx as unknown as Sql);
    await tx`update orders set fee_status = 'accepted', total_expires_at = now() + make_interval(hours => ${s.proposal_ttl_hours}) where id = ${o.id}`;
    await addEvent(tx, o.id, "fee_accepted", "customer", null, String(o.total_minor), { total_version: o.total_version });
    return { ok: true } as const;
  });
}

/**
 * Admin : fixe ou modifie les frais de livraison (le total en découle).
 * `requireAcceptance` ne sert qu'à l'ancien parcours de paiement en ligne (désactivé) : le client devait alors accepter le total.
 */
export async function setDeliveryFee(sql: Sql, orderId: string, feeMinor: number, actor: string, opts: { requireAcceptance?: boolean } = {}): Promise<ActionResult> {
  if (!Number.isInteger(feeMinor) || feeMinor < 0 || feeMinor > 100_000_000) return { ok: false, message: "Montant invalide." };
  return sql.begin(async (tx) => {
    const [o] = await tx<OrderRow[]>`select * from orders where id = ${orderId} for update`;
    if (!o) return { ok: false, message: "Commande introuvable." } as const;
    if (["paid", "review", "confirmed_manually"].includes(o.payment_status)) return { ok: false, message: "Le paiement est déjà confirmé : le total ne peut plus être modifié." } as const;
    if (o.order_status === "cancelled" || o.order_status === "delivered") return { ok: false, message: "La commande est terminée." } as const;
    const s = await getSettings(tx as unknown as Sql);
    const total = o.subtotal_minor + feeMinor;
    // Toute session de paiement en ligne ouverte (ancien parcours) portait l'ancien total : elle est annulée.
    const openOnline = await tx`update payments set status = 'cancelled' where order_id = ${o.id} and status = 'pending' returning id`;
    await tx`update orders set delivery_fee_minor = ${feeMinor}, total_minor = ${total},
        fee_status = ${opts.requireAcceptance ? "proposed" : "set"},
        total_version = total_version + 1,
        total_expires_at = ${opts.requireAcceptance ? tx`now() + make_interval(hours => ${s.proposal_ttl_hours})` : null},
        payment_status = case when payment_status in ('failed', 'cancelled', 'unpaid') or (payment_status = 'pending' and ${openOnline.length > 0}) then 'to_arrange' else payment_status end
      where id = ${o.id}`;
    await addEvent(tx, o.id, "delivery_fee", actor, o.delivery_fee_minor === null ? null : String(o.delivery_fee_minor), String(feeMinor), {
      total_minor: total,
      total_version: o.total_version + 1,
    });
    log("order.fee_set", { ref: o.ref });
    return { ok: true } as const;
  });
}

/** Admin : statut de paiement géré à la main. Jamais déclenché automatiquement (WhatsApp, livraison ou déclaration du client). */
export async function setManualPaymentStatus(sql: Sql, orderId: string, to: string, actor: string): Promise<ActionResult> {
  if (!(MANUAL_PAYMENT_STATUSES as readonly string[]).includes(to)) return { ok: false, message: "Statut de paiement invalide." };
  return sql.begin(async (tx) => {
    const [o] = await tx<OrderRow[]>`select * from orders where id = ${orderId} for update`;
    if (!o) return { ok: false, message: "Commande introuvable." } as const;
    if (o.payment_status === to) return { ok: true } as const;
    if (o.payment_status === "paid" || o.payment_status === "review") {
      return { ok: false, message: "Cette commande vient de l'ancien paiement en ligne : son statut ne se modifie pas ici." } as const;
    }
    const confirming = to === "confirmed_manually";
    await tx`update orders set payment_status = ${to},
        paid_at = ${confirming ? tx`now()` : null}, payment_confirmed_by = ${confirming ? actor : null},
        acknowledged_at = coalesce(acknowledged_at, now())
      where id = ${o.id}`;
    await addEvent(tx, o.id, "payment", actor, o.payment_status, to, { manual: true, total_minor: o.total_minor });
    log("order.payment_status", { ref: o.ref, to });
    return { ok: true } as const;
  });
}

export async function setOrderStatus(sql: Sql, orderId: string, to: OrderStatus, actor: string): Promise<ActionResult> {
  return sql.begin(async (tx) => {
    const [o] = await tx<OrderRow[]>`select * from orders where id = ${orderId} for update`;
    if (!o) return { ok: false, message: "Commande introuvable." } as const;
    if (!allowedNextStatuses(o.order_status).includes(to)) return { ok: false, message: "Changement de statut non autorisé." } as const;
    await tx`update orders set order_status = ${to},
        payment_status = case when ${to} = 'cancelled' and exists (select 1 from payments where order_id = ${o.id} and status = 'pending') then 'cancelled' else payment_status end,
        acknowledged_at = coalesce(acknowledged_at, now())
      where id = ${o.id}`;
    if (to === "cancelled") await tx`update payments set status = 'cancelled' where order_id = ${o.id} and status = 'pending'`;
    // Une annulation n'entraîne jamais de remboursement automatique : on le consigne si la commande était payée.
    await addEvent(tx, o.id, "status", actor, o.order_status, to, to === "cancelled" && ["paid", "confirmed_manually"].includes(o.payment_status) ? { refund: "manual_action_required" } : {});
    return { ok: true } as const;
  });
}

export async function acknowledgeOrder(sql: Sql, orderId: string) {
  await sql`update orders set acknowledged_at = now() where id = ${orderId} and acknowledged_at is null`;
}

export type OrderFilters = {
  from?: string; // YYYY-MM-DD (heure de Port-au-Prince)
  to?: string;
  orderStatus?: string;
  paymentStatus?: string;
  feeToConfirm?: boolean;
  unacknowledged?: boolean;
  q?: string;
  page?: number;
};

const PAGE_SIZE = 25;
const isDay = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function listOrders(sql: Sql, f: OrderFilters) {
  const page = Math.max(1, f.page ?? 1);
  const q = f.q?.trim();
  const like = (v: string) => "%" + v.replace(/[%_\\]/g, "\\$&") + "%";
  const digits = (q ?? "").replace(/\D/g, "");
  const where = sql`true
    ${isDay(f.from) ? sql`and created_at >= (${f.from!}::date)::timestamp at time zone 'America/Port-au-Prince'` : sql``}
    ${isDay(f.to) ? sql`and created_at < ((${f.to!}::date) + 1)::timestamp at time zone 'America/Port-au-Prince'` : sql``}
    ${f.orderStatus ? sql`and order_status = ${f.orderStatus}` : sql``}
    ${f.paymentStatus ? sql`and payment_status = ${f.paymentStatus}` : sql``}
    ${f.unacknowledged ? sql`and acknowledged_at is null` : sql``}
    ${f.feeToConfirm ? sql`and fee_status = 'to_confirm' and order_status <> 'cancelled'` : sql``}
    ${q ? sql`and (ref ilike ${like(q)} or customer_name ilike ${like(q)} ${digits.length >= 3 ? sql`or customer_phone like ${"%" + digits + "%"}` : sql``})` : sql``}`;
  const rows = await sql<OrderRow[]>`select * from orders where ${where} order by created_at desc limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`;
  const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from orders where ${where}`;
  return { rows, total: count, page, pageSize: PAGE_SIZE };
}

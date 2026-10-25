import type { Sql } from "./db";
import { activeProvider } from "./payments/index";
import type { WebhookEvent } from "./payments/types";
import { addEvent, type ActionResult, type OrderRow } from "./orders";
import { getSettings } from "./settings";
import { payState } from "@/lib/orderState";
import { log } from "./logger";

type PaymentRow = {
  id: string;
  order_id: string;
  provider: string;
  provider_ref: string | null;
  amount_minor: number;
  currency: string;
  total_version: number;
  status: string;
  redirect_url: string | null;
  expires_at: Date;
};

const REFUSALS: Record<string, string> = {
  order_cancelled: "Cette commande est annulée.",
  paid: "Cette commande est déjà payée.",
  review: "Un paiement est en cours de vérification par Reina Pizza.",
  await_fee: "Les frais de livraison doivent d'abord être confirmés par Reina Pizza.",
  needs_acceptance: "Veuillez d'abord accepter le total détaillé.",
  expired: "Ce total a expiré. Contactez Reina Pizza pour le renouveler.",
};

export type StartPaymentResult = ActionResult | { ok: true; redirectUrl: string };

/**
 * Ouvre (ou reprend) une session de paiement hébergée. Un verrou consultatif par commande empêche deux sessions
 * concurrentes (double clic) ; une session déjà ouverte pour le même total est réutilisée.
 */
export async function startPayment(sql: Sql, token: string): Promise<StartPaymentResult> {
  const provider = activeProvider();
  if (!provider) return { ok: false, message: "Le paiement en ligne n'est pas encore disponible. Contactez Reina Pizza pour régler votre commande." };

  return sql.begin(async (tx) => {
    const [peek] = await tx<{ id: string }[]>`select id from orders where access_token = ${token}`;
    if (!peek) return { ok: false, message: "Commande introuvable." } as const;
    await tx`select pg_advisory_xact_lock(hashtextextended(${peek.id}, 0))`;
    const [o] = await tx<OrderRow[]>`select * from orders where id = ${peek.id} for update`;

    const state = payState(o);
    if (state !== "payable" && state !== "pending") return { ok: false, message: REFUSALS[state] } as const;
    if (o.total_minor === null) return { ok: false, message: REFUSALS.await_fee } as const;

    const settings = await getSettings(tx as unknown as Sql);
    if (settings.currency !== o.currency) {
      return { ok: false, message: "La devise du restaurant a changé depuis votre commande. Contactez Reina Pizza." } as const;
    }
    // Les produits de démonstration ne sont jamais payables avec un vrai prestataire.
    if (o.has_demo_items && provider.id !== "simulation") {
      return { ok: false, message: "Cette commande contient des produits de démonstration : le paiement réel est impossible." } as const;
    }

    // Disponibilité vérifiée juste avant le paiement.
    const unavailable = await tx<{ product_name: string; size: string }[]>`
      select oi.product_name, coalesce(oi.size, oi.option_label, '') as size from order_items oi
      left join products p on p.id = oi.product_id
      left join product_sizes s on s.product_id = oi.product_id and s.size = oi.size
      where oi.order_id = ${o.id} and (
        p.id is null or not p.available or (oi.size is not null and (s.size is null or not s.available))
        or exists (select 1 from categories c where c.id = p.category_id and not c.active)
        or exists (select 1 from jsonb_array_elements(oi.extras) e left join extras x on x.id = (e->>'id')::uuid
                   where x.id is null or not x.available))`;
    if (unavailable.length > 0) {
      const names = [...new Set(unavailable.map((u) => `${u.product_name} (${u.size})`))].join(", ");
      return { ok: false, message: `Article(s) indisponible(s) : ${names}. Contactez Reina Pizza avant de payer.` } as const;
    }

    // Session déjà ouverte pour le même total et le même prestataire : on la réutilise.
    const open = await tx<PaymentRow[]>`select * from payments where order_id = ${o.id} and status = 'pending' order by created_at desc`;
    const reusable = open.find((p) => p.provider === provider.id && p.total_version === o.total_version && p.expires_at > new Date() && p.redirect_url);
    if (reusable) return { ok: true, redirectUrl: reusable.redirect_url! } as const;
    for (const p of open) {
      await tx`update payments set status = ${p.expires_at <= new Date() ? "expired" : "cancelled"} where id = ${p.id}`;
    }

    const [pay] = await tx<PaymentRow[]>`
      insert into payments (order_id, provider, amount_minor, currency, total_version, expires_at)
      values (${o.id}, ${provider.id}, ${o.total_minor}, ${o.currency}, ${o.total_version}, now() + make_interval(mins => ${settings.payment_ttl_minutes}))
      returning *`;
    const checkout = await provider.createCheckout({
      paymentId: pay.id,
      orderRef: o.ref,
      amountMinor: o.total_minor,
      currency: o.currency,
      returnUrl: `/commande/${o.access_token}?paiement=retour`,
    });
    await tx`update payments set provider_ref = ${checkout.providerRef}, redirect_url = ${checkout.redirectUrl} where id = ${pay.id}`;
    await tx`update orders set payment_status = 'pending' where id = ${o.id}`;
    await addEvent(tx, o.id, "payment", "customer", o.payment_status, "pending", { provider: provider.id, amount_minor: o.total_minor });
    log("payment.started", { ref: o.ref, provider: provider.id });
    return { ok: true, redirectUrl: checkout.redirectUrl } as const;
  });
}

export type WebhookOutcome = "duplicate" | "unknown_payment" | "paid" | "already_paid" | "duplicate_payment" | "mismatch" | "failed" | "cancelled" | "ignored";

/**
 * Applique une notification déjà authentifiée (signature vérifiée par le prestataire).
 * Idempotent : un identifiant d'événement déjà traité est sans effet, et un seul paiement « paid » existe par commande.
 */
export async function applyWebhookEvent(sql: Sql, providerId: string, ev: WebhookEvent): Promise<WebhookOutcome> {
  return sql.begin(async (tx): Promise<WebhookOutcome> => {
    const inserted = await tx`insert into payment_events (provider, event_id) values (${providerId}, ${ev.eventId}) on conflict do nothing returning event_id`;
    if (inserted.length === 0) return "duplicate";

    const [peek] = await tx<{ order_id: string }[]>`select order_id from payments where provider = ${providerId} and provider_ref = ${ev.providerRef}`;
    if (!peek) {
      log("payment.unknown_ref", { provider: providerId });
      return "unknown_payment";
    }
    // Ordre de verrouillage constant : commande puis paiement (identique à startPayment).
    const [o] = await tx<OrderRow[]>`select * from orders where id = ${peek.order_id} for update`;
    const [p] = await tx<PaymentRow[]>`select * from payments where provider = ${providerId} and provider_ref = ${ev.providerRef} for update`;

    if (ev.status === "paid") {
      if (p.status === "paid") return "already_paid";
      if (o.payment_status === "paid") {
        await tx`update payments set status = 'duplicate' where id = ${p.id}`;
        await addEvent(tx, o.id, "payment", providerId, null, "duplicate", { payment_id: p.id, action: "remboursement manuel à étudier" });
        log("payment.duplicate", { ref: o.ref });
        return "duplicate_payment";
      }
      const consistent =
        ev.amountMinor === p.amount_minor && ev.currency === p.currency && p.total_version === o.total_version && o.total_minor === p.amount_minor;
      if (!consistent) {
        await tx`update payments set status = 'mismatch' where id = ${p.id}`;
        await tx`update orders set payment_status = 'review' where id = ${o.id}`;
        await addEvent(tx, o.id, "payment", providerId, o.payment_status, "review", {
          payment_id: p.id,
          reason: "montant, devise ou version du total différents",
          received_minor: ev.amountMinor,
          expected_minor: o.total_minor,
        });
        log("payment.mismatch", { ref: o.ref });
        return "mismatch";
      }
      await tx`update payments set status = 'paid', paid_at = now() where id = ${p.id}`;
      await tx`update orders set payment_status = 'paid', paid_at = now() where id = ${o.id}`;
      await addEvent(tx, o.id, "payment", providerId, o.payment_status, "paid", { payment_id: p.id, amount_minor: p.amount_minor });
      log("payment.paid", { ref: o.ref });
      return "paid";
    }

    // failed | cancelled : n'a jamais d'effet sur un paiement déjà confirmé.
    if (p.status === "paid" || o.payment_status === "paid") return "ignored";
    if (p.status === "pending" || p.status === "expired") {
      await tx`update payments set status = ${ev.status} where id = ${p.id}`;
      const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from payments where order_id = ${o.id} and status = 'pending'`;
      if (o.payment_status === "pending" && n === 0) {
        await tx`update orders set payment_status = ${ev.status} where id = ${o.id}`;
        await addEvent(tx, o.id, "payment", providerId, "pending", ev.status, { payment_id: p.id });
      }
      return ev.status;
    }
    return "ignored";
  });
}

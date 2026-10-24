import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { IDS, checkout, newKey, resetDb, sql } from "./helpers";
import { acceptFee, createOrder, getOrderByToken, setDeliveryFee, setOrderStatus } from "@/server/orders";
import { applyWebhookEvent, startPayment } from "@/server/payments";
import { simulationProvider, signSimulationPayload, SIMULATION_SIGNATURE_HEADER } from "@/server/payments/simulation";
import { InvalidWebhookError } from "@/server/payments/types";
import { payState } from "@/lib/orderState";

beforeAll(() => {
  process.env.PAYMENT_PROVIDER = "simulation";
  process.env.SIMULATION_WEBHOOK_SECRET = "test-secret";
});
beforeEach(() => resetDb());

async function place(over: Record<string, unknown> = {}) {
  const r = await createOrder(sql, checkout(over));
  if (!r.ok) throw new Error(r.message);
  const got = (await getOrderByToken(sql, r.token))!;
  return { ...r, order: got.order, items: got.items };
}
async function pay(token: string) {
  const r = await startPayment(sql, token);
  if (!r.ok) throw new Error(r.message);
  const [p] = await sql`select * from payments where redirect_url = ${(r as { redirectUrl: string }).redirectUrl}`;
  return p;
}
let n = 0;
const hook = (providerRef: string, status: "paid" | "failed" | "cancelled", amountMinor: number, eventId = `evt_${++n}_${Date.now()}`) =>
  applyWebhookEvent(sql, "simulation", { eventId, providerRef, status, amountMinor, currency: "HTG" });
const orderRow = async (id: string) => (await sql`select * from orders where id = ${id}`)[0];

describe("commande avec zone tarifée", () => {
  it("calcule le total côté serveur et fige les prix", async () => {
    const { order, items } = await place();
    // 2 × (1 500,00 + 200,00) = 3 400,00 ; livraison 250,00
    expect(order.subtotal_minor).toBe(340000);
    expect(order.delivery_fee_minor).toBe(25000);
    expect(order.total_minor).toBe(365000);
    expect(order.fee_status).toBe("accepted");
    expect(payState(order)).toBe("payable");
    expect(items[0]).toMatchObject({ product_name: "Pizza A", unit_price_minor: 170000, quantity: 2 });

    // Modifier le menu ne change pas l'ancienne commande.
    await sql`update product_sizes set price_minor = 999999 where product_id = ${IDS.pizzaA}`;
    await sql`update products set name = 'Renommée', description = 'Autre' where id = ${IDS.pizzaA}`;
    const again = (await getOrderByToken(sql, order.access_token))!;
    expect(again.items[0].unit_price_minor).toBe(170000);
    expect(again.items[0].product_name).toBe("Pizza A");
    expect(again.order.total_minor).toBe(365000);
  });

  it("refuse un article indisponible, une taille absente, une zone inactive, des prix changés, les commandes suspendues", async () => {
    await sql`update products set available = false where id = ${IDS.pizzaB}`;
    const bad = await createOrder(sql, checkout({ items: [{ productId: IDS.pizzaB, size: "XL", quantity: 1 }] }));
    expect(bad).toMatchObject({ ok: false, code: "cart_problems" });
    const noSize = await createOrder(sql, checkout({ items: [{ productId: IDS.pizzaA, size: "XXL", quantity: 1 }] }));
    expect(noSize).toMatchObject({ ok: false, code: "cart_problems" });

    await sql`update delivery_zones set active = false`;
    expect(await createOrder(sql, checkout())).toMatchObject({ ok: false, code: "zone_invalid" });
    await sql`update delivery_zones set active = true`;

    expect(await createOrder(sql, checkout({ expectedTotalMinor: 1 }))).toMatchObject({ ok: false, code: "price_changed", totalMinor: 365000 });

    await sql`update settings set orders_paused = true`;
    expect(await createOrder(sql, checkout())).toMatchObject({ ok: false, code: "paused" });
    await sql`update settings set orders_paused = false, currency = null`;
    expect(await createOrder(sql, checkout())).toMatchObject({ ok: false, code: "currency_missing" });
  });

  it("n'accepte pas de produits de démonstration quand ALLOW_DEMO_ORDERS=false", async () => {
    await resetDb({ demo: true });
    process.env.ALLOW_DEMO_ORDERS = "false";
    try {
      expect(await createOrder(sql, checkout())).toMatchObject({ ok: false, code: "demo_blocked" });
    } finally {
      delete process.env.ALLOW_DEMO_ORDERS;
    }
  });
});

describe("double soumission", () => {
  it("deux envois simultanés avec la même clé créent une seule commande", async () => {
    const input = checkout();
    const results = await Promise.all(Array.from({ length: 6 }, () => createOrder(sql, input)));
    expect(results.every((r) => r.ok)).toBe(true);
    const refs = new Set(results.map((r) => (r.ok ? r.ref : "")));
    expect(refs.size).toBe(1);
    expect(results.filter((r) => r.ok && !r.existing).length).toBe(1);
    const [{ count }] = await sql`select count(*)::int as count from orders`;
    expect(count).toBe(1);
    const [{ items }] = await sql`select count(*)::int as items from order_items`;
    expect(items).toBe(1);
  });
});

describe("frais à confirmer, puis paiement du total approuvé", () => {
  it("parcours complet", async () => {
    const { order } = await place({ deliveryMode: "quote", zoneId: undefined });
    expect(order.fee_status).toBe("to_confirm");
    expect(order.total_minor).toBeNull();
    expect(payState(order)).toBe("await_fee");

    // Aucun encaissement d'un total incomplet.
    expect(await startPayment(sql, order.access_token)).toMatchObject({ ok: false });
    expect((await sql`select count(*)::int as n from payments`)[0].n).toBe(0);

    // L'admin fixe les frais.
    expect(await setDeliveryFee(sql, order.id, 40000, "admin@test")).toEqual({ ok: true });
    let o = await orderRow(order.id);
    expect(o.total_minor).toBe(380000);
    expect(o.fee_status).toBe("proposed");
    expect(await startPayment(sql, order.access_token)).toMatchObject({ ok: false }); // pas encore accepté

    // Le client accepte, puis paie.
    expect(await acceptFee(sql, order.access_token)).toEqual({ ok: true });
    expect(await acceptFee(sql, order.access_token)).toEqual({ ok: true }); // idempotent
    const p = await pay(order.access_token);
    expect(p.amount_minor).toBe(380000);
    expect(await hook(p.provider_ref, "paid", 380000)).toBe("paid");
    o = await orderRow(order.id);
    expect(o.payment_status).toBe("paid");
    expect(o.paid_at).not.toBeNull();

    const kinds = (await sql`select kind from order_events where order_id = ${order.id} order by id`).map((r) => r.kind);
    expect(kinds).toEqual(["created", "delivery_fee", "fee_accepted", "payment", "payment"]);
  });

  it("modification du total : l'ancienne session est annulée et un paiement tardif sur l'ancien total est mis en révision", async () => {
    const { order } = await place();
    const p = await pay(order.access_token);
    expect(await setDeliveryFee(sql, order.id, 50000, "admin@test")).toEqual({ ok: true });
    expect((await sql`select status from payments where id = ${p.id}`)[0].status).toBe("cancelled");
    expect((await orderRow(order.id)).payment_status).toBe("unpaid");

    // Le prestataire notifie tout de même un paiement de l'ancien montant : jamais marqué « payée ».
    expect(await hook(p.provider_ref, "paid", p.amount_minor)).toBe("mismatch");
    const o = await orderRow(order.id);
    expect(o.payment_status).toBe("review");
    expect(await startPayment(sql, order.access_token)).toMatchObject({ ok: false });
    expect(await setDeliveryFee(sql, order.id, 1, "admin@test")).toMatchObject({ ok: false });
  });

  it("un total expiré ne peut pas être payé, et est renouvelable", async () => {
    const { order } = await place();
    await sql`update orders set total_expires_at = now() - interval '1 minute' where id = ${order.id}`;
    expect(payState(await orderRow(order.id) as never)).toBe("expired");
    expect(await startPayment(sql, order.access_token)).toMatchObject({ ok: false, message: expect.stringContaining("expiré") });
    await setDeliveryFee(sql, order.id, 25000, "admin@test");
    await acceptFee(sql, order.access_token);
    expect(await startPayment(sql, order.access_token)).toMatchObject({ ok: true });
  });
});

describe("paiement : réussi, échoué, annulé, notifications répétées", () => {
  it("réussi + notification répétée = un seul encaissement", async () => {
    const { order } = await place();
    const p = await pay(order.access_token);
    const evt = "evt_same";
    expect(await hook(p.provider_ref, "paid", 365000, evt)).toBe("paid");
    expect(await hook(p.provider_ref, "paid", 365000, evt)).toBe("duplicate");
    // Même paiement, autre identifiant d'événement
    expect(await hook(p.provider_ref, "paid", 365000)).toBe("already_paid");
    const [{ n }] = await sql`select count(*)::int as n from order_events where order_id = ${order.id} and to_value = 'paid'`;
    expect(n).toBe(1);
    expect((await sql`select count(*)::int as n from payments where status = 'paid'`)[0].n).toBe(1);
  });

  it("webhooks concurrents identiques : un seul traitement", async () => {
    const { order } = await place();
    const p = await pay(order.access_token);
    const res = await Promise.all(Array.from({ length: 5 }, () => hook(p.provider_ref, "paid", 365000, "evt_race")));
    expect(res.filter((r) => r === "paid").length).toBe(1);
    expect(res.filter((r) => r === "duplicate").length).toBe(4);
  });

  it("échoué puis nouvel essai réussi ; un échec tardif n'annule jamais un paiement confirmé", async () => {
    const { order } = await place();
    const p1 = await pay(order.access_token);
    expect(await hook(p1.provider_ref, "failed", 365000)).toBe("failed");
    expect((await orderRow(order.id)).payment_status).toBe("failed");

    const p2 = await pay(order.access_token);
    expect(p2.id).not.toBe(p1.id);
    expect(await hook(p2.provider_ref, "paid", 365000)).toBe("paid");
    expect(await hook(p1.provider_ref, "failed", 365000)).toBe("ignored");
    expect(await hook(p2.provider_ref, "cancelled", 365000)).toBe("ignored");
    expect((await orderRow(order.id)).payment_status).toBe("paid");
  });

  it("annulé", async () => {
    const { order } = await place();
    const p = await pay(order.access_token);
    expect(await hook(p.provider_ref, "cancelled", 365000)).toBe("cancelled");
    expect((await orderRow(order.id)).payment_status).toBe("cancelled");
  });

  it("montant ou devise différents : jamais payé, mis en révision", async () => {
    const { order } = await place();
    const p = await pay(order.access_token);
    expect(await hook(p.provider_ref, "paid", 100)).toBe("mismatch");
    expect((await orderRow(order.id)).payment_status).toBe("review");
    expect((await orderRow(order.id)).paid_at).toBeNull();
  });

  it("un second paiement sur une commande déjà payée est signalé, pas encaissé deux fois", async () => {
    const { order } = await place();
    const p1 = await pay(order.access_token);
    // 2e session ouverte avant le règlement de la 1re (ex. deux onglets) : on la force.
    const [p2] = await sql`insert into payments (order_id, provider, provider_ref, amount_minor, currency, total_version, expires_at)
      values (${order.id}, 'simulation', 'sim_second', 365000, 'HTG', 1, now() + interval '10 minutes') returning *`;
    expect(await hook(p1.provider_ref, "paid", 365000)).toBe("paid");
    expect(await hook(p2.provider_ref, "paid", 365000)).toBe("duplicate_payment");
    expect((await sql`select status from payments where id = ${p2.id}`)[0].status).toBe("duplicate");
    expect((await sql`select count(*)::int as n from payments where status = 'paid'`)[0].n).toBe(1);
  });

  it("démarrer deux fois le paiement réutilise la même session (double clic)", async () => {
    const { order } = await place();
    const rs = await Promise.all([startPayment(sql, order.access_token), startPayment(sql, order.access_token), startPayment(sql, order.access_token)]);
    expect(rs.every((r) => r.ok)).toBe(true);
    expect(new Set(rs.map((r) => (r as { redirectUrl: string }).redirectUrl)).size).toBe(1);
    expect((await sql`select count(*)::int as n from payments`)[0].n).toBe(1);
  });

  it("événement pour une session inconnue : ignoré sans effet", async () => {
    await place();
    expect(await hook("sim_inexistant", "paid", 1)).toBe("unknown_payment");
  });
});

describe("garde-fous avant paiement", () => {
  it("article devenu indisponible : paiement refusé", async () => {
    const { order } = await place();
    await sql`update products set available = false where id = ${IDS.pizzaA}`;
    expect(await startPayment(sql, order.access_token)).toMatchObject({ ok: false, message: expect.stringContaining("indisponible") });
    await sql`update products set available = true where id = ${IDS.pizzaA}`;
    await sql`update extras set available = false`;
    expect(await startPayment(sql, order.access_token)).toMatchObject({ ok: false });
  });

  it("prestataire non configuré : paiement désactivé", async () => {
    const { order } = await place();
    process.env.PAYMENT_PROVIDER = "none";
    try {
      expect(await startPayment(sql, order.access_token)).toMatchObject({ ok: false, message: expect.stringContaining("pas encore disponible") });
    } finally {
      process.env.PAYMENT_PROVIDER = "simulation";
    }
  });

  it("simulation inactive en production", async () => {
    const prev = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = "production";
    try {
      expect(simulationProvider.isConfigured()).toBe(false);
      expect(() => simulationProvider.verifyWebhook("{}", new Headers())).toThrow(InvalidWebhookError);
    } finally {
      (process.env as Record<string, string>).NODE_ENV = prev!;
    }
  });

  it("webhook : signature absente ou fausse refusée, correcte acceptée", () => {
    const body = JSON.stringify({ eventId: "e1", providerRef: "r", status: "paid", amountMinor: 1, currency: "HTG" });
    expect(() => simulationProvider.verifyWebhook(body, new Headers())).toThrow(InvalidWebhookError);
    expect(() => simulationProvider.verifyWebhook(body, new Headers({ [SIMULATION_SIGNATURE_HEADER]: "00".repeat(32) }))).toThrow(InvalidWebhookError);
    const ok = simulationProvider.verifyWebhook(body, new Headers({ [SIMULATION_SIGNATURE_HEADER]: signSimulationPayload(body) }));
    expect(ok.status).toBe("paid");
    const tampered = body.replace('"amountMinor":1', '"amountMinor":0');
    expect(() => simulationProvider.verifyWebhook(tampered, new Headers({ [SIMULATION_SIGNATURE_HEADER]: signSimulationPayload(body) }))).toThrow(InvalidWebhookError);
  });
});

describe("statuts et accès", () => {
  it("annuler une commande payée ne la présente pas comme remboursée", async () => {
    const { order } = await place();
    const p = await pay(order.access_token);
    await hook(p.provider_ref, "paid", 365000);
    expect(await setOrderStatus(sql, order.id, "cancelled", "admin@test")).toEqual({ ok: true });
    const o = await orderRow(order.id);
    expect(o.order_status).toBe("cancelled");
    expect(o.payment_status).toBe("paid");
    const [e] = await sql`select meta from order_events where kind = 'status' and order_id = ${order.id}`;
    expect(e.meta).toMatchObject({ refund: "manual_action_required" });
    expect(await setOrderStatus(sql, order.id, "confirmed", "admin@test")).toMatchObject({ ok: false });
  });

  it("jeton imprévisible : référence seule ou jeton mal formé ne donnent rien", async () => {
    const { ref, token } = await place();
    expect(await getOrderByToken(sql, ref)).toBeNull();
    expect(await getOrderByToken(sql, "x".repeat(43))).toBeNull();
    expect(await getOrderByToken(sql, "' or 1=1 --")).toBeNull();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(ref).toMatch(/^RP-[A-Z2-9]{6}$/);
  });

  it("annulation d'une commande avec paiement en attente", async () => {
    const { order } = await place();
    await pay(order.access_token);
    await setOrderStatus(sql, order.id, "cancelled", "admin@test");
    const o = await orderRow(order.id);
    expect(o.payment_status).toBe("cancelled");
    expect((await sql`select count(*)::int as n from payments where status = 'pending'`)[0].n).toBe(0);
  });
});

describe("RLS", () => {
  it("anon et authenticated n'ont aucun accès (rôles Supabase simulés)", async () => {
    await sql`do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    end $$`;
    await place();
    for (const role of ["anon", "authenticated"]) {
      await sql`grant usage on schema public to ${sql(role)}`;
      await sql`grant select on orders, order_items, payments, settings to ${sql(role)}`; // pire cas : droits SQL accordés
      let denied = 0;
      for (const t of ["orders", "order_items", "payments", "settings"]) {
        const rows = await sql.begin(async (tx) => {
          await tx.unsafe(`set local role ${role}`);
          return tx.unsafe(`select * from ${t}`);
        });
        if (rows.length === 0) denied++;
      }
      expect(denied, role).toBe(4); // la RLS sans politique renvoie 0 ligne même si le droit SQL existe
    }
  });
});

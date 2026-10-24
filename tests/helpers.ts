import postgres from "postgres";
import { randomBytes } from "node:crypto";
import type { CheckoutInput } from "@/lib/validation";
import { checkoutSchema } from "@/lib/validation";
import { getSql } from "@/server/db";

export const sql = getSql();

export let METHOD_ID = "";

export const IDS = {
  cat: "11111111-1111-1111-1111-111111111111",
  pizzaA: "22222222-2222-2222-2222-222222222221",
  pizzaB: "22222222-2222-2222-2222-222222222222",
  extra: "33333333-3333-3333-3333-333333333331",
  zone: "44444444-4444-4444-4444-444444444441",
};

/** Base de test vierge avec un catalogue et une zone de TEST (pas de vraies données). */
export async function resetDb(opts: { demo?: boolean } = {}) {
  await sql`truncate orders, payments, payment_events, rate_limits, order_events, order_items, products, product_sizes, categories, extras, delivery_zones restart identity cascade`;
  await sql`delete from payment_methods`;
  const [m] = await sql`insert into payment_methods (label) values ('À convenir avec la pizzeria') returning id`;
  METHOD_ID = m.id;
  await sql`update settings set currency = 'HTG', orders_paused = false, pause_message = null, proposal_ttl_hours = 24, payment_ttl_minutes = 30`;
  const demo = opts.demo ?? false;
  await sql`insert into categories (id, name) values (${IDS.cat}, 'Test')`;
  await sql`insert into products (id, category_id, name, description, is_demo) values
    (${IDS.pizzaA}, ${IDS.cat}, 'Pizza A', 'Desc A', ${demo}), (${IDS.pizzaB}, ${IDS.cat}, 'Pizza B', 'Desc B', ${demo})`;
  await sql`insert into product_sizes (product_id, size, price_minor) values
    (${IDS.pizzaA}, 'S', 100000), (${IDS.pizzaA}, 'M', 150000), (${IDS.pizzaB}, 'XL', 280000)`;
  await sql`insert into extras (id, name, price_minor) values (${IDS.extra}, 'Extra', 20000)`;
  await sql`insert into delivery_zones (id, name, fee_minor) values (${IDS.zone}, 'Zone test', 25000)`;
}

export const newKey = () => randomBytes(18).toString("base64url");

export function checkout(over: Partial<Record<string, unknown>> = {}): CheckoutInput {
  return checkoutSchema.parse({
    items: [{ productId: IDS.pizzaA, size: "M", quantity: 2, extraIds: [IDS.extra] }],
    deliveryMode: "zone",
    zoneId: IDS.zone,
    idempotencyKey: newKey(),
    paymentMethodId: METHOD_ID,
    customer: {
      fullName: "Jean Test",
      phone: "4646-1212",
      commune: "Delmas",
      quarter: "Delmas 33",
      address: "Rue Test, impasse Test, n° 5",
      landmark: "Près de l'église",
    },
    ...over,
  });
}

export type { postgres };

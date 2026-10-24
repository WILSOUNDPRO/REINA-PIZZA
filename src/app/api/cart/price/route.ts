import { NextResponse } from "next/server";
import { getSql } from "@/server/db";
import { priceCart } from "@/server/pricing";
import { cartSchema } from "@/lib/validation";
import { allow, clientKey } from "@/server/ratelimit";

// Prix et disponibilité du panier, toujours calculés côté serveur. N'accepte aucun prix du client.
export async function POST(req: Request) {
  const sql = getSql();
  if (!(await allow(sql, `cart:${await clientKey()}`, 120, 300))) return NextResponse.json({ error: "Trop de requêtes." }, { status: 429 });
  const parsed = cartSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Panier invalide." }, { status: 400 });

  const cart = await priceCart(sql, parsed.data.items);
  const ids = [...new Set(parsed.data.items.map((i) => i.productId))];
  const sizes = await sql<{ product_id: string; size: string; price_minor: number }[]>`
    select product_id, size, price_minor from product_sizes where product_id in ${sql(ids)} and available`;
  const names = await sql<{ id: string; name: string }[]>`select id, name from products where id in ${sql(ids)}`;
  return NextResponse.json({
    lines: cart.lines.map((l) => ({
      ...l,
      availableSizes: sizes.filter((s) => s.product_id === l.productId).map((s) => ({ size: s.size, priceMinor: s.price_minor })),
    })),
    subtotalMinor: cart.subtotalMinor,
    problems: cart.problems.map((p) => ({ ...p, productName: names.find((n) => n.id === p.productId)?.name ?? "Article" })),
  });
}

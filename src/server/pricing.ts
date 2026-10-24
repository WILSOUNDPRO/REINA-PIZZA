import type { Sql, Tx } from "./db";
import type { CartItemInput } from "@/lib/validation";
import type { Size } from "@/lib/constants";

export type PricedLine = {
  key: string;
  productId: string;
  productName: string;
  productDescription: string;
  imageUrl: string | null;
  defaultImage: string | null;
  size: Size;
  quantity: number;
  unitPriceMinor: number; // prix de la taille + suppléments
  extras: { id: string; name: string; price_minor: number }[];
  lineTotalMinor: number;
  isDemo: boolean;
};
export type CartProblem = { key: string; productId: string; size: Size; reason: "unavailable" | "size_unavailable" | "extra_unavailable" };
export type PricedCart = { lines: PricedLine[]; subtotalMinor: number; problems: CartProblem[]; hasDemo: boolean };

const lineKey = (i: CartItemInput) => `${i.productId}:${i.size}:${[...i.extraIds].sort().join(",")}`;

/**
 * Prix et disponibilité faisant foi : toujours recalculés depuis la base.
 * Les lignes identiques (même produit, taille, suppléments) sont fusionnées.
 */
export async function priceCart(sql: Sql | Tx, items: CartItemInput[]): Promise<PricedCart> {
  const merged = new Map<string, CartItemInput>();
  for (const it of items) {
    const key = lineKey(it);
    const prev = merged.get(key);
    merged.set(key, prev ? { ...prev, quantity: Math.min(prev.quantity + it.quantity, 50) } : { ...it, extraIds: [...new Set(it.extraIds)] });
  }
  const productIds = [...new Set([...merged.values()].map((i) => i.productId))];
  const extraIds = [...new Set([...merged.values()].flatMap((i) => i.extraIds))];

  const products = await sql<{ id: string; name: string; description: string; image_url: string | null; default_image: string | null; is_demo: boolean; available: boolean; archived_at: Date | null; cat_active: boolean | null }[]>`
    select p.id, p.name, p.description, p.image_url, p.default_image, p.is_demo, p.available, p.archived_at, c.active as cat_active
    from products p left join categories c on c.id = p.category_id where p.id in ${sql(productIds)}`;
  const sizes = await sql<{ product_id: string; size: Size; price_minor: number; available: boolean }[]>`
    select product_id, size, price_minor, available from product_sizes where product_id in ${sql(productIds)}`;
  const extras = extraIds.length
    ? await sql<{ id: string; name: string; price_minor: number; available: boolean; is_demo: boolean }[]>`
        select id, name, price_minor, available, is_demo from extras where id in ${sql(extraIds)}`
    : [];

  const lines: PricedLine[] = [];
  const problems: CartProblem[] = [];
  for (const [key, it] of merged) {
    const p = products.find((x) => x.id === it.productId);
    const s = sizes.find((x) => x.product_id === it.productId && x.size === it.size);
    if (!p || !p.available || p.archived_at || p.cat_active === false) {
      problems.push({ key, productId: it.productId, size: it.size, reason: "unavailable" });
      continue;
    }
    if (!s || !s.available || s.price_minor <= 0) { // une taille sans prix n'est ni gratuite ni commandable
      problems.push({ key, productId: it.productId, size: it.size, reason: "size_unavailable" });
      continue;
    }
    const chosen = it.extraIds.map((id) => extras.find((e) => e.id === id));
    if (chosen.some((e) => !e || !e.available)) {
      problems.push({ key, productId: it.productId, size: it.size, reason: "extra_unavailable" });
      continue;
    }
    const ex = chosen.map((e) => ({ id: e!.id, name: e!.name, price_minor: e!.price_minor }));
    const unit = s.price_minor + ex.reduce((a, e) => a + e.price_minor, 0);
    lines.push({
      key,
      productId: p.id,
      productName: p.name,
      productDescription: p.description,
      imageUrl: p.image_url,
      defaultImage: p.default_image,
      size: it.size,
      quantity: it.quantity,
      unitPriceMinor: unit,
      extras: ex,
      lineTotalMinor: unit * it.quantity,
      isDemo: p.is_demo || chosen.some((e) => e!.is_demo),
    });
  }
  return {
    lines,
    subtotalMinor: lines.reduce((a, l) => a + l.lineTotalMinor, 0),
    problems,
    hasDemo: lines.some((l) => l.isDemo),
  };
}

import type { Sql, Tx } from "./db";
import type { CartItemInput } from "@/lib/validation";
import type { Size } from "@/lib/constants";
import { isOtherConfigured, unitLabel, variantOptionLabel, variantRequired, type SaleUnit } from "@/lib/productSale";

export type PricedLine = {
  key: string;
  productId: string;
  productName: string;
  productDescription: string;
  imageUrl: string | null;
  defaultImage: string | null;
  size: Size | null;            // pizzas uniquement
  variantId: string | null;     // autres produits, facultatif
  optionLabel: string | null;   // autres produits : unité / variante (instantané)
  quantity: number;
  unitPriceMinor: number;       // prix de la taille ou du produit (ou de la variante) + suppléments
  extras: { id: string; name: string; price_minor: number }[];
  lineTotalMinor: number;
  isDemo: boolean;
};
export type CartProblem = {
  key: string;
  productId: string;
  size: Size | null;
  reason: "unavailable" | "size_unavailable" | "extra_unavailable" | "not_configured" | "variant_unavailable" | "variant_required";
};
export type PricedCart = { lines: PricedLine[]; subtotalMinor: number; problems: CartProblem[]; hasDemo: boolean };

const lineKey = (i: CartItemInput) => `${i.productId}:${i.size ?? ""}:${i.variantId ?? ""}:${[...i.extraIds].sort().join(",")}`;

type ProductRow = {
  id: string; name: string; description: string; image_url: string | null; default_image: string | null; is_demo: boolean;
  available: boolean; visible: boolean; archived_at: Date | null; cat_active: boolean | null;
  product_type: "pizza" | "other"; sale_unit: SaleUnit | null; base_price_minor: number | null; pieces_per_portion: number | null;
};

/**
 * Prix et disponibilité faisant foi : toujours recalculés depuis la base.
 * Un produit non configuré (sans prix ou sans unité de vente) n'est jamais commandable, même si le client force la requête.
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

  const products = await sql<ProductRow[]>`
    select p.id, p.name, p.description, p.image_url, p.default_image, p.is_demo, p.available, p.visible, p.archived_at, c.active as cat_active,
      p.product_type, p.sale_unit, p.base_price_minor, p.pieces_per_portion
    from products p left join categories c on c.id = p.category_id where p.id in ${sql(productIds)}`;
  const sizes = await sql<{ product_id: string; size: Size; price_minor: number; available: boolean }[]>`
    select product_id, size, price_minor, available from product_sizes where product_id in ${sql(productIds)}`;
  const variants = await sql<{ id: string; product_id: string; label: string; price_minor: number; available: boolean; pieces: number | null }[]>`
    select id, product_id, label, price_minor, available, pieces from product_variants where product_id in ${sql(productIds)}`;
  const extras = extraIds.length
    ? await sql<{ id: string; name: string; price_minor: number; available: boolean; is_demo: boolean }[]>`
        select id, name, price_minor, available, is_demo from extras where id in ${sql(extraIds)}`
    : [];

  const lines: PricedLine[] = [];
  const problems: CartProblem[] = [];
  for (const [key, it] of merged) {
    const prob = (reason: CartProblem["reason"]) => problems.push({ key, productId: it.productId, size: it.size ?? null, reason });
    const p0 = products.find((x) => x.id === it.productId);
    const pv = variants.filter((v) => v.product_id === it.productId);
    const p = p0 && { ...p0, variants: pv };
    if (p && p.product_type === "other" && !isOtherConfigured(p) && p.visible && !p.archived_at) { prob("not_configured"); continue; } // « Bientôt disponible »
    if (!p || !p.available || !p.visible || p.archived_at || p.cat_active === false) { prob("unavailable"); continue; }

    let unit: number;
    let size: Size | null = null;
    let variantId: string | null = null;
    let optionLabel: string | null = null;

    if (p.product_type === "pizza") {
      const s = sizes.find((x) => x.product_id === p.id && x.size === it.size);
      if (it.variantId || !it.size || !s || !s.available || s.price_minor <= 0) { prob("size_unavailable"); continue; } // une taille sans prix n'est ni gratuite ni commandable
      unit = s.price_minor;
      size = it.size;
    } else {
      if (it.size || it.extraIds.length > 0) { prob(it.size ? "size_unavailable" : "extra_unavailable"); continue; } // pas de taille de pizza ni de supplément
      if (!isOtherConfigured(p)) { prob("not_configured"); continue; }
      const u = unitLabel(p.sale_unit, p.pieces_per_portion)!;
      unit = p.base_price_minor ?? 0;
      optionLabel = p.sale_unit === "unit" ? null : u; // « à l'unité » va de soi : pas de mention superflue sur la ligne
      if (!it.variantId && variantRequired(p)) { prob("variant_required"); continue; } // ex. portion de 6 ou 12 pièces à choisir
      if (it.variantId) {
        const v = variants.find((x) => x.id === it.variantId && x.product_id === p.id);
        if (!v || !v.available || v.price_minor <= 0) { prob("variant_unavailable"); continue; }
        unit = v.price_minor;
        variantId = v.id;
        optionLabel = variantOptionLabel(p.sale_unit, p.pieces_per_portion, v);
      }
    }

    const chosen = it.extraIds.map((id) => extras.find((e) => e.id === id));
    if (chosen.some((e) => !e || !e.available)) { prob("extra_unavailable"); continue; }
    const ex = chosen.map((e) => ({ id: e!.id, name: e!.name, price_minor: e!.price_minor }));
    const unitTotal = unit + ex.reduce((a, e) => a + e.price_minor, 0);
    lines.push({
      key,
      productId: p.id,
      productName: p.name,
      productDescription: p.description,
      imageUrl: p.image_url,
      defaultImage: p.default_image,
      size,
      variantId,
      optionLabel,
      quantity: it.quantity,
      unitPriceMinor: unitTotal,
      extras: ex,
      lineTotalMinor: unitTotal * it.quantity,
      isDemo: p.is_demo || chosen.some((e) => e!.is_demo),
    });
  }
  return { lines, subtotalMinor: lines.reduce((a, l) => a + l.lineTotalMinor, 0), problems, hasDemo: lines.some((l) => l.isDemo) };
}

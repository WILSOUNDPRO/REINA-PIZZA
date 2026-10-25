import type { Sql } from "./db";
import { SIZES, type Size } from "@/lib/constants";
import { parseMajorToMinor } from "@/lib/money";
import { isOtherConfigured, type SaleUnit } from "@/lib/productSale";

export type AdminSize = { size: Size; price_minor: number; available: boolean };
export type AdminProduct = {
  id: string;
  name: string;
  description: string;
  image_url: string | null;
  default_image: string | null;
  available: boolean;
  archived: boolean;
  is_demo: boolean;
  category_name: string | null;
  orders_count: number;
  sizes: AdminSize[]; // toutes les lignes existantes ; « tarifée » = available && price_minor > 0
  product_type: "pizza" | "other";
  sale_unit: SaleUnit | null;
  base_price_minor: number | null;
  pieces_per_portion: number | null;
  ingredients: string | null;
  visible: boolean;
  variants: { id: string; label: string; price_minor: number; available: boolean }[];
};

/** Produit hors pizza : configuré = prix valide + unité de vente. Pizza : au moins une taille tarifée. */
export const isProductConfigured = (p: Pick<AdminProduct, "product_type" | "sizes" | "sale_unit" | "base_price_minor">) =>
  p.product_type === "pizza" ? p.sizes.some((s) => s.available && s.price_minor > 0) : isOtherConfigured(p);

export const isPriced = (s: AdminSize) => s.available && s.price_minor > 0;

export type Availability = "all" | "available" | "unavailable";

export async function listAdminProducts(sql: Sql, f: { q?: string; dispo?: Availability; archived?: boolean }) {
  const q = f.q?.trim();
  const like = q ? "%" + q.replace(/[%_\\]/g, "\\$&") + "%" : null;
  const rows = await sql<AdminProduct[]>`
    select p.id, p.name, p.description, p.image_url, p.default_image, p.available, (p.archived_at is not null) as archived, p.is_demo,
      p.product_type, p.sale_unit, p.base_price_minor, p.pieces_per_portion, p.ingredients, p.visible,
      coalesce((select json_agg(json_build_object('id', v.id, 'label', v.label, 'price_minor', v.price_minor, 'available', v.available) order by v.position, v.label)
        from product_variants v where v.product_id = p.id), '[]'::json) as variants,
      c.name as category_name,
      (select count(*)::int from order_items i where i.product_id = p.id) as orders_count,
      coalesce((select json_agg(json_build_object('size', s.size, 'price_minor', s.price_minor, 'available', s.available)
        order by array_position(array['S','M','L','XL','XXL'], s.size)) from product_sizes s where s.product_id = p.id), '[]'::json) as sizes
    from products p left join categories c on c.id = p.category_id
    where (p.archived_at is not null) = ${!!f.archived}
      ${like ? sql`and p.name ilike ${like}` : sql``}
      ${f.dispo === "available" ? sql`and p.available` : f.dispo === "unavailable" ? sql`and not p.available` : sql``}
    order by coalesce(c.position, 9999), p.position, p.name`;
  return rows;
}

/** Compteurs de la synthèse : produits actifs (non archivés), disponibles, et combinaisons produit/taille ayant un prix valide. */
export async function menuSummary(sql: Sql) {
  const [r] = await sql<{ products: number; available: number; priced: number; archived: number }[]>`
    select count(*) filter (where archived_at is null)::int as products,
           count(*) filter (where archived_at is null and available)::int as available,
           (select count(*)::int from product_sizes s join products p on p.id = s.product_id where p.archived_at is null and s.available and s.price_minor > 0) as priced,
           count(*) filter (where archived_at is not null)::int as archived
    from products`;
  return r;
}

export type MenuResult<T = unknown> = { ok: true; data?: T } | { ok: false; message: string; errors?: Record<string, string>; status?: number };

export async function setAvailability(sql: Sql, id: string, available: boolean): Promise<MenuResult> {
  return sql.begin(async (tx) => {
    const [p] = await tx<{ archived_at: Date | null; product_type: string; sale_unit: SaleUnit | null; base_price_minor: number | null }[]>`select archived_at, product_type, sale_unit, base_price_minor from products where id = ${id} for update`;
    if (!p) return { ok: false, message: "Produit introuvable.", status: 404 } as const;
    if (p.archived_at) return { ok: false, message: "Ce produit est archivé : restaurez-le d'abord.", status: 409 } as const;
    if (available && p.product_type === "other") {
      if (!isOtherConfigured(p)) return { ok: false, message: "Renseignez le prix et l'unité de vente avant d'activer ce produit.", status: 409 } as const;
    } else if (available) {
      const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from product_sizes where product_id = ${id} and available and price_minor > 0`;
      if (n === 0) return { ok: false, message: "Ajoutez au moins une taille avec un prix avant de rendre ce produit disponible.", status: 409 } as const;
    }
    await tx`update products set available = ${available} where id = ${id}`;
    return { ok: true } as const;
  });
}

/**
 * Enregistre les tarifs par taille. Champ vide = taille non proposée (ligne supprimée, jamais « 0 »).
 * Montants strictement positifs, parsés en entiers (aucune erreur d'arrondi). Les anciennes commandes ne changent pas.
 */
export async function saveSizes(sql: Sql, id: string, prices: Record<string, unknown>): Promise<MenuResult<AdminSize[]>> {
  const errors: Record<string, string> = {};
  const next = new Map<Size, number>();
  for (const key of Object.keys(prices)) if (!(SIZES as readonly string[]).includes(key)) errors[key] = "Taille non autorisée.";
  for (const size of SIZES) {
    const raw = prices[size];
    if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) continue;
    if (typeof raw !== "string" && typeof raw !== "number") { errors[size] = "Montant invalide."; continue; }
    const minor = parseMajorToMinor(String(raw));
    if (minor === null) errors[size] = "Montant invalide (ex. 1500 ou 1 250,50).";
    else if (minor <= 0) errors[size] = "Le prix doit être supérieur à 0.";
    else if (minor > 100_000_000) errors[size] = "Montant trop élevé.";
    else next.set(size, minor);
  }
  if (Object.keys(errors).length > 0) return { ok: false, message: "Vérifiez les montants signalés.", errors, status: 422 };

  return sql.begin(async (tx) => {
    const [p] = await tx<{ available: boolean; archived_at: Date | null }[]>`select available, archived_at from products where id = ${id} for update`;
    if (!p) return { ok: false, message: "Produit introuvable.", status: 404 } as const;
    if (p.available && next.size === 0) {
      return { ok: false, message: "Un produit disponible doit garder au moins une taille avec un prix. Rendez-le indisponible d'abord.", status: 409 } as const;
    }
    for (const [size, price] of next) {
      await tx`insert into product_sizes (product_id, size, price_minor, available) values (${id}, ${size}, ${price}, true)
        on conflict (product_id, size) do update set price_minor = excluded.price_minor, available = true`;
    }
    const keep = [...next.keys()];
    if (keep.length) await tx`delete from product_sizes where product_id = ${id} and size not in ${tx(keep)}`;
    else await tx`delete from product_sizes where product_id = ${id}`;
    const sizes = await tx<AdminSize[]>`select size, price_minor, available from product_sizes where product_id = ${id}
      order by array_position(array['S','M','L','XL','XXL'], size)`;
    return { ok: true, data: sizes } as const;
  });
}

export async function setArchived(sql: Sql, id: string, archived: boolean): Promise<MenuResult> {
  const r = await sql`update products set archived_at = ${archived ? sql`now()` : null}, available = ${archived ? false : sql`available`} where id = ${id} returning id`;
  return r.length ? { ok: true } : { ok: false, message: "Produit introuvable.", status: 404 };
}

/** Suppression définitive : refusée si le produit apparaît dans des commandes (on l'archive alors). */
export async function deleteProduct(sql: Sql, id: string): Promise<MenuResult> {
  return sql.begin(async (tx) => {
    const [p] = await tx`select id from products where id = ${id} for update`;
    if (!p) return { ok: false, message: "Produit introuvable.", status: 404 } as const;
    const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from order_items where product_id = ${id}`;
    if (n > 0) return { ok: false, message: "Ce produit figure dans des commandes : archivez-le plutôt que de le supprimer.", status: 409 } as const;
    await tx`delete from products where id = ${id}`;
    return { ok: true } as const;
  });
}


export type ProductInput = {
  id?: string;
  name: string;
  description?: string;
  ingredients?: string;
  categoryId?: string | null;
  productType?: "pizza" | "other"; // ignoré pour un produit existant : le type ne change pas
  position?: number;
  available: boolean;
  visible: boolean;
  isDemo?: boolean;
  imageUrl?: string | null; // undefined = inchangée
  sizes?: Record<string, string>; // pizzas : { S: "1500", M: "" … }
  basePrice?: string; // autres produits, en HTG (« 1 500 », « 1250,50 »)
  saleUnit?: string;  // "", "unit" ou "portion"
  pieces?: string;
  variants?: { label: string; price: string }[];
};

const uuid = /^[0-9a-f-]{36}$/i;

/** Création / modification d'un produit (pizza ou autre). Validation complète côté serveur, montants strictement positifs en centimes. */
export async function saveProduct(sql: Sql, i: ProductInput): Promise<MenuResult<{ id: string }>> {
  const errors: Record<string, string> = {};
  const name = (i.name ?? "").trim();
  const description = (i.description ?? "").trim();
  const ingredients = (i.ingredients ?? "").trim();
  if (!name || name.length > 120) errors.name = "Le nom est obligatoire (120 caractères maximum).";
  if (description.length > 1000) errors.description = "Description trop longue (1000 caractères maximum).";
  if (ingredients.length > 1000) errors.ingredients = "Ingrédients trop longs (1000 caractères maximum).";
  const category = i.categoryId && uuid.test(i.categoryId) ? i.categoryId : null;

  let existing: { product_type: "pizza" | "other" } | undefined;
  if (i.id) {
    [existing] = await sql<{ product_type: "pizza" | "other" }[]>`select product_type from products where id = ${i.id}`;
    if (!existing) return { ok: false, message: "Produit introuvable.", status: 404 };
  }
  const type = existing?.product_type ?? (i.productType === "other" ? "other" : "pizza");

  const sizes: { size: Size; price: number }[] = [];
  let basePrice: number | null = null;
  let saleUnit: SaleUnit | null = null;
  let pieces: number | null = null;
  const variants: { label: string; price: number }[] = [];

  if (type === "pizza") {
    for (const size of SIZES) {
      const raw = (i.sizes?.[size] ?? "").trim();
      if (!raw) continue;
      const m = parseMajorToMinor(raw);
      if (m === null || m <= 0 || m > 100_000_000) errors[`size_${size}`] = `Prix invalide pour la taille ${size} (strictement supérieur à 0).`;
      else sizes.push({ size, price: m });
    }
    if (i.available && sizes.length === 0 && !errors.name) errors.sizes = "Un produit disponible doit avoir au moins une taille avec un prix.";
  } else {
    const rawPrice = (i.basePrice ?? "").trim();
    if (rawPrice) {
      const m = parseMajorToMinor(rawPrice);
      if (m === null || m <= 0 || m > 100_000_000) errors.basePrice = "Prix invalide (strictement supérieur à 0, ex. 1500 ou 1 250,50).";
      else basePrice = m;
    }
    if (i.saleUnit === "unit" || i.saleUnit === "portion") saleUnit = i.saleUnit;
    else if (i.saleUnit) errors.saleUnit = "Unité de vente invalide.";
    const rawPieces = (i.pieces ?? "").trim();
    if (rawPieces) {
      const n = /^\d{1,3}$/.test(rawPieces) ? parseInt(rawPieces, 10) : NaN;
      if (saleUnit !== "portion") errors.pieces = "Le nombre de pièces ne s'applique qu'à une vente par portion.";
      else if (!(n >= 1 && n <= 200)) errors.pieces = "Nombre de pièces invalide (entre 1 et 200).";
      else pieces = n;
    }
    const seen = new Set<string>();
    for (const [k, v] of (i.variants ?? []).entries()) {
      const label = (v.label ?? "").trim(), rawV = (v.price ?? "").trim();
      if (!label && !rawV) continue;
      const m = rawV ? parseMajorToMinor(rawV) : null;
      if (!label || label.length > 40) errors[`variant_${k}`] = "Chaque variante a un nom (40 caractères maximum) et un prix.";
      else if (m === null || m <= 0 || m > 100_000_000) errors[`variant_${k}`] = `Prix invalide pour la variante « ${label} » (strictement supérieur à 0).`;
      else if (seen.has(label.toLowerCase())) errors[`variant_${k}`] = `La variante « ${label} » existe déjà.`;
      else { seen.add(label.toLowerCase()); variants.push({ label, price: m }); }
    }
    if (variants.length > 8) errors.variants = "8 variantes au maximum.";
    if (i.available && !(basePrice && saleUnit) && !Object.keys(errors).length) errors.available = "Renseignez le prix et l'unité de vente avant d'activer ce produit.";
  }
  if (Object.keys(errors).length) return { ok: false, message: Object.values(errors)[0], errors, status: 422 };

  const position = Number.isFinite(i.position) ? Math.max(-1000, Math.min(1000, Math.trunc(i.position as number))) : 0;
  const id = await sql.begin(async (tx) => {
    let pid = i.id;
    const img = i.imageUrl;
    if (pid) {
      await tx`update products set name = ${name}, description = ${description}, ingredients = ${ingredients || null}, category_id = ${category},
        available = ${i.available}, visible = ${i.visible}, position = ${position}, is_demo = ${!!i.isDemo},
        sale_unit = ${type === "other" ? saleUnit : null}, base_price_minor = ${type === "other" ? basePrice : null}, pieces_per_portion = ${type === "other" ? pieces : null}
        ${img !== undefined ? tx`, image_url = ${img}` : tx``} where id = ${pid}`;
    } else {
      const [p] = await tx<{ id: string }[]>`insert into products (name, description, ingredients, category_id, available, visible, position, is_demo, image_url, product_type, sale_unit, base_price_minor, pieces_per_portion)
        values (${name}, ${description}, ${ingredients || null}, ${category}, ${i.available}, ${i.visible}, ${position}, ${!!i.isDemo}, ${img ?? null}, ${type},
          ${type === "other" ? saleUnit : null}, ${type === "other" ? basePrice : null}, ${type === "other" ? pieces : null}) returning id`;
      pid = p.id;
    }
    if (type === "pizza") {
      for (const s of sizes) {
        await tx`insert into product_sizes (product_id, size, price_minor, available) values (${pid}, ${s.size}, ${s.price}, true)
          on conflict (product_id, size) do update set price_minor = excluded.price_minor, available = true`;
      }
      const keep = sizes.map((s) => s.size);
      await tx`update product_sizes set available = false where product_id = ${pid} ${keep.length ? tx`and size not in ${tx(keep)}` : tx``}`;
    } else {
      let pos = 0;
      for (const v of variants) {
        await tx`insert into product_variants (product_id, label, price_minor, position, available) values (${pid}, ${v.label}, ${v.price}, ${pos++}, true)
          on conflict (product_id, label) do update set price_minor = excluded.price_minor, position = excluded.position, available = true`;
      }
      const labels = variants.map((v) => v.label);
      if (labels.length) await tx`delete from product_variants where product_id = ${pid} and label not in ${tx(labels)}`;
      else await tx`delete from product_variants where product_id = ${pid}`;
    }
    return pid!;
  });
  return { ok: true, data: { id } };
}

import type { Sql } from "./db";
import { SIZES, type Size } from "@/lib/constants";
import { parseMajorToMinor } from "@/lib/money";

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
};

export const isPriced = (s: AdminSize) => s.available && s.price_minor > 0;

export type Availability = "all" | "available" | "unavailable";

export async function listAdminProducts(sql: Sql, f: { q?: string; dispo?: Availability; archived?: boolean }) {
  const q = f.q?.trim();
  const like = q ? "%" + q.replace(/[%_\\]/g, "\\$&") + "%" : null;
  const rows = await sql<AdminProduct[]>`
    select p.id, p.name, p.description, p.image_url, p.default_image, p.available, (p.archived_at is not null) as archived, p.is_demo,
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
    const [p] = await tx<{ archived_at: Date | null }[]>`select archived_at from products where id = ${id} for update`;
    if (!p) return { ok: false, message: "Produit introuvable.", status: 404 } as const;
    if (p.archived_at) return { ok: false, message: "Ce produit est archivé : restaurez-le d'abord.", status: 409 } as const;
    if (available) {
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

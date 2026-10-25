import type { Sql } from "./db";
import type { Size } from "@/lib/constants";
import { isOtherConfigured, type ProductState, type SaleUnit } from "@/lib/productSale";

export type CatalogSize = { size: Size; price_minor: number };
export type CatalogVariant = { id: string; label: string; price_minor: number };
export type CatalogProduct = {
  id: string;
  name: string;
  description: string;
  ingredients: string | null;
  image_url: string | null;
  default_image: string | null;
  is_demo: boolean;
  category_id: string | null;
  category_name: string | null;
  product_type: "pizza" | "other";
  sale_unit: SaleUnit | null;
  base_price_minor: number | null;
  pieces_per_portion: number | null;
  sizes: CatalogSize[];
  variants: CatalogVariant[];
  /** orderable : commandable ; soon : prix / unité non configurés (« Bientôt disponible ») ; unavailable : désactivé par l'administrateur. */
  state: ProductState;
};
export type CatalogExtra = { id: string; name: string; price_minor: number; is_demo: boolean };

const SIZE_ORDER = "array['S','M','L','XL','XXL']";

/** Produits affichés au catalogue (visibles, non archivés), avec leur état de commande calculé côté serveur. */
export async function getPublicCatalog(sql: Sql) {
  const rows = await sql<Omit<CatalogProduct, "state">[]>`
    select p.id, p.name, p.description, p.ingredients, p.image_url, p.default_image, p.is_demo, p.category_id, c.name as category_name,
      p.product_type, p.sale_unit, p.base_price_minor, p.pieces_per_portion, p.available as "available_flag",
      coalesce((select json_agg(json_build_object('size', s.size, 'price_minor', s.price_minor)
          order by array_position(${sql.unsafe(SIZE_ORDER)}, s.size))
        from product_sizes s where s.product_id = p.id and s.available and s.price_minor > 0), '[]'::json) as sizes,
      coalesce((select json_agg(json_build_object('id', v.id, 'label', v.label, 'price_minor', v.price_minor) order by v.position, v.label)
        from product_variants v where v.product_id = p.id and v.available and v.price_minor > 0), '[]'::json) as variants
    from products p left join categories c on c.id = p.category_id
    where p.visible and p.archived_at is null and (c.id is null or c.active)
    order by coalesce(c.position, 9999), c.name nulls last, p.position, p.name`;
  const products: CatalogProduct[] = rows.map((r) => {
    const x = r as Omit<CatalogProduct, "state"> & { available_flag: boolean };
    const configured = x.product_type === "pizza" ? x.sizes.length > 0 : isOtherConfigured(x);
    const state: ProductState = !configured ? "soon" : x.available_flag ? "orderable" : "unavailable";
    return { ...x, state };
  });
  const extras = await sql<CatalogExtra[]>`
    select id, name, price_minor, is_demo from extras where available order by position, name`;
  return { products, extras };
}

export async function getActiveZones(sql: Sql) {
  return sql<{ id: string; name: string; commune: string | null; fee_minor: number; is_demo: boolean }[]>`
    select id, name, commune, fee_minor, is_demo from delivery_zones where active order by position, name`;
}

export { listEnabledPaymentMethods as getEnabledPaymentMethods } from "./paymentMethods";

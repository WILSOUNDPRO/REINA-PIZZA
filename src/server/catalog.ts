import type { Sql } from "./db";
import type { Size } from "@/lib/constants";

export type CatalogSize = { size: Size; price_minor: number };
export type CatalogProduct = {
  id: string;
  name: string;
  description: string;
  image_url: string | null;
  is_demo: boolean;
  category_id: string | null;
  category_name: string | null;
  sizes: CatalogSize[];
};
export type CatalogExtra = { id: string; name: string; price_minor: number; is_demo: boolean };

const SIZE_ORDER = "array['S','M','L','XL','XXL']";

/** Produits visibles côté client : disponibles, avec au moins une taille disponible. */
export async function getPublicCatalog(sql: Sql) {
  const products = await sql<CatalogProduct[]>`
    select p.id, p.name, p.description, p.image_url, p.is_demo, p.category_id, c.name as category_name,
      coalesce((select json_agg(json_build_object('size', s.size, 'price_minor', s.price_minor)
          order by array_position(${sql.unsafe(SIZE_ORDER)}, s.size))
        from product_sizes s where s.product_id = p.id and s.available), '[]'::json) as sizes
    from products p left join categories c on c.id = p.category_id
    where p.available and (c.id is null or c.active)
    order by coalesce(c.position, 9999), c.name nulls last, p.position, p.name`;
  const extras = await sql<CatalogExtra[]>`
    select id, name, price_minor, is_demo from extras where available order by position, name`;
  return { products: products.filter((p) => p.sizes.length > 0), extras };
}

export async function getActiveZones(sql: Sql) {
  return sql<{ id: string; name: string; commune: string | null; fee_minor: number; is_demo: boolean }[]>`
    select id, name, commune, fee_minor, is_demo from delivery_zones where active order by position, name`;
}

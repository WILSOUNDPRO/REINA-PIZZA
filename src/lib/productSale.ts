// Vente des produits hors pizzas : à l'unité ou par portion. Rien n'est supposé : ni prix, ni nombre de pièces, ni accompagnement.
export type SaleUnit = "unit" | "portion";
export type ProductState = "orderable" | "soon" | "unavailable";

export const SALE_UNIT_LABELS: Record<SaleUnit, string> = { unit: "À l'unité", portion: "Par portion" };

/** Libellé de l'unité configurée : « à l'unité », « portion », « portion de 6 pièces » (seulement si le nombre est renseigné). */
export function unitLabel(unit: SaleUnit | null, pieces: number | null): string | null {
  if (unit === "unit") return "à l'unité";
  if (unit === "portion") return pieces ? `portion de ${pieces} pièce${pieces > 1 ? "s" : ""}` : "portion";
  return null;
}

type PricedVariant = { price_minor: number; available?: boolean };
const usable = (variants?: PricedVariant[]) => (variants ?? []).filter((v) => v.price_minor > 0 && v.available !== false);

/**
 * Un produit hors pizza n'est configuré que s'il a une unité de vente ET un prix valide :
 * soit un prix de base, soit au moins une variante tarifée (cas d'un choix de portion obligatoire, sans prix de base).
 */
export const isOtherConfigured = (p: { sale_unit: SaleUnit | null; base_price_minor: number | null; variants?: PricedVariant[] }) =>
  !!p.sale_unit && ((!!p.base_price_minor && p.base_price_minor > 0) || usable(p.variants).length > 0);

/** Sans prix de base, le client doit choisir une variante (ex. portion de 6 ou de 12 pièces) : aucune sélection par défaut. */
export const variantRequired = (p: { base_price_minor: number | null; variants?: PricedVariant[] }) =>
  !(p.base_price_minor && p.base_price_minor > 0) && usable(p.variants).length > 0;

/** Prix le plus bas proposé (pour « À partir de … »). */
export const minPriceMinor = (p: { base_price_minor: number | null; variants?: PricedVariant[] }): number | null => {
  const all = [...(p.base_price_minor && p.base_price_minor > 0 ? [p.base_price_minor] : []), ...usable(p.variants).map((v) => v.price_minor)];
  return all.length ? Math.min(...all) : null;
};

/** Libellé d'une option commandée : « portion de 6 pièces » si le nombre de pièces est connu, sinon « Double · à l'unité ». */
export function variantOptionLabel(unit: SaleUnit | null, productPieces: number | null, v: { label: string; pieces?: number | null }): string {
  if (unit === "portion" && v.pieces) return unitLabel("portion", v.pieces)!;
  return `${v.label} · ${unitLabel(unit, productPieces)}`;
}

/** Libellé d'une ligne : « Taille S » pour une pizza, l'unité ou la portion configurée sinon. Jamais de taille vide ou fictive. */
export function lineOption(i: { size?: string | null; option_label?: string | null }, style: "ui" | "message" = "ui"): string {
  if (i.size) return style === "ui" ? `Taille ${i.size}` : `taille ${i.size}`;
  const o = i.option_label?.trim();
  if (!o) return "";
  return style === "ui" ? o.charAt(0).toUpperCase() + o.slice(1) : o;
}

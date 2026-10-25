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

/** Un produit hors pizza n'est configuré que s'il a un prix valide ET une unité de vente. */
export const isOtherConfigured = (p: { sale_unit: SaleUnit | null; base_price_minor: number | null }) =>
  !!p.sale_unit && !!p.base_price_minor && p.base_price_minor > 0;

/** Libellé d'une ligne : « Taille S » pour une pizza, l'unité ou la portion configurée sinon. Jamais de taille vide ou fictive. */
export function lineOption(i: { size?: string | null; option_label?: string | null }, style: "ui" | "message" = "ui"): string {
  if (i.size) return style === "ui" ? `Taille ${i.size}` : `taille ${i.size}`;
  const o = i.option_label?.trim();
  if (!o) return "";
  return style === "ui" ? o.charAt(0).toUpperCase() + o.slice(1) : o;
}

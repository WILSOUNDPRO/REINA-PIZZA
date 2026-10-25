import type { Size } from "./constants";

// Pizza : taille obligatoire. Autres produits : pas de taille ; variante facultative.
export type CartItem = { productId: string; size?: Size; variantId?: string; quantity: number; extraIds: string[] };

export const lineKey = (i: Pick<CartItem, "productId" | "size" | "variantId" | "extraIds">) =>
  `${i.productId}:${i.size ?? ""}:${i.variantId ?? ""}:${[...i.extraIds].sort().join(",")}`;

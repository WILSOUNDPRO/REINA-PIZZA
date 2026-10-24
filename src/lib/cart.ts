import type { Size } from "./constants";

export type CartItem = { productId: string; size: Size; quantity: number; extraIds: string[] };

export const lineKey = (i: Pick<CartItem, "productId" | "size" | "extraIds">) =>
  `${i.productId}:${i.size}:${[...i.extraIds].sort().join(",")}`;

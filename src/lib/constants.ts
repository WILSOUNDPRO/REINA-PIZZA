export const SIZES = ["S", "M", "L", "XL", "XXL"] as const;
export type Size = (typeof SIZES)[number];

export const CURRENCIES = ["HTG", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const TIMEZONE = "America/Port-au-Prince";

export const MAX_LINE_QUANTITY = 20;
export const MAX_CART_LINES = 30;

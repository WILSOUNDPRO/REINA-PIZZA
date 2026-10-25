// Visuels par défaut : illustrations générées stockées localement (originaux PNG conservés, WebP 480/800/1200 en 4:3).
// Une photo ajoutée par l'administrateur (image_url) remplace toujours l'illustration.
export const ILLUSTRATION_LABEL = "Photo d'illustration";

export const DEFAULT_IMAGE_WIDTHS = [480, 800, 1200] as const;

// Burger et Wings sont dans /images/products : {slug}-480.webp, {slug}-800.webp et {slug}.webp (1200 px). Les pizzas : /images/pizzas/{slug}-{w}.webp.
const PRODUCT_SLUGS = new Set(["burger", "wings"]);

export function defaultImageSrc(slug: string, width: (typeof DEFAULT_IMAGE_WIDTHS)[number] = 800) {
  if (PRODUCT_SLUGS.has(slug)) return width === 1200 ? `/images/products/${slug}.webp` : `/images/products/${slug}-${width}.webp`;
  return `/images/pizzas/${slug}-${width}.webp`;
}
export function defaultImageSrcSet(slug: string) {
  return DEFAULT_IMAGE_WIDTHS.map((w) => `${defaultImageSrc(slug, w)} ${w}w`).join(", ");
}

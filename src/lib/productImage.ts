// Visuels par défaut des produits : images du nouveau site, WebP en 4:3 stockées localement (sources dans design-originals/, voir scripts/optimize-images.ts).
// Une photo ajoutée par l'administrateur (image_url) remplace toujours l'illustration.
// Un produit sans visuel fourni (ex. pizzas jambon et hareng saur) affiche un emplacement discret, jamais l'image d'un autre produit.
export const ILLUSTRATION_LABEL = "Photo d'illustration";

// Largeurs disponibles par visuel ; la plus grande porte le nom {slug}.webp, les autres {slug}-{largeur}.webp. Aucun agrandissement.
const DEFAULT_IMAGES: Record<string, readonly number[]> = {
  pepperoni: [480, 800, 960],
  "burger-frites": [480, 800, 1200],
  wings: [480],
};

export const hasDefaultImage = (slug: string | null | undefined): slug is string => !!slug && slug in DEFAULT_IMAGES;

const src = (slug: string, w: number) => (w === Math.max(...DEFAULT_IMAGES[slug]) ? `/images/products/${slug}.webp` : `/images/products/${slug}-${w}.webp`);

export function defaultImage(slug: string) {
  const widths = DEFAULT_IMAGES[slug];
  const max = Math.max(...widths);
  return {
    src: src(slug, widths.includes(800) ? 800 : max),
    srcSet: widths.map((w) => `${src(slug, w)} ${w}w`).join(", "),
    width: max,
    height: Math.round((max * 3) / 4),
  };
}

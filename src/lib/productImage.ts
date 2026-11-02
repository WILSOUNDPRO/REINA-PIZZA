// Visuels par défaut des produits : images du nouveau site, WebP en 4:3 stockées localement (sources dans design-originals/, voir scripts/optimize-images.ts).
// Une photo ajoutée par l'administrateur (image_url) remplace toujours l'illustration.
// Sur décision du propriétaire, les pizzas jambon et hareng saur utilisent la même image d'illustration que la pizza pepperoni
// (mention « Photo d'illustration ») jusqu'à l'ajout de leurs photos dans l'administration. Un produit sans visuel affiche un emplacement discret.
export const ILLUSTRATION_LABEL = "Photo d'illustration";

// Largeurs disponibles par visuel ; la plus grande porte le nom {slug}.webp, les autres {slug}-{largeur}.webp. Aucun agrandissement.
const DEFAULT_IMAGES: Record<string, readonly number[]> = {
  pepperoni: [480, 800, 960],
  "burger-frites": [480, 800, 1200],
  wings: [480],
};

const ALIASES: Record<string, string> = { jambon: "pepperoni", "hareng-saur": "pepperoni" };
const resolve = (slug: string) => ALIASES[slug] ?? slug;

export const hasDefaultImage = (slug: string | null | undefined): slug is string => !!slug && resolve(slug) in DEFAULT_IMAGES;

const src = (slug: string, w: number) => (w === Math.max(...DEFAULT_IMAGES[slug]) ? `/images/products/${slug}.webp` : `/images/products/${slug}-${w}.webp`);

export function defaultImage(requested: string) {
  const slug = resolve(requested);
  const widths = DEFAULT_IMAGES[slug];
  const max = Math.max(...widths);
  return {
    src: src(slug, widths.includes(800) ? 800 : max),
    srcSet: widths.map((w) => `${src(slug, w)} ${w}w`).join(", "),
    width: max,
    height: Math.round((max * 3) / 4),
  };
}

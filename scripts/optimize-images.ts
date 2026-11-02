// Génère les visuels par défaut des produits (WebP 4:3, sans déformation) à partir des fichiers d'origine du nouveau site,
// conservés tels quels dans design-originals/. Usage : npm run images:optimize
//  - burger-frites : photo du burger + vignette des frites ; wings : photo des wings ; pepperoni : image extraite de l'animation.
//  - Aucun agrandissement : les largeurs produites ne dépassent pas celle de la source (voir src/lib/productImage.ts).
import sharp from "sharp";
import path from "node:path";

const SRC = path.join(process.cwd(), "design-originals");
const OUT = path.join(process.cwd(), "public", "images", "products");
const W43 = (w: number) => ({ width: w, height: Math.round((w * 3) / 4), fit: "cover" as const, withoutEnlargement: true });

async function write(slug: string, input: ReturnType<typeof sharp> | Buffer, maxWidth: number, widths: number[]) {
  const buf = Buffer.isBuffer(input) ? input : await input.toBuffer();
  for (const w of widths.filter((x) => x <= maxWidth)) {
    const out = path.join(OUT, w === maxWidth ? `${slug}.webp` : `${slug}-${w}.webp`);
    await sharp(buf).resize(W43(w)).webp({ quality: 80 }).toFile(out);
    console.log(path.basename(out));
  }
}

async function main() {
  // Burger + frites : 4:3 centré sur le burger, vignette des frites en bas à droite (bordure dorée, coins arrondis).
  const burger = await sharp(path.join(SRC, "burger.jpg")).extract({ left: 176, top: 0, width: 1024, height: 768 }).resize(1200, 900).toBuffer();
  const fries = await sharp(path.join(SRC, "fries.jpg")).extract({ left: 380, top: 40, width: 760, height: 570 }).resize(420, 315).toBuffer();
  const mask = Buffer.from('<svg width="420" height="315"><rect width="420" height="315" rx="26" fill="#fff"/></svg>');
  const rounded = await sharp(fries).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  const border = Buffer.from('<svg width="432" height="327"><rect x="3" y="3" width="426" height="321" rx="29" fill="none" stroke="#f5b51b" stroke-width="6"/></svg>');
  const burgerFrites = await sharp(burger).composite([{ input: rounded, left: 750, top: 555 }, { input: border, left: 744, top: 549 }]).toBuffer();
  await write("burger-frites", burgerFrites, 1200, [480, 800, 1200]);

  // Wings : source 600 × 450 ; recadrage 4:3 sur les ailes (la coupelle de sauce de la photo est écartée : aucune sauce n'est annoncée), sortie 480 px.
  const wings = await sharp(path.join(SRC, "wings.jpg")).extract({ left: 215, top: 0, width: 385, height: 289 }).resize(480, 360).toBuffer();
  await write("wings", wings, 480, [480]);

  // Pizza pepperoni : image extraite de l'animation (1280 × 720), recadrée en 4:3.
  await write("pepperoni", sharp(path.join(SRC, "pepperoni-frame-060.jpg")).extract({ left: 280, top: 0, width: 960, height: 720 }), 960, [480, 800, 960]);
}
main();

// Prépare le logo officiel (design-originals/logo-reina-pizza.webp, fond noir) pour le site :
//  - versions à fond transparent (le noir devient transparent, fumée comprise), rognées autour du logo, en 300 et 600 px de large ;
//  - image de partage 1200 × 630 (aperçu WhatsApp / réseaux) ; icône d'application (couronne et part de pizza).
// Usage : npm run logo:build
import sharp from "sharp";
import path from "node:path";

const SRC = path.join(process.cwd(), "design-originals", "logo-reina-pizza.webp");
const OUT = path.join(process.cwd(), "public", "brand");

/** Fond noir → transparence : alpha = canal le plus lumineux, couleur re-normalisée (le texte et l'or restent intacts). */
async function transparent(input: Buffer) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const a = Math.max(data[i], data[i + 1], data[i + 2]);
    if (a < 14) { data[i] = data[i + 1] = data[i + 2] = 0; data[i + 3] = 0; continue; }
    const k = 255 / a;
    data[i] = Math.min(255, Math.round(data[i] * k));
    data[i + 1] = Math.min(255, Math.round(data[i + 1] * k));
    data[i + 2] = Math.min(255, Math.round(data[i + 2] * k));
    data[i + 3] = a;
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
}

async function main() {
  const t = await transparent(await sharp(SRC).toBuffer());
  const full = await t.png().toBuffer();
  const trimmed = await sharp(full).extract({ left: 90, top: 30, width: 1550, height: 830 }).toBuffer(); // rognage manuel : la fumée et les reflets étendent la zone détectée
  const meta = await sharp(trimmed).metadata();
  console.log("logo rogné", meta.width, "×", meta.height);
  for (const w of [300, 600]) await sharp(trimmed).resize({ width: w }).webp({ quality: 88, alphaQuality: 90 }).toFile(path.join(OUT, `logo-reina-pizza-${w}.webp`));
  await sharp(SRC).resize(1200, 675).extend({ top: 0, bottom: 0, background: "#000" }).jpeg({ quality: 86 }).toFile(path.join(OUT, "og-logo.jpg"));
  // Icône : couronne + part de pizza (partie gauche du logo) sur fond noir.
  const icon = await sharp(SRC).extract({ left: 95, top: 110, width: 480, height: 640 }).resize({ width: 420, height: 420, fit: "contain", background: "#000" }).extend({ top: 46, bottom: 46, left: 46, right: 46, background: "#000" }).png().toBuffer();
  await sharp(icon).resize(512, 512).png().toFile(path.join(process.cwd(), "src", "app", "icon.png"));
  await sharp(icon).resize(180, 180).png().toFile(path.join(process.cwd(), "src", "app", "apple-icon.png"));
}
main();

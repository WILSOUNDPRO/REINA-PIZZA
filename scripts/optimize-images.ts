// Génère les WebP responsives (4:3, sans agrandissement ni déformation) des visuels par défaut à partir des PNG d'origine,
// qui sont conservés tels quels dans public/images/pizzas/. Usage : npm run images:optimize
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "public", "images", "pizzas");
const WIDTHS = [480, 800, 1200];

async function main() {
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".png"))) {
    const slug = file.replace(/\.png$/, "");
    const src = sharp(path.join(dir, file));
    const { width = 0, height = 0 } = await src.metadata();
    // Recadrage 4:3 centré uniquement si l'original ne l'est pas déjà (tolérance de 1 px).
    const h43 = Math.round((width * 3) / 4);
    const base = Math.abs(h43 - height) <= 1 ? src : src.extract({ left: 0, top: Math.max(0, Math.round((height - h43) / 2)), width, height: Math.min(h43, height) });
    const buf = await base.toBuffer();
    for (const w of WIDTHS.filter((x) => x <= width)) {
      const out = path.join(dir, `${slug}-${w}.webp`);
      await sharp(buf).resize({ width: w, height: Math.round((w * 3) / 4), fit: "cover", withoutEnlargement: true }).webp({ quality: 80 }).toFile(out);
      console.log(`${slug}-${w}.webp ${(fs.statSync(out).size / 1024).toFixed(0)} Ko`);
    }
  }
}
main();

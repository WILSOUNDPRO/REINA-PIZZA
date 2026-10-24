// Assemble toutes les migrations en un seul fichier à coller dans l'éditeur SQL de Supabase (supabase/setup.sql).
// Le fichier est idempotent pour les migrations déjà appliquées : utiliser `npm run db:migrate` si DATABASE_URL est disponible.
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "supabase", "migrations");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const body = files.map((f) => `-- ═════════ ${f} ═════════\n${fs.readFileSync(path.join(dir, f), "utf8").trim()}\n`).join("\n");
const header = `-- Reina Pizza — installation complète pour un NOUVEAU projet Supabase (éditeur SQL → coller → Run).\n-- À exécuter UNE SEULE FOIS sur une base vide. Généré par \`npm run db:bundle\` : ne pas modifier à la main.\n-- Ensuite, autorisez l'administrateur :\n--   insert into admin_users (email) values ('votre-email@exemple.com');  -- en minuscules\n\n`;
fs.writeFileSync(path.join(process.cwd(), "supabase", "setup.sql"), header + body);
console.log(`supabase/setup.sql généré (${files.length} migrations)`);

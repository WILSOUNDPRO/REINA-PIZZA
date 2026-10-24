// Applique les migrations SQL de supabase/migrations (fichiers triés) sur DATABASE_URL.
// Usage : npm run db:migrate
import postgres from "postgres";
import fs from "node:fs";
import path from "node:path";

export async function migrate(url: string) {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
    const dir = path.join(process.cwd(), "supabase", "migrations");
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      const [done] = await sql`select 1 from schema_migrations where name = ${file}`;
      if (done) continue;
      await sql.begin(async (tx) => {
        await tx.unsafe(fs.readFileSync(path.join(dir, file), "utf8"));
        await tx`insert into schema_migrations (name) values (${file})`;
      });
      console.log(`migration appliquée : ${file}`);
    }
  } finally {
    await sql.end();
  }
}

if (process.argv[1]?.endsWith("migrate.ts")) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL manquant");
    process.exit(1);
  }
  migrate(url).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

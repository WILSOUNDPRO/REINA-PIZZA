import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { env } from "./env";
import type { Sql } from "./db";

export async function clientKey(): Promise<string> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
  // L'adresse IP n'est jamais stockée en clair.
  return createHash("sha256").update(env.rateLimitSalt() + ip).digest("hex").slice(0, 24);
}

/** Fenêtre fixe, atomique, partagée entre instances (stockée en base). Retourne true si la requête est autorisée. */
export async function allow(sql: Sql, key: string, limit: number, windowSec: number): Promise<boolean> {
  const [row] = await sql<{ count: number }[]>`
    insert into rate_limits (key, window_start, count) values (${key}, now(), 1)
    on conflict (key) do update set
      count = case when rate_limits.window_start < now() - make_interval(secs => ${windowSec}) then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start < now() - make_interval(secs => ${windowSec}) then now() else rate_limits.window_start end
    returning count`;
  return row.count <= limit;
}

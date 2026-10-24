import { NextResponse } from "next/server";
import { getSql } from "@/server/db";
import { env } from "@/server/env";

export const dynamic = "force-dynamic";

// Diagnostic de configuration : n'expose AUCUNE valeur secrète, seulement des booléens et les NOMS des variables manquantes.
export async function GET() {
  const missing = [
    !process.env.DATABASE_URL && "DATABASE_URL",
    !env.supabaseUrl() && "SUPABASE_URL",
    !env.supabaseAnonKey() && "SUPABASE_ANON_KEY",
  ].filter(Boolean) as string[];
  const checks: Record<string, boolean | string> = { env_ok: missing.length === 0 };
  if (missing.length) checks.missing_env = missing.join(", ");

  if (process.env.DATABASE_URL) {
    try {
      const sql = getSql();
      await sql`select 1`;
      checks.database_reachable = true;
      const [t] = await sql<{ ok: boolean }[]>`select to_regclass('public.settings') is not null as ok`;
      checks.migrations_applied = t.ok;
      if (t.ok) {
        const [a] = await sql<{ n: number }[]>`select count(*)::int as n from admin_users`;
        checks.admin_user_registered = a.n > 0;
        const [c] = await sql<{ currency: string | null }[]>`select currency from settings where id = 1`;
        checks.currency_set = !!c?.currency;
      }
    } catch (e) {
      checks.database_reachable = false;
      // Message technique court (sans la chaîne de connexion) pour aider au diagnostic.
      checks.database_error = String((e as { code?: string; message?: string }).code ?? (e as Error).message).slice(0, 80);
    }
  }
  if (env.supabaseUrl() && env.supabaseAnonKey()) {
    try {
      const r = await fetch(`${env.supabaseUrl()}/auth/v1/settings`, { headers: { apikey: env.supabaseAnonKey() }, cache: "no-store", signal: AbortSignal.timeout(6000) });
      checks.supabase_auth_reachable = r.ok;
      if (r.ok) checks.public_signup_disabled = Boolean((await r.json()).disable_signup);
    } catch {
      checks.supabase_auth_reachable = false;
    }
  }
  const ok = checks.env_ok === true && checks.database_reachable === true && checks.migrations_applied === true;
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}

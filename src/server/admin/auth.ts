import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env, isProd } from "../env";
import { getSql } from "../db";

export const ACCESS_COOKIE = "rp_at";
export const REFRESH_COOKIE = "rp_rt";

export type Admin = { email: string };

type TokenResponse = { access_token: string; refresh_token: string; expires_in: number; user?: { email?: string } };

function authHeaders(bearer?: string) {
  return { apikey: env.supabaseAnonKey(), "Content-Type": "application/json", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) };
}

export function authConfigured() {
  return Boolean(env.supabaseUrl() && env.supabaseAnonKey());
}

export async function passwordLogin(email: string, password: string): Promise<TokenResponse | null> {
  if (!authConfigured()) return null;
  const r = await fetch(`${env.supabaseUrl()}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });
  return r.ok ? ((await r.json()) as TokenResponse) : null;
}

export function cookieOptions(maxAge: number) {
  return { httpOnly: true, secure: isProd(), sameSite: "lax" as const, path: "/", maxAge };
}

export async function setSessionCookies(t: TokenResponse) {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, t.access_token, cookieOptions(Math.max(60, t.expires_in)));
  jar.set(REFRESH_COOKIE, t.refresh_token, cookieOptions(60 * 60 * 24 * 14));
}

export async function clearSession() {
  const jar = await cookies();
  const at = jar.get(ACCESS_COOKIE)?.value;
  if (at && authConfigured()) {
    await fetch(`${env.supabaseUrl()}/auth/v1/logout`, { method: "POST", headers: authHeaders(at), cache: "no-store" }).catch(() => {});
  }
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}

/** Vérifie le jeton auprès de Supabase Auth (pas de confiance aveugle dans un JWT), puis l'appartenance à admin_users. */
export async function getAdmin(): Promise<Admin | null> {
  if (!authConfigured()) return null;
  const jar = await cookies();
  const at = jar.get(ACCESS_COOKIE)?.value;
  if (!at) return null;
  const r = await fetch(`${env.supabaseUrl()}/auth/v1/user`, { headers: authHeaders(at), cache: "no-store" }).catch(() => null);
  if (!r || !r.ok) return null;
  const user = (await r.json()) as { email?: string; email_confirmed_at?: string | null };
  const email = user.email?.toLowerCase();
  if (!email || !user.email_confirmed_at) return null;
  const [row] = await getSql()`select email from admin_users where email = ${email}`;
  return row ? { email } : null;
}

/** À appeler au début de CHAQUE page, action ou route d'administration. */
export async function requireAdmin(): Promise<Admin> {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

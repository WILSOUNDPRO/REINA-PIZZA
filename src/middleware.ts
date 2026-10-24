import { NextResponse, type NextRequest } from "next/server";

// Défense en profondeur uniquement : chaque page/action admin revérifie l'accès côté serveur (requireAdmin).
// Le middleware sert à rafraîchir la session et à éviter d'afficher l'admin sans cookie.
const ACCESS = "rp_at";
const REFRESH = "rp_rt";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/admin/login") return NextResponse.next();

  if (!req.cookies.get(ACCESS)?.value) {
    const rt = req.cookies.get(REFRESH)?.value;
    const base = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
    if (rt && base) {
      const r = await fetch(`${base}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: { apikey: process.env.SUPABASE_ANON_KEY ?? "", "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: rt }),
      }).catch(() => null);
      if (r?.ok) {
        const t = (await r.json()) as { access_token: string; refresh_token: string; expires_in: number };
        // Le nouveau jeton doit aussi être visible par le rendu en cours.
        const headers = new Headers(req.headers);
        const cookie = (headers.get("cookie") ?? "").split("; ").filter((c) => !c.startsWith(ACCESS + "=") && !c.startsWith(REFRESH + "=")).concat(`${ACCESS}=${t.access_token}`, `${REFRESH}=${t.refresh_token}`);
        headers.set("cookie", cookie.join("; "));
        const res = NextResponse.next({ request: { headers } });
        const opts = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
        res.cookies.set(ACCESS, t.access_token, { ...opts, maxAge: Math.max(60, t.expires_in) });
        res.cookies.set(REFRESH, t.refresh_token, { ...opts, maxAge: 60 * 60 * 24 * 14 });
        return res;
      }
    }
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*", "/api/admin/:path*"] };

// Faux Supabase (Auth + Storage) pour développer et tester SANS compte Supabase. NE JAMAIS utiliser en production.
// MOCK_USERS="admin@reina.test:motdepasse,autre@reina.test:motdepasse"  (défaut ci-dessous)
import http from "node:http";
import { randomUUID } from "node:crypto";

const port = Number(process.env.MOCK_SUPABASE_PORT ?? 54321);
const users = new Map<string, string>(
  (process.env.MOCK_USERS ?? "admin@reina.test:mot-de-passe-test,intrus@reina.test:mot-de-passe-test")
    .split(",")
    .map((p) => p.split(":") as [string, string]),
);
const sessions = new Map<string, { email: string; exp: number }>();
const refresh = new Map<string, string>();
const files = new Map<string, { type: string; data: Buffer }>();
const ANON = process.env.SUPABASE_ANON_KEY ?? "anon-test-key";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "service-test-key";
const TTL = Number(process.env.MOCK_TOKEN_TTL ?? 3600);

const body = (req: http.IncomingMessage) =>
  new Promise<Buffer>((res) => {
    const c: Buffer[] = [];
    req.on("data", (d) => c.push(d)).on("end", () => res(Buffer.concat(c)));
  });
const json = (res: http.ServerResponse, code: number, o: unknown) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(o));
};
function issue(email: string) {
  const at = "at_" + randomUUID();
  const rt = "rt_" + randomUUID();
  sessions.set(at, { email, exp: Date.now() + TTL * 1000 });
  refresh.set(rt, email);
  return { access_token: at, refresh_token: rt, expires_in: TTL, user: { email } };
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url!, "http://x");
    const bearer = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    if (url.pathname === "/auth/v1/token" && req.method === "POST") {
      if (req.headers.apikey !== ANON) return json(res, 401, { error: "bad apikey" });
      const b = JSON.parse((await body(req)).toString() || "{}");
      if (url.searchParams.get("grant_type") === "password") {
        if (users.get(b.email) !== b.password) return json(res, 400, { error: "invalid_grant" });
        return json(res, 200, issue(b.email));
      }
      const email = refresh.get(b.refresh_token);
      if (!email) return json(res, 400, { error: "invalid_grant" });
      refresh.delete(b.refresh_token);
      return json(res, 200, issue(email));
    }
    if (url.pathname === "/auth/v1/settings") return json(res, 200, { disable_signup: true });
    if (url.pathname === "/auth/v1/user") {
      const s = sessions.get(bearer);
      if (!s || s.exp < Date.now()) return json(res, 401, { error: "invalid token" });
      return json(res, 200, { id: s.email, email: s.email, email_confirmed_at: "2026-01-01T00:00:00Z" });
    }
    if (url.pathname === "/auth/v1/logout") {
      sessions.delete(bearer);
      res.writeHead(204).end();
      return;
    }
    const up = /^\/storage\/v1\/object\/([\w-]+)\/(.+)$/.exec(url.pathname);
    if (up && req.method === "POST") {
      if (bearer !== SERVICE) return json(res, 401, { error: "unauthorized" });
      files.set(`${up[1]}/${up[2]}`, { type: String(req.headers["content-type"]), data: await body(req) });
      return json(res, 200, { Key: `${up[1]}/${up[2]}` });
    }
    const pub = /^\/storage\/v1\/object\/public\/([\w-]+)\/(.+)$/.exec(url.pathname);
    if (pub && req.method === "GET") {
      const f = files.get(`${pub[1]}/${pub[2]}`);
      if (!f) return json(res, 404, { error: "not found" });
      res.writeHead(200, { "Content-Type": f.type });
      res.end(f.data);
      return;
    }
    json(res, 404, { error: "not found" });
  })
  .listen(port, () => console.log(`mock supabase sur http://localhost:${port}`));

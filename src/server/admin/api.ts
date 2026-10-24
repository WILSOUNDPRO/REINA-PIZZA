import { NextResponse } from "next/server";
import { getAdmin } from "./auth";
import type { MenuResult } from "../menu";

/** Contrôle d'accès commun aux routes d'administration : session administrateur valide + requête de même origine. */
export async function adminGuard(req: Request): Promise<NextResponse | null> {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Accès refusé." }, { status: 401 });
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  return null;
}

export function respond(r: MenuResult<unknown>) {
  return r.ok ? NextResponse.json({ ok: true, data: r.data ?? null }) : NextResponse.json({ ok: false, error: r.message, errors: r.errors }, { status: r.status ?? 400 });
}

export const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

import { NextResponse } from "next/server";
import { getSql } from "@/server/db";
import { startPayment } from "@/server/payments";
import { allow, clientKey } from "@/server/ratelimit";
import { log } from "@/server/logger";

export async function POST(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const sql = getSql();
  if (!(await allow(sql, `tok:${await clientKey()}`, 60, 600))) return NextResponse.json({ error: "Trop de requêtes." }, { status: 429 });
  try {
    const r = await startPayment(sql, token);
    return NextResponse.json(r.ok ? { redirectUrl: (r as { redirectUrl?: string }).redirectUrl } : { error: r.message }, { status: r.ok ? 200 : 409 });
  } catch (e) {
    log("payment.start_error", { message: (e as Error).message.slice(0, 120) });
    return NextResponse.json({ error: "Impossible d'ouvrir le paiement pour le moment. Réessayez ou contactez-nous." }, { status: 502 });
  }
}

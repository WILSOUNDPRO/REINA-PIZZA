import { NextResponse } from "next/server";
import { getSql } from "@/server/db";
import { acceptFee } from "@/server/orders";
import { allow, clientKey } from "@/server/ratelimit";

export async function POST(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const sql = getSql();
  if (!(await allow(sql, `tok:${await clientKey()}`, 60, 600))) return NextResponse.json({ error: "Trop de requêtes." }, { status: 429 });
  const r = await acceptFee(sql, token);
  return NextResponse.json(r.ok ? { ok: true } : { error: r.message }, { status: r.ok ? 200 : 409 });
}

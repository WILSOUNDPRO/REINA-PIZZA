import { NextResponse } from "next/server";
import { getSql } from "@/server/db";
import { adminGuard, isUuid, respond } from "@/server/admin/api";
import { saveSizes } from "@/server/menu";

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await adminGuard(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { prices?: Record<string, unknown> } | null;
  if (!isUuid(id) || !body?.prices || typeof body.prices !== "object") return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  return respond(await saveSizes(getSql(), id, body.prices));
}

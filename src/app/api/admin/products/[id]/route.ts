import { NextResponse } from "next/server";
import { getSql } from "@/server/db";
import { adminGuard, isUuid, respond } from "@/server/admin/api";
import { deleteProduct, setArchived, setAvailability } from "@/server/menu";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const denied = await adminGuard(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { available?: unknown; archived?: unknown } | null;
  if (!isUuid(id) || !body) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const sql = getSql();
  if (typeof body.archived === "boolean") return respond(await setArchived(sql, id, body.archived));
  if (typeof body.available === "boolean") return respond(await setAvailability(sql, id, body.available));
  return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const denied = await adminGuard(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  return respond(await deleteProduct(getSql(), id));
}

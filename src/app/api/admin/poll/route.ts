import { NextResponse } from "next/server";
import { getSql } from "@/server/db";
import { getAdmin } from "@/server/admin/auth";

export const dynamic = "force-dynamic";

// Interrogé périodiquement par l'espace admin pour l'alerte de nouvelles commandes.
export async function GET() {
  if (!(await getAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [r] = await getSql()<{ unack: number; to_fee: number; latest: Date | null }[]>`
    select count(*) filter (where acknowledged_at is null)::int as unack,
           count(*) filter (where fee_status = 'to_confirm' and order_status <> 'cancelled')::int as to_fee,
           max(created_at) as latest
    from orders`;
  return NextResponse.json({ unacknowledged: r.unack, feesToConfirm: r.to_fee, latest: r.latest });
}

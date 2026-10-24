import { NextResponse } from "next/server";
import { getSql } from "@/server/db";
import { createOrder } from "@/server/orders";
import { checkoutSchema, fieldErrors } from "@/lib/validation";
import { allow, clientKey } from "@/server/ratelimit";
import { log } from "@/server/logger";

export async function POST(req: Request) {
  const sql = getSql();
  const key = await clientKey();
  if (!(await allow(sql, `order:${key}`, 10, 3600))) {
    return NextResponse.json({ error: "Trop de commandes depuis cet appareil. Réessayez plus tard ou contactez-nous sur WhatsApp." }, { status: 429 });
  }
  const raw = await req.json().catch(() => null);
  if (!raw || typeof raw !== "object") return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  if (typeof (raw as { website?: unknown }).website === "string" && (raw as { website: string }).website.trim() !== "") {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 }); // honeypot rempli : robot
  }
  const parsed = checkoutSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Vérifiez les champs signalés.", fields: fieldErrors(parsed.error) }, { status: 422 });

  try {
    const r = await createOrder(sql, parsed.data);
    if (!r.ok) {
      const status = r.code === "paused" || r.code === "currency_missing" ? 503 : 409;
      return NextResponse.json({ error: r.message, code: r.code, problems: r.problems, totalMinor: r.totalMinor }, { status });
    }
    return NextResponse.json({ ref: r.ref, token: r.token, existing: r.existing }, { status: r.existing ? 200 : 201 });
  } catch (e) {
    log("order.error", { message: (e as Error).message.slice(0, 120) });
    return NextResponse.json({ error: "Erreur inattendue. Vos informations n'ont pas été perdues : réessayez." }, { status: 500 });
  }
}

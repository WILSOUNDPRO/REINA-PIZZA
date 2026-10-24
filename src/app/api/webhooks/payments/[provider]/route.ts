import { NextResponse } from "next/server";
import { getSql } from "@/server/db";
import { activeProvider } from "@/server/payments/index";
import { InvalidWebhookError } from "@/server/payments/types";
import { applyWebhookEvent } from "@/server/payments";
import { log } from "@/server/logger";

// Seule source de vérité du paiement : une notification SIGNÉE du prestataire.
// Une simple redirection du navigateur ne change jamais le statut d'une commande.
export async function POST(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider: id } = await ctx.params;
  const provider = activeProvider();
  if (!provider || provider.id !== id) return NextResponse.json({ error: "unknown provider" }, { status: 404 });

  const raw = await req.text();
  if (raw.length > 100_000) return NextResponse.json({ error: "too large" }, { status: 413 });
  let event;
  try {
    event = provider.verifyWebhook(raw, req.headers);
  } catch (e) {
    if (e instanceof InvalidWebhookError || e instanceof SyntaxError) {
      log("webhook.rejected", { provider: id });
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }
    throw e;
  }
  try {
    const outcome = await applyWebhookEvent(getSql(), id, event);
    return NextResponse.json({ received: true, outcome });
  } catch (e) {
    // 500 : le prestataire réessaiera ; l'événement n'a pas été enregistré (transaction annulée).
    log("webhook.error", { provider: id, message: (e as Error).message.slice(0, 120) });
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}

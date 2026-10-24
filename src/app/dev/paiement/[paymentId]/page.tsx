import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { getSql } from "@/server/db";
import { simulationProvider, signSimulationPayload, SIMULATION_SIGNATURE_HEADER } from "@/server/payments/simulation";
import { env } from "@/server/env";
import { formatMoney } from "@/lib/money";
import type { Currency } from "@/lib/constants";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

async function simulate(formData: FormData) {
  "use server";
  if (!simulationProvider.isConfigured()) notFound();
  const paymentId = String(formData.get("paymentId"));
  const outcome = String(formData.get("outcome")) as "paid" | "failed" | "cancelled";
  const amountOverride = formData.get("amountMinor");
  const [p] = await getSql()<{ provider_ref: string; amount_minor: number; currency: string; token: string }[]>`
    select p.provider_ref, p.amount_minor, p.currency, o.access_token as token from payments p join orders o on o.id = p.order_id
    where p.id = ${paymentId} and p.provider = 'simulation'`;
  if (!p) notFound();
  const body = JSON.stringify({
    eventId: "sim_evt_" + crypto.randomUUID(),
    providerRef: p.provider_ref,
    status: outcome,
    amountMinor: amountOverride ? Number(amountOverride) : p.amount_minor,
    currency: p.currency,
  });
  // On passe par le vrai webhook signé, comme le ferait un prestataire.
  const h = await headers();
  const origin = env.siteUrl() || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  await fetch(`${origin}/api/webhooks/payments/simulation`, { method: "POST", headers: { [SIMULATION_SIGNATURE_HEADER]: signSimulationPayload(body), "Content-Type": "application/json" }, body });
  redirect(`/commande/${p.token}?paiement=retour`);
}

export default async function SimulatedPayment({ params }: { params: Promise<{ paymentId: string }> }) {
  if (!simulationProvider.isConfigured()) notFound(); // jamais disponible en production
  const { paymentId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(paymentId)) notFound();
  const [p] = await getSql()<{ amount_minor: number; currency: Currency; status: string }[]>`select amount_minor, currency, status from payments where id = ${paymentId} and provider = 'simulation'`;
  if (!p) notFound();
  return (
    <main className="mx-auto max-w-md p-6">
      <div className="rounded-2xl border-4 border-dashed border-tomato bg-paper p-6">
        <p className="font-black uppercase tracking-wide text-tomato">Simulation de paiement — développement uniquement</p>
        <p className="mt-2 text-sm">Aucun argent réel n'est utilisé. Cette page n'existe pas en production.</p>
        <p className="mt-4 text-3xl font-black">{formatMoney(p.amount_minor, p.currency)}</p>
        <form action={simulate} className="mt-4 space-y-3">
          <input type="hidden" name="paymentId" value={paymentId} />
          <button name="outcome" value="paid" className="btn btn-basil btn-lg">Simuler un paiement réussi</button>
          <button name="outcome" value="failed" className="btn btn-ghost btn-lg">Simuler un échec</button>
          <button name="outcome" value="cancelled" className="btn btn-ghost btn-lg">Simuler une annulation</button>
        </form>
      </div>
    </main>
  );
}

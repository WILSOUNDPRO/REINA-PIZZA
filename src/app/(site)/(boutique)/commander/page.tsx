import type { Metadata } from "next";
import Link from "next/link";
import { CheckoutForm } from "@/components/CheckoutForm";
import { getSql } from "@/server/db";
import { getSettings } from "@/server/settings";
import { getActiveZones, getEnabledPaymentMethods } from "@/server/catalog";
import { env } from "@/server/env";

export const metadata: Metadata = { title: "Livraison", robots: { index: false } };

export default async function CheckoutPage() {
  const sql = getSql();
  const [s, zones, methods] = await Promise.all([getSettings(sql), getActiveZones(sql), getEnabledPaymentMethods(sql)]);
  const blocked = s.orders_paused ? s.pause_message || "Les commandes sont temporairement suspendues." : !s.currency ? "La devise du restaurant n'est pas encore configurée : les commandes sont indisponibles." : null;
  return (
    <div className="mx-auto max-w-5xl px-4 pt-8">
      <h1 className="mb-6 text-3xl font-extrabold sm:text-4xl">Votre livraison</h1>
      {blocked || !s.currency ? (
        <div role="alert" className="card p-6">
          <p className="font-bold">{blocked}</p>
          <Link href="/panier" className="btn btn-ghost mt-4">Retour au panier</Link>
        </div>
      ) : (
        <CheckoutForm zones={zones} currency={s.currency} emailEnabled={env.emailEnabled()} paymentMethods={methods} />
      )}
    </div>
  );
}

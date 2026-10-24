import type { Metadata } from "next";
import { CartView } from "@/components/CartView";
import { getSql } from "@/server/db";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Panier" };

export default async function CartPage() {
  const s = await getSettings(getSql());
  const reason = s.orders_paused ? s.pause_message || "Les commandes sont temporairement suspendues." : !s.currency ? "La devise du restaurant n'est pas encore configurée." : undefined;
  return (
    <div className="mx-auto max-w-5xl px-4 pt-8">
      <h1 className="mb-6 text-4xl font-extrabold">Votre panier</h1>
      <CartView currency={s.currency} canOrder={!reason} blockedReason={reason} />
    </div>
  );
}

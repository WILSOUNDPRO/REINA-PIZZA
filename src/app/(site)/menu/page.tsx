import type { Metadata } from "next";
import Link from "next/link";
import { getSql } from "@/server/db";
import { getPublicCatalog } from "@/server/catalog";
import { getSettings } from "@/server/settings";
import { ProductCard } from "@/components/ProductCard";

export const metadata: Metadata = { title: "Menu" };

export default async function MenuPage() {
  const sql = getSql();
  const [{ products, extras }, settings] = await Promise.all([getPublicCatalog(sql), getSettings(sql)]);
  const groups = new Map<string, typeof products>();
  for (const p of products) {
    const k = p.category_name ?? "Nos pizzas";
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8">
      <h1 className="text-4xl font-extrabold sm:text-5xl">Le menu</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">Choisissez votre taille et ajoutez au panier. Le paiement est organisé directement avec la pizzeria après l'enregistrement de votre commande.</p>

      {settings.orders_paused && (
        <div role="alert" className="mt-4 rounded-2xl bg-tomato p-4 font-bold text-white">
          {settings.pause_message || "Les commandes sont temporairement suspendues."}
        </div>
      )}
      {!settings.currency && (
        <div role="note" className="mt-4 rounded-2xl bg-cream-2 p-4 text-sm">La devise des prix reste à confirmer : les commandes ne sont pas encore ouvertes.</div>
      )}

      {products.length === 0 ? (
        <div className="card mt-8 p-8 text-center">
          <p className="font-display text-2xl font-bold">Le menu arrive bientôt.</p>
          <p className="mt-2 text-ink-soft">En attendant, contactez-nous directement.</p>
          <Link href="/#infos" className="btn btn-primary mt-4">Voir nos coordonnées</Link>
        </div>
      ) : (
        [...groups].map(([name, list]) => (
          <section key={name} className="mt-10" aria-labelledby={`cat-${name}`}>
            <h2 id={`cat-${name}`} className="mb-4 text-2xl font-bold text-tomato">{name}</h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((p) => (
                <ProductCard key={p.id} p={p} extras={extras} currency={settings.currency} orderable={!settings.orders_paused && !!settings.currency} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

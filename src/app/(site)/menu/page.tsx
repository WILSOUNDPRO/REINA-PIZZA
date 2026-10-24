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
  // Les intitulés de catégories n'apparaissent que s'il y en a plusieurs.
  const groups = new Map<string, typeof products>();
  for (const p of products) groups.set(p.category_name ?? "Nos pizzas", [...(groups.get(p.category_name ?? "Nos pizzas") ?? []), p]);
  const showHeadings = groups.size > 1;
  const orderable = !settings.orders_paused && !!settings.currency;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8">
      <h1 className="text-3xl font-extrabold sm:text-4xl">Choisissez votre pizza</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">Ajoutez vos pizzas au panier, puis renseignez votre livraison. Aucun paiement n'est effectué sur le site : il est organisé directement avec Reina Pizza.</p>

      {settings.orders_paused && <div role="alert" className="mt-4 rounded-xl bg-tomato p-4 font-semibold text-white">{settings.pause_message || "Les commandes sont temporairement suspendues."}</div>}
      {!settings.currency && <div role="note" className="mt-4 rounded-xl bg-cream-2 p-4 text-sm">La devise des prix reste à confirmer : les commandes ne sont pas encore ouvertes.</div>}

      {products.length === 0 ? (
        <div className="card mt-8 p-8 text-center">
          <p className="text-2xl font-extrabold">Le menu arrive bientôt.</p>
          <p className="mt-2 text-ink-soft">En attendant, contactez-nous directement.</p>
          <Link href="/#contact" className="btn btn-primary mt-4">Voir nos coordonnées</Link>
        </div>
      ) : (
        [...groups].map(([name, list]) => (
          <section key={name} className="mt-8" aria-label={showHeadings ? undefined : "Pizzas"} aria-labelledby={showHeadings ? `cat-${name}` : undefined}>
            {showHeadings && <h2 id={`cat-${name}`} className="mb-4 text-2xl font-extrabold">{name}</h2>}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((p) => <ProductCard key={p.id} p={p} extras={extras} currency={settings.currency} orderable={orderable} />)}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

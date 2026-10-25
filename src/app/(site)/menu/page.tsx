import type { Metadata } from "next";
import Link from "next/link";
import { getSql } from "@/server/db";
import { getPublicCatalog } from "@/server/catalog";
import { getSettings } from "@/server/settings";
import { ProductCard } from "@/components/ProductCard";

export const metadata: Metadata = { title: "Menu" };

const slug = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default async function MenuPage({ searchParams }: { searchParams: Promise<{ categorie?: string }> }) {
  const { categorie } = await searchParams;
  const sql = getSql();
  const [{ products, extras }, settings] = await Promise.all([getPublicCatalog(sql), getSettings(sql)]);

  // Catégories réellement présentes (ordre du catalogue) ; « Tout » affiche chacune avec son titre.
  const cats: { name: string; slug: string }[] = [];
  for (const p of products) {
    const name = p.category_name ?? "Nos produits";
    if (!cats.some((c) => c.name === name)) cats.push({ name, slug: slug(name) });
  }
  const active = cats.find((c) => c.slug === categorie) ?? null;
  const groups = new Map<string, typeof products>();
  for (const p of products) {
    const name = p.category_name ?? "Nos produits";
    if (active && name !== active.name) continue;
    groups.set(name, [...(groups.get(name) ?? []), p]);
  }
  const showHeadings = groups.size > 1;
  const orderable = !settings.orders_paused && !!settings.currency;
  const tab = (on: boolean) => `inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-bold transition-colors ${on ? "border-tomato bg-tomato text-white" : "border-[#cfc8bd] bg-white hover:border-ink"}`;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8">
      <h1 className="text-3xl font-extrabold sm:text-4xl">Choisissez votre commande</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">Ajoutez vos produits au panier, puis renseignez votre livraison. Aucun paiement n'est effectué sur le site : il est organisé directement avec Reina Pizza.</p>

      {settings.orders_paused && <div role="alert" className="mt-4 rounded-xl bg-tomato p-4 font-semibold text-white">{settings.pause_message || "Les commandes sont temporairement suspendues."}</div>}
      {!settings.currency && <div role="note" className="mt-4 rounded-xl bg-cream-2 p-4 text-sm">La devise des prix reste à confirmer : les commandes ne sont pas encore ouvertes.</div>}

      {cats.length > 1 && (
        // Défilement horizontal contenu dans la barre elle-même : la page ne déborde jamais sur mobile.
        <nav aria-label="Catégories" className="mt-5">
          <ul className="flex gap-2 overflow-x-auto pb-1">
            <li className="shrink-0"><Link href="/menu" className={tab(!active)} aria-current={!active ? "page" : undefined}>Tout</Link></li>
            {cats.map((c) => <li key={c.slug} className="shrink-0"><Link href={`/menu?categorie=${c.slug}`} className={tab(active?.slug === c.slug)} aria-current={active?.slug === c.slug ? "page" : undefined}>{c.name}</Link></li>)}
          </ul>
        </nav>
      )}

      {products.length === 0 ? (
        <div className="card mt-8 p-8 text-center">
          <p className="text-2xl font-extrabold">Le menu arrive bientôt.</p>
          <p className="mt-2 text-ink-soft">En attendant, contactez-nous directement.</p>
          <Link href="/#contact" className="btn btn-primary mt-4">Voir nos coordonnées</Link>
        </div>
      ) : (
        [...groups].map(([name, list]) => (
          <section key={name} className="mt-8" aria-label={showHeadings ? undefined : name} aria-labelledby={showHeadings ? `cat-${slug(name)}` : undefined}>
            {showHeadings && <h2 id={`cat-${slug(name)}`} className="mb-4 text-2xl font-extrabold">{name}</h2>}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((p) => <ProductCard key={p.id} p={p} extras={extras} currency={settings.currency} orderable={orderable} />)}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

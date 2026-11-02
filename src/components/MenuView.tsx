"use client";

import { useState } from "react";
import { ProductCard } from "./ProductCard";
import type { CatalogExtra, CatalogProduct } from "@/server/catalog";
import type { Currency } from "@/lib/constants";

export const categorySlug = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Menu par catégories. Le filtre se fait dans le navigateur (aucun aller-retour serveur) : instantané même sur une connexion lente.
 * L'adresse /menu?categorie=burgers reste valide et sélectionne la catégorie au chargement.
 */
export function MenuView({ products, extras, currency, orderable, initial }: { products: CatalogProduct[]; extras: CatalogExtra[]; currency: Currency | null; orderable: boolean; initial: string | null }) {
  const cats = [...new Set(products.map((p) => p.category_name ?? "Nos produits"))].map((name) => ({ name, slug: categorySlug(name) }));
  const [active, setActive] = useState<string | null>(cats.some((c) => c.slug === initial) ? initial : null);
  const select = (slug: string | null) => {
    setActive(slug);
    try { window.history.replaceState(null, "", slug ? `/menu?categorie=${slug}` : "/menu"); } catch { /* sans effet */ }
  };
  // Vrais liens : sans JavaScript (page pas encore « hydratée » sur connexion lente) ils chargent la page filtrée ; avec JavaScript, le filtre est instantané.
  const go = (e: React.MouseEvent, slug: string | null) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    select(slug);
  };
  const groups = new Map<string, CatalogProduct[]>();
  for (const p of products) {
    const name = p.category_name ?? "Nos produits";
    if (active && categorySlug(name) !== active) continue;
    groups.set(name, [...(groups.get(name) ?? []), p]);
  }
  const showHeadings = groups.size > 1;
  const tab = (on: boolean) => `inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-bold transition-colors ${on ? "border-tomato bg-tomato text-white" : "border-[#cfc8bd] bg-white hover:border-ink"}`;
  return (
    <>
      {cats.length > 1 && (
        // Défilement horizontal contenu dans la barre elle-même : la page ne déborde jamais sur mobile.
        <nav aria-label="Catégories" className="mt-5">
          <ul className="flex gap-2 overflow-x-auto pb-1">
            <li className="shrink-0"><a href="/menu" className={tab(!active)} aria-current={!active ? "page" : undefined} onClick={(e) => go(e, null)}>Tout</a></li>
            {cats.map((c) => <li key={c.slug} className="shrink-0"><a href={`/menu?categorie=${c.slug}`} className={tab(active === c.slug)} aria-current={active === c.slug ? "page" : undefined} onClick={(e) => go(e, c.slug)}>{c.name}</a></li>)}
          </ul>
        </nav>
      )}
      {[...groups].map(([name, list]) => (
        <section key={name} className="mt-8" aria-label={showHeadings ? undefined : name} aria-labelledby={showHeadings ? `cat-${categorySlug(name)}` : undefined}>
          {showHeadings && <h2 id={`cat-${categorySlug(name)}`} className="mb-4 text-2xl font-extrabold">{name}</h2>}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((p) => <ProductCard key={p.id} p={p} extras={extras} currency={currency} orderable={orderable} />)}
          </div>
        </section>
      ))}
    </>
  );
}

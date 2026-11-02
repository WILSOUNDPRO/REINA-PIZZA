"use client";

import { useState } from "react";
import { Drumstick, LayoutGrid, Pizza, Sandwich, UtensilsCrossed } from "lucide-react";
import { ProductCard } from "./ProductCard";
import { categorySlug } from "./MenuView";
import type { CatalogExtra, CatalogProduct } from "@/server/catalog";
import type { Currency } from "@/lib/constants";

const iconFor = (name: string) => {
  const n = name.toLowerCase();
  return n.includes("pizza") ? Pizza : n.includes("burger") ? Sandwich : n.includes("wing") ? Drumstick : UtensilsCrossed;
};

/** Menu de l'accueil : mêmes cartes (prix, tailles, portions, panier) que la page Menu, avec filtre par catégorie sans rechargement. */
export function HomeMenu({ products, extras, currency, orderable }: { products: CatalogProduct[]; extras: CatalogExtra[]; currency: Currency | null; orderable: boolean }) {
  const cats = [...new Set(products.map((p) => p.category_name ?? "Nos produits"))];
  const [active, setActive] = useState<string | null>(null);
  const shown = products.filter((p) => !active || (p.category_name ?? "Nos produits") === active);
  // Vrais liens vers le menu filtré (fonctionnent avant l'hydratation) ; filtre instantané une fois la page prête.
  const go = (e: React.MouseEvent, cat: string | null) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    setActive(cat);
  };
  const tab = (on: boolean) => `inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-bold transition-colors ${on ? "bg-tomato text-[#141008] shadow-[0_2px_10px_rgb(245_181_27/.4)]" : "text-ink-soft hover:text-white"}`;
  return (
    <>
      {cats.length > 1 && (
        <div className="mt-6 flex justify-center">
          <ul className="glass flex max-w-full gap-1 overflow-x-auto rounded-full p-1" aria-label="Catégories du menu">
            <li><a href="/menu" className={tab(!active)} aria-current={!active ? "true" : undefined} onClick={(e) => go(e, null)}><LayoutGrid size={16} aria-hidden="true" />Tout</a></li>
            {cats.map((c) => { const Icon = iconFor(c); return <li key={c}><a href={`/menu?categorie=${categorySlug(c)}`} className={tab(active === c)} aria-current={active === c ? "true" : undefined} onClick={(e) => go(e, c)}><Icon size={16} aria-hidden="true" />{c}</a></li>; })}
          </ul>
        </div>
      )}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((p) => <ProductCard key={p.id} p={p} extras={extras} currency={currency} orderable={orderable} />)}
      </div>
    </>
  );
}

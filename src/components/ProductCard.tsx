"use client";

import Image from "next/image";
import { useState } from "react";
import { useCart } from "./CartProvider";
import { PizzaMark } from "./PizzaMark";
import { formatMoney } from "@/lib/money";
import { SIZE_HINT } from "@/lib/labels";
import { MAX_LINE_QUANTITY, SIZES, type Currency, type Size } from "@/lib/constants";
import type { CatalogExtra, CatalogProduct } from "@/server/catalog";

// Cadrage uniforme : le conteneur impose le format, l'image est recadrée (object-cover) sans déformation.
function isLocalHost(url: string) {
  try { const h = new URL(url).hostname; return h === "localhost" || h === "127.0.0.1"; } catch { return false; }
}

export function ProductImage({ url, name, className = "", sizes = "(max-width: 640px) 100vw, 400px", priority = false }: { url: string | null; name: string; className?: string; sizes?: string; priority?: boolean }) {
  if (url) {
    return (
      <div className={`relative overflow-hidden bg-cream-2 ${className}`}>
        <Image src={url} alt={name} fill sizes={sizes} priority={priority} quality={80} unoptimized={isLocalHost(url)} className="object-cover" />
      </div>
    );
  }
  return (
    <div className={`grid place-items-center bg-cream-2 text-ink-soft ${className}`} role="img" aria-label={`Photo de ${name} à venir`}>
      <div className="flex flex-col items-center gap-1">
        <PizzaMark className="h-16 w-16 opacity-60" />
        <span className="text-xs font-bold">Photo à venir</span>
      </div>
    </div>
  );
}

export function ProductCard({ p, extras, currency, orderable }: { p: CatalogProduct; extras: CatalogExtra[]; currency: Currency | null; orderable: boolean }) {
  const { add } = useCart();
  const [size, setSize] = useState<Size>(p.sizes[0].size);
  const [qty, setQty] = useState(1);
  const [chosen, setChosen] = useState<string[]>([]);
  const [added, setAdded] = useState(false);

  const base = p.sizes.find((s) => s.size === size)!.price_minor;
  const unit = base + extras.filter((e) => chosen.includes(e.id)).reduce((a, e) => a + e.price_minor, 0);

  function onAdd() {
    add({ productId: p.id, size, quantity: qty, extraIds: chosen });
    setAdded(true);
    setQty(1);
    setTimeout(() => setAdded(false), 1600);
  }

  return (
    <article className="card fade-up flex flex-col overflow-hidden">
      <ProductImage url={p.image_url} name={p.name} className="aspect-[4/3] w-full" />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="text-xl font-bold leading-tight">{p.name}</h3>
          {p.description && <p className="mt-1 text-sm text-ink-soft">{p.description}</p>}
        </div>

        <fieldset>
          <legend className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-soft">Taille</legend>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(4.75rem,1fr))] gap-2">
            {SIZES.map((sz) => {
              const priced = p.sizes.find((x) => x.size === sz);
              if (!priced) {
                return (
                  <div key={sz} aria-disabled="true" title={`La taille ${sz} n'a pas encore de prix : elle n'est pas disponible à la commande.`} className="cursor-not-allowed rounded-2xl border-2 border-dashed border-line px-2 py-2 text-center text-ink-soft opacity-70">
                    <span className="block text-base font-extrabold">{sz}</span>
                    <span className="block text-xs font-semibold">Prix à venir</span>
                  </div>
                );
              }
              return (
                <label key={sz} title={SIZE_HINT[sz]} className={`cursor-pointer rounded-2xl border-2 px-2 py-2 text-center transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-basil ${size === sz ? "border-tomato bg-tomato text-white" : "border-line bg-paper hover:border-ink"}`}>
                  <input type="radio" name={`size-${p.id}`} className="sr-only" checked={size === sz} onChange={() => setSize(sz)} />
                  <span className="block text-base font-extrabold">{sz}</span>
                  <span className="block text-xs font-semibold">{formatMoney(priced.price_minor, currency)}</span>
                </label>
              );
            })}
          </div>
          {p.sizes.length < SIZES.length && <p className="mt-1.5 text-xs text-ink-soft">Les tailles « Prix à venir » ne sont pas encore disponibles à la commande.</p>}
        </fieldset>

        {extras.length > 0 && (
          <fieldset>
            <legend className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-soft">Suppléments (facultatif)</legend>
            <div className="space-y-1">
              {extras.map((e) => (
                <label key={e.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-1">
                  <input type="checkbox" className="h-5 w-5 accent-[#2d6a3e]" checked={chosen.includes(e.id)} onChange={(ev) => setChosen((c) => (ev.target.checked ? [...c, e.id] : c.filter((x) => x !== e.id)))} />
                  <span className="flex-1 text-sm">{e.name}</span>
                  <span className="text-sm font-semibold">+ {formatMoney(e.price_minor, currency)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="mt-auto flex items-center gap-3 pt-1">
          <div className="flex items-center gap-1" role="group" aria-label="Quantité">
            <button type="button" className="stepper-btn" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Moins">−</button>
            <span className="w-8 text-center text-lg font-bold" aria-live="polite">{qty}</span>
            <button type="button" className="stepper-btn" onClick={() => setQty((q) => Math.min(MAX_LINE_QUANTITY, q + 1))} aria-label="Plus">+</button>
          </div>
          <button type="button" onClick={onAdd} disabled={!orderable} className={`btn flex-1 ${added ? "btn-basil" : "btn-primary"}`}>
            {added ? "Ajouté ✓" : <>Ajouter · {formatMoney(unit * qty, currency)}</>}
          </button>
        </div>
        <p className="sr-only" aria-live="polite">{added ? `${p.name} ajouté au panier` : ""}</p>
      </div>
    </article>
  );
}

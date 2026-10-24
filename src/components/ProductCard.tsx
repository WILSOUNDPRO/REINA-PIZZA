"use client";

import { useState } from "react";
import { useCart } from "./CartProvider";
import { PizzaMark } from "./PizzaMark";
import { formatMoney } from "@/lib/money";
import { SIZE_HINT } from "@/lib/labels";
import { MAX_LINE_QUANTITY, type Currency, type Size } from "@/lib/constants";
import type { CatalogExtra, CatalogProduct } from "@/server/catalog";

export function ProductImage({ url, name, className = "" }: { url: string | null; name: string; className?: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} loading="lazy" decoding="async" className={`object-cover ${className}`} />;
  }
  return (
    <div className={`grid place-items-center bg-cream-2 text-ink-soft ${className}`} role="img" aria-label={`Photo de ${name} à venir`}>
      <div className="flex flex-col items-center gap-1">
        <PizzaMark className="h-16 w-16 opacity-70" />
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
          {p.is_demo && <span className="badge mt-1 bg-cream-2 text-ink-soft">Produit de démonstration</span>}
          {p.description && <p className="mt-1 text-sm text-ink-soft">{p.description}</p>}
        </div>

        <fieldset>
          <legend className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-soft">Taille</legend>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(4.5rem,1fr))] gap-2">
            {p.sizes.map((s) => (
              <label key={s.size} title={SIZE_HINT[s.size]} className={`cursor-pointer rounded-2xl border-2 px-2 py-2 text-center transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-basil ${size === s.size ? "border-tomato bg-tomato text-white" : "border-line bg-paper hover:border-ink"}`}>
                <input type="radio" name={`size-${p.id}`} className="sr-only" checked={size === s.size} onChange={() => setSize(s.size)} />
                <span className="block text-base font-extrabold">{s.size}</span>
                <span className="block text-xs font-semibold">{formatMoney(s.price_minor, currency)}</span>
              </label>
            ))}
          </div>
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

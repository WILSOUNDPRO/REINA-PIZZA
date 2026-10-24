"use client";

import Image from "next/image";
import { useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { useCart } from "./CartProvider";
import { LogoSymbol } from "./Logo";
import { formatMoney } from "@/lib/money";
import { SIZE_HINT } from "@/lib/labels";
import { MAX_LINE_QUANTITY, SIZES, type Currency, type Size } from "@/lib/constants";
import type { CatalogExtra, CatalogProduct } from "@/server/catalog";

function isLocalHost(url: string) {
  try { const h = new URL(url).hostname; return h === "localhost" || h === "127.0.0.1"; } catch { return false; }
}

/**
 * Cadrage uniforme : le conteneur impose le format (la classe reçue fixe la taille), l'image est recadrée (object-cover) sans déformation.
 * Sans photo : un emplacement discret avec le symbole de la marque, sans fausse photo.
 */
export function ProductImage({ url, name, className = "", sizes = "(max-width: 640px) 100vw, 400px", priority = false }: { url: string | null; name: string; className?: string; sizes?: string; priority?: boolean }) {
  if (url) {
    return (
      <div className={`relative overflow-hidden bg-cream-2 ${className}`}>
        <Image src={url} alt={name} fill sizes={sizes} priority={priority} quality={80} unoptimized={isLocalHost(url)} className="object-cover" />
      </div>
    );
  }
  return (
    <div className={`grid place-items-center bg-cream-2 ${className}`} role="img" aria-label={`Photo de ${name} bientôt disponible`}>
      <LogoSymbol className="h-1/2 max-h-12 w-auto opacity-25" />
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
    setTimeout(() => setAdded(false), 1800);
  }

  return (
    <article id={`p-${p.id}`} className="card fade-up flex flex-col overflow-hidden">
      <ProductImage url={p.image_url} name={p.name} className={p.image_url ? "aspect-[4/3] w-full" : "h-24 w-full"} />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="text-xl font-extrabold">{p.name}</h3>
          {p.description && <p className="mt-1 text-sm text-ink-soft">{p.description}</p>}
        </div>

        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">Taille</legend>
          <div className="flex flex-wrap gap-2">
            {SIZES.map((sz) => {
              const priced = p.sizes.find((x) => x.size === sz);
              if (!priced) {
                return (
                  <div key={sz} aria-disabled="true" title={`La taille ${sz} n'a pas encore de prix : elle n'est pas disponible à la commande.`} className="min-w-[4.25rem] cursor-not-allowed rounded-xl border border-dashed border-line px-3 py-2 text-center text-ink-soft opacity-60">
                    <span className="block text-sm font-bold">{sz}</span>
                    <span className="block text-[11px]">Indisponible</span>
                  </div>
                );
              }
              return (
                <label key={sz} title={SIZE_HINT[sz]} className={`min-w-[4.25rem] cursor-pointer rounded-xl border px-3 py-2 text-center transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-basil ${size === sz ? "border-tomato bg-tomato text-white" : "border-[#cfc8bd] bg-white hover:border-ink"}`}>
                  <input type="radio" name={`size-${p.id}`} className="sr-only" checked={size === sz} onChange={() => setSize(sz)} />
                  <span className="block text-sm font-bold">{sz}</span>
                  <span className="block text-xs font-semibold">{formatMoney(priced.price_minor, currency)}</span>
                </label>
              );
            })}
          </div>
          {p.sizes.length < SIZES.length && <p className="mt-1.5 text-xs text-ink-soft">Les autres tailles seront proposées dès que leur prix sera confirmé.</p>}
        </fieldset>

        {extras.length > 0 && (
          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">Suppléments (facultatif)</legend>
            <div className="space-y-1">
              {extras.map((e) => (
                <label key={e.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-1">
                  <input type="checkbox" className="h-5 w-5 accent-[#921f24]" checked={chosen.includes(e.id)} onChange={(ev) => setChosen((c) => (ev.target.checked ? [...c, e.id] : c.filter((x) => x !== e.id)))} />
                  <span className="flex-1 text-sm">{e.name}</span>
                  <span className="text-sm font-semibold">+ {formatMoney(e.price_minor, currency)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-3 pt-1">
          <div className="flex items-center gap-1" role="group" aria-label={`Quantité de ${p.name}`}>
            <button type="button" className="stepper-btn" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Retirer une pizza"><Minus size={18} aria-hidden="true" /></button>
            <span className="w-8 text-center text-lg font-bold" aria-live="polite">{qty}</span>
            <button type="button" className="stepper-btn" onClick={() => setQty((q) => Math.min(MAX_LINE_QUANTITY, q + 1))} aria-label="Ajouter une pizza"><Plus size={18} aria-hidden="true" /></button>
          </div>
          <button type="button" onClick={onAdd} disabled={!orderable} className={`btn min-w-0 flex-1 ${added ? "btn-basil" : "btn-primary"}`}>
            {added ? <><Check size={18} aria-hidden="true" />Ajouté</> : <>Ajouter au panier · {formatMoney(unit * qty, currency)}</>}
          </button>
        </div>
        <p className="sr-only" role="status">{added ? `${p.name} ajouté au panier` : ""}</p>
      </div>
    </article>
  );
}

"use client";

import Link from "next/link";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useCart } from "./CartProvider";
import { useServerCart } from "./useServerCart";
import { ProductImage } from "./ProductCard";
import { formatMoney } from "@/lib/money";
import { lineKey } from "@/lib/cart";
import { lineOption } from "@/lib/productSale";
import type { Currency, Size } from "@/lib/constants";

export function CartView({ currency, canOrder, blockedReason }: { currency: Currency | null; canOrder: boolean; blockedReason?: string }) {
  const { items, ready, setQuantity, setSize, remove } = useCart();
  const { data, loading, error } = useServerCart(items, ready);

  if (!ready || (loading && !data)) return <p className="card p-8 text-center text-ink-soft" aria-busy="true">Chargement du panier…</p>;

  if (items.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-2xl font-extrabold">Votre panier est vide.</p>
        <p className="mt-1 text-ink-soft">Ajoutez une pizza pour commencer.</p>
        <Link href="/menu" className="btn btn-primary mt-4">Voir le menu</Link>
      </div>
    );
  }
  if (error && !data) return <p role="alert" className="card p-6">Impossible de vérifier les prix pour le moment. Vérifiez votre connexion et rechargez la page.</p>;

  const lines = data?.lines ?? [];
  const problems = data?.problems ?? [];
  const blocked = problems.length > 0 || lines.length === 0 || loading || !canOrder;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-3">
        {problems.map((p) => (
          <div key={p.key} role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-tomato bg-white p-4">
            <p className="text-sm"><strong>{p.productName}</strong> {p.reason === "not_configured" ? "n'est pas encore disponible à la commande." : p.reason === "variant_required" ? "demande de choisir une portion : retirez-le puis ajoutez-le depuis le menu." : "n'est plus disponible à la commande."}</p>
            <button className="btn btn-ghost !min-h-11 text-sm" onClick={() => remove(p.key)}>Retirer</button>
          </div>
        ))}
        {lines.map((l) => (
          <article key={l.key} className="card flex gap-3 p-3 sm:p-4">
            <ProductImage url={l.imageUrl} defaultImage={l.defaultImage} name={l.productName} className="h-[60px] w-20 shrink-0 rounded-xl sm:h-[72px] sm:w-24" sizes="96px" showBadge={false} />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-base font-extrabold leading-tight sm:text-lg">{l.productName}</h2>
                <button className="-mr-2 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-ink-soft hover:bg-cream-2 hover:text-tomato" onClick={() => remove(l.key)} aria-label={`Supprimer ${l.productName} du panier`}><Trash2 size={18} aria-hidden="true" /></button>
              </div>
              {l.extras.length > 0 && <p className="text-xs text-ink-soft">+ {l.extras.map((e) => e.name).join(", ")}</p>}
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
                {(l.size || l.optionLabel) && <label className="flex items-center gap-2 text-sm">
                  {l.size && <span className="text-ink-soft">Taille</span>}
                  {l.size && l.availableSizes.length > 1 ? (
                    <select className="field !min-h-11 !w-auto !py-1" value={l.size} onChange={(e) => setSize(lineKey({ productId: l.productId, size: l.size ?? undefined, variantId: l.variantId ?? undefined, extraIds: l.extras.map((x) => x.id) }), e.target.value as Size)}>
                      {l.availableSizes.map((s) => <option key={s.size} value={s.size}>{s.size} · {formatMoney(s.priceMinor, currency)}</option>)}
                    </select>
                  ) : <strong>{lineOption({ size: l.size, option_label: l.optionLabel })}</strong>}
                </label>}
                <div className="flex items-center gap-1" role="group" aria-label={`Quantité de ${l.productName}`}>
                  <button className="stepper-btn" onClick={() => setQuantity(l.key, l.quantity - 1)} aria-label="Retirer une pizza"><Minus size={16} aria-hidden="true" /></button>
                  <span className="w-8 text-center font-bold" aria-live="polite">{l.quantity}</span>
                  <button className="stepper-btn" onClick={() => setQuantity(l.key, l.quantity + 1)} aria-label="Ajouter une pizza"><Plus size={16} aria-hidden="true" /></button>
                </div>
                <p className="ml-auto text-lg font-extrabold">{formatMoney(l.lineTotalMinor, currency)}</p>
              </div>
            </div>
          </article>
        ))}
      </div>

      <aside className="card h-fit space-y-3 p-5 lg:sticky lg:top-24" aria-label="Récapitulatif">
        <div className="flex justify-between text-lg"><span>Sous-total des produits</span><strong>{formatMoney(data?.subtotalMinor ?? 0, currency)}</strong></div>
        <p className="text-sm text-ink-soft">Frais de livraison : indiqués à l'étape suivante si votre zone est tarifée, sinon à confirmer selon votre adresse. Aucun paiement n'est effectué sur le site.</p>
        {!canOrder && <p role="alert" className="rounded-xl bg-tomato p-3 text-sm font-semibold text-white">{blockedReason}</p>}
        <Link href="/commander" aria-disabled={blocked} className={`btn btn-primary btn-lg ${blocked ? "pointer-events-none opacity-50" : ""}`} tabIndex={blocked ? -1 : 0}>Renseigner ma livraison</Link>
        <Link href="/menu" className="flex min-h-11 items-center justify-center text-sm font-bold underline">Ajouter d'autres pizzas</Link>
      </aside>
    </div>
  );
}

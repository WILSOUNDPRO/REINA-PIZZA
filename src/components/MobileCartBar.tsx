"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, ShoppingCart } from "lucide-react";
import { useCart } from "./CartProvider";
import { useServerCart } from "./useServerCart";
import { formatMoney } from "@/lib/money";
import type { Currency } from "@/lib/constants";

// Barre de panier fixe sur téléphone, uniquement si le panier contient des articles. Le sous-total vient du serveur.
export function MobileCartBar({ currency }: { currency: Currency | null }) {
  const { items, count, ready } = useCart();
  const path = usePathname();
  const hidden = !ready || count === 0 || path.startsWith("/panier") || path.startsWith("/commander") || path.startsWith("/commande/");
  const { data, loading } = useServerCart(hidden ? [] : items, ready && !hidden);
  if (hidden) return null;
  return (
    <>
      <div className="h-24 sm:hidden" aria-hidden="true" />{/* réserve la place : aucun contenu masqué */}
      <div className="no-print fixed inset-x-0 bottom-0 z-40 p-3 sm:hidden" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <Link href="/panier" className="btn btn-primary btn-lg !justify-between shadow-lg">
          <span className="flex items-center gap-2"><ShoppingCart size={20} aria-hidden="true" />{count} article{count > 1 ? "s" : ""}</span>
          <span className="flex items-center gap-1">{data && !loading ? formatMoney(data.subtotalMinor, currency) : "…"}<ChevronRight size={18} aria-hidden="true" /></span>
        </Link>
      </div>
    </>
  );
}

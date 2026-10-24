"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { useCart } from "./CartProvider";

export function CartLink() {
  const { count, ready } = useCart();
  const n = ready ? count : 0;
  return (
    <Link href="/panier" className="btn btn-ghost relative !px-3" aria-label={n > 0 ? `Panier, ${n} article${n > 1 ? "s" : ""}` : "Panier, vide"}>
      <ShoppingCart size={20} aria-hidden="true" />
      <span className="hidden sm:inline">Panier</span>
      {n > 0 && <span key={n} className="pop absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-tomato px-1 text-xs font-bold text-white">{n}</span>}
    </Link>
  );
}

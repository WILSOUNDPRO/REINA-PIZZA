"use client";

import Link from "next/link";
import { useCart } from "./CartProvider";

export function CartLink() {
  const { count, ready } = useCart();
  return (
    <Link href="/panier" className="btn btn-ghost !min-h-11 !px-4 relative" aria-label={`Panier${ready ? `, ${count} article${count > 1 ? "s" : ""}` : ""}`}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M6 7h12l-1 12H7L6 7zM9 7a3 3 0 016 0" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="hidden sm:inline">Panier</span>
      {ready && count > 0 && (
        <span key={count} className="pop absolute -right-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-tomato px-1 text-xs font-bold text-white">{count}</span>
      )}
    </Link>
  );
}

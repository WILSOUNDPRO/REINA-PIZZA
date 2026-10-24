"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "./CartProvider";

// Panier toujours accessible au pouce sur téléphone.
export function MobileCartBar() {
  const { count, ready } = useCart();
  const path = usePathname();
  if (!ready || count === 0 || path.startsWith("/panier") || path.startsWith("/commander") || path.startsWith("/commande/")) return null;
  return (
    <div className="no-print fixed inset-x-0 bottom-0 z-40 p-3 sm:hidden" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
      <Link href="/panier" className="btn btn-primary btn-lg shadow-lg">
        Voir mon panier · {count} article{count > 1 ? "s" : ""}
      </Link>
    </div>
  );
}

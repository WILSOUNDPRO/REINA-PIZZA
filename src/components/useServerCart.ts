"use client";

import { useEffect, useState } from "react";
import type { CartItem } from "@/lib/cart";
import type { Size } from "@/lib/constants";

export type ServerLine = {
  key: string;
  productId: string;
  productName: string;
  imageUrl: string | null;
  size: Size;
  quantity: number;
  unitPriceMinor: number;
  extras: { id: string; name: string; price_minor: number }[];
  lineTotalMinor: number;
  isDemo: boolean;
  availableSizes: { size: Size; priceMinor: number }[];
};
export type ServerCart = {
  lines: ServerLine[];
  subtotalMinor: number;
  problems: { key: string; productId: string; size: Size; productName: string; reason: string }[];
};

/** Prix vérifiés par le serveur pour le contenu du panier (aucun prix ne vient du navigateur). */
export function useServerCart(items: CartItem[], ready: boolean) {
  const [data, setData] = useState<ServerCart | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const sig = JSON.stringify(items);

  useEffect(() => {
    if (!ready) return;
    if (items.length === 0) {
      setData({ lines: [], subtotalMinor: 0, problems: [] });
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      fetch("/api/cart/price", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }), signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((d: ServerCart) => { setData(d); setError(false); })
        .catch((e) => { if (e?.name !== "AbortError") setError(true); })
        .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    }, 150);
    return () => { clearTimeout(t); ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, ready]);

  return { data, loading, error };
}

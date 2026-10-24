"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { cartItemSchema } from "@/lib/validation";
import { lineKey, type CartItem } from "@/lib/cart";
import { MAX_LINE_QUANTITY, type Size } from "@/lib/constants";

type Ctx = {
  items: CartItem[];
  ready: boolean;
  count: number;
  add: (item: CartItem) => void;
  setQuantity: (key: string, q: number) => void;
  setSize: (key: string, size: Size) => void;
  remove: (key: string) => void;
  clear: () => void;
};

const STORAGE_KEY = "reina-cart-v1";
const CartContext = createContext<Ctx | null>(null);

function merge(items: CartItem[]): CartItem[] {
  const m = new Map<string, CartItem>();
  for (const i of items) {
    const k = lineKey(i);
    const p = m.get(k);
    m.set(k, p ? { ...p, quantity: Math.min(p.quantity + i.quantity, MAX_LINE_QUANTITY) } : i);
  }
  return [...m.values()];
}

// Le panier ne contient que des identifiants et des quantités : les prix viennent toujours du serveur.
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      const ok = Array.isArray(raw) ? raw.map((r) => cartItemSchema.safeParse(r)).flatMap((r) => (r.success ? [r.data as CartItem] : [])) : [];
      setItems(merge(ok));
    } catch {
      /* stockage indisponible : panier vide */
    }
    setReady(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        try { setItems(JSON.parse(e.newValue ?? "[]")); } catch { /* ignore */ }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback((fn: (prev: CartItem[]) => CartItem[]) => setItems((prev) => merge(fn(prev))), []);

  // Persistance dans un effet (pas dans la fonction de mise à jour, qui doit rester pure) : le panier survit aux navigations et rechargements.
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* stockage indisponible */ }
  }, [items, ready]);

  const value = useMemo<Ctx>(
    () => ({
      items,
      ready,
      count: items.reduce((a, i) => a + i.quantity, 0),
      add: (item) => update((p) => [...p, item]),
      setQuantity: (key, q) => update((p) => (q <= 0 ? p.filter((i) => lineKey(i) !== key) : p.map((i) => (lineKey(i) === key ? { ...i, quantity: Math.min(q, MAX_LINE_QUANTITY) } : i)))),
      setSize: (key, size) => update((p) => p.map((i) => (lineKey(i) === key ? { ...i, size } : i))),
      remove: (key) => update((p) => p.filter((i) => lineKey(i) !== key)),
      clear: () => update(() => []),
    }),
    [items, ready, update],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const c = useContext(CartContext);
  if (!c) throw new Error("useCart hors CartProvider");
  return c;
}

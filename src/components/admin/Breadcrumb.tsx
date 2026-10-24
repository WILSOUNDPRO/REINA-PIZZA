"use client";

import { usePathname } from "next/navigation";

const MAP: Record<string, string[]> = {
  "/admin": ["Vue d'ensemble"],
  "/admin/commandes": ["Commandes"],
  "/admin/menu": ["Catalogue", "Menu"],
  "/admin/supplements": ["Catalogue", "Suppléments"],
  "/admin/zones": ["Livraison"],
  "/admin/reglages": ["Réglages"],
};

export function Breadcrumb() {
  const path = usePathname();
  const key = Object.keys(MAP).filter((k) => path === k || (k !== "/admin" && path.startsWith(k + "/"))).sort((a, b) => b.length - a.length)[0] ?? "/admin";
  const crumbs = [...MAP[key]];
  if (key === "/admin/commandes" && path !== key) crumbs.push("Détail");
  if (key === "/admin/menu" && path !== key) crumbs.push(path.endsWith("/nouveau") ? "Nouveau produit" : "Modifier");
  return (
    <nav aria-label="Fil d'Ariane" className="hidden text-sm text-ink-soft lg:block">
      <ol className="flex items-center gap-2">
        {crumbs.map((c, i) => <li key={c} className="flex items-center gap-2">{i > 0 && <span aria-hidden="true">/</span>}<span aria-current={i === crumbs.length - 1 ? "page" : undefined} className={i === crumbs.length - 1 ? "font-bold text-ink" : ""}>{c}</span></li>)}
      </ol>
    </nav>
  );
}

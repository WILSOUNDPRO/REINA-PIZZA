"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, LayoutDashboard, MapPinned, Pizza, Settings, Plus } from "lucide-react";

const links = [
  { href: "/admin", label: "Tableau de bord", Icon: LayoutDashboard, exact: true },
  { href: "/admin/commandes", label: "Commandes", Icon: ClipboardList },
  { href: "/admin/menu", label: "Menu", Icon: Pizza },
  { href: "/admin/supplements", label: "Suppléments", Icon: Plus },
  { href: "/admin/zones", label: "Livraison", Icon: MapPinned },
  { href: "/admin/reglages", label: "Réglages", Icon: Settings },
];

export function AdminNav({ orientation }: { orientation: "side" | "top" }) {
  const path = usePathname();
  return (
    <nav aria-label="Administration" className={orientation === "side" ? "flex flex-col gap-1" : "flex gap-1 overflow-x-auto pb-1"}>
      {links.map(({ href, label, Icon, exact }) => {
        const active = exact ? path === href : path.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-semibold ${active ? "bg-tomato text-white" : "text-ink hover:bg-cream-2"}`}>
            <Icon size={18} aria-hidden="true" />{label}
          </Link>
        );
      })}
    </nav>
  );
}

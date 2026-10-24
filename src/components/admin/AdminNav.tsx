"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, LayoutDashboard, MapPinned, Pizza, Settings } from "lucide-react";

const links = [
  { href: "/admin", label: "Vue d'ensemble", Icon: LayoutDashboard, exact: true },
  { href: "/admin/commandes", label: "Commandes", Icon: ClipboardList, badge: true },
  { href: "/admin/menu", label: "Menu", Icon: Pizza, also: ["/admin/supplements"] },
  { href: "/admin/zones", label: "Livraison", Icon: MapPinned },
  { href: "/admin/reglages", label: "Réglages", Icon: Settings },
];

// Le badge de Commandes reflète le nombre réel de commandes non consultées.
export function AdminNav({ orientation, newOrders = 0 }: { orientation: "side" | "top"; newOrders?: number }) {
  const path = usePathname();
  return (
    <nav aria-label="Administration" className={orientation === "side" ? "flex flex-col gap-1" : "flex gap-1 overflow-x-auto pb-1"}>
      {links.map(({ href, label, Icon, exact, badge, also }) => {
        const active = exact ? path === href : [href, ...(also ?? [])].some((h) => path.startsWith(h));
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-11 items-center gap-3 whitespace-nowrap rounded-xl px-3 text-sm font-semibold transition-colors duration-150 ${active ? "bg-[#f6e3e3] text-tomato" : "text-ink hover:bg-cream-2"}`}>
            <Icon size={19} aria-hidden="true" />{label}
            {badge && newOrders > 0 && <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-tomato px-1.5 text-xs font-bold text-white" aria-label={`${newOrders} non consultée${newOrders > 1 ? "s" : ""}`}>{newOrders}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

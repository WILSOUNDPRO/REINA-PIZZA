"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [["/", "Accueil"], ["/menu", "Menu"], ["/#apropos", "À propos"], ["/#livraison", "Livraison"], ["/#contact", "Contact"]] as const;

export function NavLinks() {
  const path = usePathname();
  return (
    <>
      {LINKS.map(([href, label]) => {
        const active = href === path;
        // Mobile : seul « Menu » reste dans la barre ; le reste est accessible depuis la page.
        const show = href === "/menu" ? "inline-flex" : href === "/#livraison" ? "hidden xl:inline-flex" : "hidden lg:inline-flex";
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={`relative min-h-11 items-center px-3 text-sm font-semibold transition-colors hover:text-white ${active ? "text-white" : "text-ink-soft"} ${show}`}>
            {label}
            {active && <span className="absolute inset-x-3 bottom-2 h-0.5 rounded bg-tomato shadow-[0_0_8px_rgb(245_181_27/.6)]" aria-hidden="true" />}
          </Link>
        );
      })}
    </>
  );
}

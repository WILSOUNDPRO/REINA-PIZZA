import Link from "next/link";
import { PizzaMark } from "./PizzaMark";
import { CartLink } from "./CartLink";

export function SiteHeader() {
  return (
    <header className="no-print sticky top-0 z-30 border-b border-line bg-cream/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
        <Link href="/" className="flex items-center gap-2 rounded-full" aria-label="Reina Pizza, accueil">
          <PizzaMark className="h-10 w-10" />
          <span className="font-display text-2xl font-extrabold tracking-tight text-tomato">Reina<span className="text-ink"> Pizza</span></span>
        </Link>
        <nav className="ml-auto flex items-center gap-2 text-sm font-bold" aria-label="Navigation principale">
          <Link href="/menu" className="rounded-full px-3 py-2 hover:bg-cream-2">Menu</Link>
          <Link href="/#infos" className="hidden rounded-full px-3 py-2 hover:bg-cream-2 sm:block">Infos</Link>
          <CartLink />
        </nav>
      </div>
    </header>
  );
}

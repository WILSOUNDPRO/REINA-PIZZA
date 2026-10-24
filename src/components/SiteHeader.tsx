import Link from "next/link";
import { Logo } from "./Logo";
import { CartLink } from "./CartLink";

const links = [["/menu", "Menu"], ["/#livraison", "Livraison"], ["/#contact", "Contact"]] as const;

export function SiteHeader() {
  return (
    <header className="no-print sticky top-0 z-30 border-b border-line bg-cream/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:h-16">
        <Link href="/" className="shrink-0 rounded-lg" aria-label="Reina Pizza, accueil"><Logo className="h-8 w-auto sm:h-10" priority /></Link>
        <nav className="ml-auto flex items-center gap-1 text-sm font-semibold" aria-label="Navigation principale">
          {links.map(([href, label], i) => (
            <Link key={href} href={href} className={`min-h-11 items-center rounded-lg px-3 hover:bg-cream-2 ${i === 0 ? "inline-flex" : "hidden sm:inline-flex"}`}>{label}</Link>
          ))}
          <CartLink />
        </nav>
      </div>
    </header>
  );
}

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Logo } from "./Logo";
import { CartLink } from "./CartLink";
import { NavLinks } from "./NavLinks";

export function SiteHeader() {
  return (
    <header className="no-print sticky top-0 z-30 border-b border-line bg-cream/70 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:h-[4.5rem]">
        <Link href="/" className="shrink-0 rounded-lg" aria-label="Reina Pizza, accueil"><span className="sm:hidden"><Logo size="sm" tagline={false} /></span><span className="hidden sm:block"><Logo /></span></Link>
        <nav className="ml-auto flex items-center lg:ml-8 lg:mr-auto" aria-label="Navigation principale"><NavLinks /></nav>
        <div className="flex items-center gap-2">
          <CartLink />
          <Link href="/menu" className="btn btn-primary hidden !rounded-full !px-5 lg:inline-flex">Commander<ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      </div>
    </header>
  );
}

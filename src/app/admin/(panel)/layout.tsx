import Link from "next/link";
import { requireAdmin } from "@/server/admin/auth";
import { logoutAction } from "../actions";
import { NewOrderWatcher } from "@/components/admin/NewOrderWatcher";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { PizzaMark } from "@/components/PizzaMark";

export const dynamic = "force-dynamic";

const links = [
  ["/admin", "Tableau de bord"],
  ["/admin/commandes", "Commandes"],
  ["/admin/menu", "Menu"],
  ["/admin/supplements", "Suppléments"],
  ["/admin/zones", "Livraison"],
  ["/admin/reglages", "Réglages"],
];

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin(); // contrôle d'accès côté serveur pour toute l'administration
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-paper">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
          <Link href="/admin" className="flex items-center gap-2"><PizzaMark className="h-8 w-8" /><span className="font-display text-lg font-extrabold text-tomato">Reina · Admin</span></Link>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-ink-soft md:inline">{admin.email}</span>
            <form action={logoutAction}><SubmitButton className="btn btn-ghost !min-h-9 !px-3 text-xs">Déconnexion</SubmitButton></form>
          </div>
          <nav className="flex w-full gap-1 overflow-x-auto pb-1 text-sm font-bold" aria-label="Administration">
            {links.map(([href, label]) => <Link key={href} href={href} className="whitespace-nowrap rounded-full px-3 py-2 hover:bg-cream-2">{label}</Link>)}
          </nav>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-2"><NewOrderWatcher /></div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}

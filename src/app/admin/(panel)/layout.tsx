import Link from "next/link";
import { LogOut } from "lucide-react";
import { requireAdmin } from "@/server/admin/auth";
import { getSql } from "@/server/db";
import { logoutAction } from "../actions";
import { NewOrderWatcher } from "@/components/admin/NewOrderWatcher";
import { AdminNav } from "@/components/admin/AdminNav";
import { Breadcrumb } from "@/components/admin/Breadcrumb";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin(); // contrôle d'accès côté serveur pour toute l'administration
  const [{ n }] = await getSql()<{ n: number }[]>`select count(*)::int as n from orders where acknowledged_at is null`;
  const initial = admin.email.charAt(0).toUpperCase(); // initiale de l'e-mail réel : aucun avatar ni nom fictif
  return (
    <div className="min-h-dvh bg-cream lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="hidden border-r border-line bg-cream lg:flex lg:flex-col lg:gap-8 lg:p-4">
        <Link href="/admin" aria-label="Administration Reina Pizza" className="px-2 pt-2"><Logo className="h-14 w-auto" /></Link>
        <AdminNav orientation="side" newOrders={n} />
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-line bg-white">
          <div className="flex items-center gap-3 px-4 py-2">
            <Link href="/admin" className="lg:hidden" aria-label="Administration Reina Pizza"><Logo className="h-8 w-auto" /></Link>
            <Breadcrumb />
            <div className="ml-auto min-w-0"><NewOrderWatcher /></div>
            <div className="flex items-center gap-2 border-l border-line pl-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-tomato text-sm font-bold text-white" aria-hidden="true">{initial}</span>
              <span className="hidden max-w-[11rem] truncate text-sm font-semibold md:block">{admin.email}</span>
              <form action={logoutAction}><SubmitButton className="btn btn-ghost !px-3 text-sm"><LogOut size={16} aria-hidden="true" /><span className="hidden sm:inline">Déconnexion</span><span className="sr-only sm:hidden">Se déconnecter</span></SubmitButton></form>
            </div>
          </div>
          <div className="px-4 lg:hidden"><AdminNav orientation="top" newOrders={n} /></div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </div>
    </div>
  );
}

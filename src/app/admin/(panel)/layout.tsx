import Link from "next/link";
import { requireAdmin } from "@/server/admin/auth";
import { logoutAction } from "../actions";
import { NewOrderWatcher } from "@/components/admin/NewOrderWatcher";
import { AdminNav } from "@/components/admin/AdminNav";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Logo } from "@/components/Logo";
import { LogOut } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin(); // contrôle d'accès côté serveur pour toute l'administration
  return (
    <div className="min-h-dvh bg-[#f6f5f3] lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="hidden border-r border-line bg-white lg:flex lg:flex-col lg:gap-6 lg:p-4">
        <Link href="/admin" aria-label="Administration Reina Pizza"><Logo className="h-12 w-auto" /></Link>
        <AdminNav orientation="side" />
        <div className="mt-auto space-y-2 border-t border-line pt-4">
          <p className="truncate text-xs text-ink-soft">{admin.email}</p>
          <form action={logoutAction}><SubmitButton className="btn btn-ghost w-full text-sm"><LogOut size={16} aria-hidden="true" />Déconnexion</SubmitButton></form>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-line bg-white">
          <div className="flex items-center gap-3 px-4 py-2">
            <Link href="/admin" className="lg:hidden" aria-label="Administration Reina Pizza"><Logo className="h-8 w-auto" /></Link>
            <div className="min-w-0 flex-1"><NewOrderWatcher /></div>
            <form action={logoutAction} className="lg:hidden"><SubmitButton className="btn btn-ghost !px-3 text-xs" ><LogOut size={16} aria-label="Déconnexion" /></SubmitButton></form>
          </div>
          <div className="px-4 lg:hidden"><AdminNav orientation="top" /></div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </div>
    </div>
  );
}

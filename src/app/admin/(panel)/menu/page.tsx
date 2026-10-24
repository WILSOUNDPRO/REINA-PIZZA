import Link from "next/link";
import { Check, Package, Plus, Search, Tag } from "lucide-react";
import { getSql } from "@/server/db";
import { getSettings } from "@/server/settings";
import { listAdminProducts, menuSummary, type Availability } from "@/server/menu";
import { MenuManager } from "@/components/admin/MenuManager";
import { Flash } from "@/components/admin/Flash";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { deleteCategoryAction, deleteDemoDataAction, saveCategoryAction } from "../../actions";

type SP = { ok?: string; err?: string; q?: string; dispo?: string; onglet?: string; vue?: string };

export default async function AdminMenu({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const sql = getSql();
  const dispo: Availability = sp.dispo === "available" || sp.dispo === "unavailable" ? sp.dispo : "all";
  const archivedView = sp.vue === "archives";
  const tab = sp.onglet === "categories" ? "categories" : "produits";
  const [settings, summary, products, cats, demo] = await Promise.all([
    getSettings(sql),
    menuSummary(sql),
    tab === "produits" ? listAdminProducts(sql, { q: sp.q, dispo, archived: archivedView }) : Promise.resolve([]),
    tab === "categories" ? sql<{ id: string; name: string; position: number; active: boolean }[]>`select * from categories order by position, name` : Promise.resolve([]),
    sql<{ n: number }[]>`select (select count(*) from products where is_demo)::int + (select count(*) from extras where is_demo)::int + (select count(*) from delivery_zones where is_demo)::int as n`,
  ]);
  const cards = [
    { Icon: Package, n: summary.products, label: summary.products > 1 ? "produits" : "produit", tone: "bg-[#fbeaea] text-tomato" },
    { Icon: Check, n: summary.available, label: summary.available > 1 ? "disponibles" : "disponible", tone: "bg-[#e8f4ed] text-basil" },
    { Icon: Tag, n: summary.priced, label: summary.priced > 1 ? "tailles tarifées" : "taille tarifée", tone: "bg-[#fbeaea] text-tomato" },
  ];
  const tabCls = (on: boolean) => `inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-bold ${on ? "border-tomato text-tomato" : "border-transparent text-ink-soft hover:text-ink"}`;

  return (
    <div className="space-y-5">
      <Flash sp={sp} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">Gestion du menu</h1>
          <p className="mt-1 text-ink-soft">Produits, tailles et disponibilités</p>
        </div>
        <Link href="/admin/menu/nouveau" className="btn btn-primary"><Plus size={18} aria-hidden="true" />Nouveau produit</Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3" role="list" aria-label="Synthèse du menu">
        {cards.map(({ Icon, n, label, tone }) => (
          <div key={label} role="listitem" className="card flex items-center gap-4 p-4">
            <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${tone}`}><Icon size={22} aria-hidden="true" /></span>
            <p><span className="block text-3xl font-extrabold leading-none">{n}</span><span className="text-sm text-ink-soft">{label}</span></p>
          </div>
        ))}
      </div>

      <nav aria-label="Sections du catalogue" className="flex gap-1 border-b border-line">
        <Link href="/admin/menu" aria-current={tab === "produits" ? "page" : undefined} className={tabCls(tab === "produits")}>Produits</Link>
        <Link href="/admin/menu?onglet=categories" aria-current={tab === "categories" ? "page" : undefined} className={tabCls(tab === "categories")}>Catégories</Link>
        <Link href="/admin/supplements" className={tabCls(false)}>Suppléments</Link>
      </nav>

      {demo[0].n > 0 && (
        <form action={deleteDemoDataAction} className="card flex flex-wrap items-center justify-between gap-3 !border-tomato p-4">
          <p className="text-sm"><strong>Des données de démonstration sont présentes.</strong> Elles ne sont jamais payables avec un vrai prestataire.</p>
          <SubmitButton className="btn btn-ghost text-sm" confirm="Supprimer tous les produits, suppléments et zones de démonstration ?">Supprimer les données de démo</SubmitButton>
        </form>
      )}

      {tab === "produits" ? (
        <>
          <form className="flex flex-col gap-3 sm:flex-row" role="search">
            {archivedView && <input type="hidden" name="vue" value="archives" />}
            <div className="relative flex-1">
              <label htmlFor="q" className="sr-only">Rechercher une pizza</label>
              <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" aria-hidden="true" />
              <input id="q" name="q" defaultValue={sp.q} placeholder="Rechercher une pizza…" className="field !pl-10" />
            </div>
            <label htmlFor="dispo" className="sr-only">Filtrer par disponibilité</label>
            <select id="dispo" name="dispo" defaultValue={dispo} className="field sm:!w-64">
              <option value="all">Toutes les disponibilités</option>
              <option value="available">Disponibles</option>
              <option value="unavailable">Indisponibles</option>
            </select>
            <button className="btn btn-ghost">Filtrer</button>
          </form>
          <div className="flex items-center justify-between text-sm">
            <p className="text-ink-soft">{products.length} produit{products.length > 1 ? "s" : ""}{archivedView ? " archivé" + (products.length > 1 ? "s" : "") : ""}</p>
            <Link href={archivedView ? "/admin/menu" : "/admin/menu?vue=archives"} className="inline-flex min-h-11 items-center font-bold underline">{archivedView ? "Retour aux produits" : `Voir les archivés${summary.archived ? ` (${summary.archived})` : ""}`}</Link>
          </div>
          <MenuManager products={products} currency={settings.currency} archivedView={archivedView} filtered={!!sp.q?.trim() || dispo !== "all"} />
        </>
      ) : (
        <section aria-labelledby="cats" className="card space-y-3 p-5">
          <h2 id="cats" className="text-xl font-extrabold">Catégories</h2>
          {cats.map((c) => (
            <div key={c.id} className="flex flex-wrap items-end gap-2">
              <form action={saveCategoryAction} className="flex flex-1 flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={c.id} />
                <label className="min-w-40 flex-1 text-sm font-bold">Nom<input name="name" defaultValue={c.name} className="field mt-1" required /></label>
                <label className="w-24 text-sm font-bold">Ordre<input name="position" type="number" defaultValue={c.position} className="field mt-1" /></label>
                <label className="flex min-h-12 items-center gap-2 text-sm font-bold"><input type="checkbox" name="active" defaultChecked={c.active} className="h-5 w-5" />Visible</label>
                <SubmitButton className="btn btn-basil">Enregistrer</SubmitButton>
              </form>
              <form action={deleteCategoryAction}><input type="hidden" name="id" value={c.id} /><SubmitButton className="btn btn-ghost" confirm="Supprimer cette catégorie ?">Supprimer</SubmitButton></form>
            </div>
          ))}
          <form action={saveCategoryAction} className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
            <label className="min-w-40 flex-1 text-sm font-bold">Nouvelle catégorie<input name="name" className="field mt-1" required /></label>
            <SubmitButton className="btn btn-primary">Ajouter</SubmitButton>
          </form>
        </section>
      )}
    </div>
  );
}

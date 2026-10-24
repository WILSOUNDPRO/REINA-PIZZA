import Link from "next/link";
import { getSql } from "@/server/db";
import { getSettings } from "@/server/settings";
import { formatMoney } from "@/lib/money";
import { Flash } from "@/components/admin/Flash";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { deleteCategoryAction, deleteDemoDataAction, deleteProductAction, saveCategoryAction, toggleProductAction } from "../../actions";

export default async function AdminMenu({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const sql = getSql();
  const [settings, cats, products] = await Promise.all([
    getSettings(sql),
    sql<{ id: string; name: string; position: number; active: boolean }[]>`select * from categories order by position, name`,
    sql<{ id: string; name: string; available: boolean; is_demo: boolean; image_url: string | null; default_image: string | null; category_name: string | null; sizes: { size: string; price_minor: number }[] }[]>`
      select p.id, p.name, p.available, p.is_demo, p.image_url, p.default_image, c.name as category_name,
        coalesce((select json_agg(json_build_object('size', s.size, 'price_minor', s.price_minor) order by array_position(array['S','M','L','XL','XXL'], s.size))
          from product_sizes s where s.product_id = p.id and s.available), '[]'::json) as sizes
      from products p left join categories c on c.id = p.category_id order by coalesce(c.position, 9999), p.position, p.name`,
  ]);
  const hasDemo = products.some((p) => p.is_demo);
  return (
    <div className="space-y-6">
      <Flash sp={sp} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">Menu</h1>
        <Link href="/admin/menu/nouveau" className="btn btn-primary">+ Nouveau produit</Link>
      </div>
      {hasDemo && (
        <form action={deleteDemoDataAction} className="card flex flex-wrap items-center justify-between gap-3 border-2 !border-tomato p-4">
          <p className="text-sm"><strong>Des données de démonstration sont présentes.</strong> Elles ne sont jamais payables avec un vrai prestataire.</p>
          <SubmitButton className="btn btn-ghost !min-h-10 text-sm" confirm="Supprimer tous les produits, suppléments et zones de démonstration ?">Supprimer les données de démo</SubmitButton>
        </form>
      )}
      <ul className="space-y-3">
        {products.length === 0 && <li className="card p-5 text-ink-soft">Aucun produit. Ajoutez le premier.</li>}
        {products.map((p) => (
          <li key={p.id} className="card flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-bold">{p.name} {p.is_demo && <span className="badge bg-cream-2 text-ink-soft">Démo</span>} {!p.available && <span className="badge bg-stone-200">Indisponible</span>} {!p.image_url && (p.default_image ? <span className="badge bg-cream-2 text-ink-soft">Illustration par défaut</span> : <span className="badge bg-cream-2 text-ink-soft">Sans photo</span>)}</p>
              <p className="text-sm text-ink-soft">{p.category_name ?? "Sans catégorie"} · {p.sizes.length ? p.sizes.map((s) => `${s.size} ${formatMoney(s.price_minor, settings.currency)}`).join(" · ") : "Aucune taille"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <form action={toggleProductAction}><input type="hidden" name="id" value={p.id} /><SubmitButton className="btn btn-ghost !min-h-10 text-sm">{p.available ? "Rendre indisponible" : "Rendre disponible"}</SubmitButton></form>
              <Link href={`/admin/menu/${p.id}`} className="btn btn-basil !min-h-10 text-sm">Modifier</Link>
              <form action={deleteProductAction}><input type="hidden" name="id" value={p.id} /><SubmitButton className="btn btn-ghost !min-h-10 text-sm" confirm={`Supprimer « ${p.name} » ? Les anciennes commandes ne changent pas.`}>Supprimer</SubmitButton></form>
            </div>
          </li>
        ))}
      </ul>

      <section aria-labelledby="cats" className="card space-y-3 p-5">
        <h2 id="cats" className="text-xl font-bold">Catégories</h2>
        {cats.map((c) => (
          <div key={c.id} className="flex flex-wrap items-end gap-2">
            <form action={saveCategoryAction} className="flex flex-1 flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={c.id} />
              <label className="min-w-40 flex-1 text-sm font-bold">Nom<input name="name" defaultValue={c.name} className="field mt-1" required /></label>
              <label className="w-24 text-sm font-bold">Ordre<input name="position" type="number" defaultValue={c.position} className="field mt-1" /></label>
              <label className="flex min-h-12 items-center gap-2 text-sm font-bold"><input type="checkbox" name="active" defaultChecked={c.active} className="h-5 w-5" />Visible</label>
              <SubmitButton className="btn btn-basil !min-h-12">Enregistrer</SubmitButton>
            </form>
            <form action={deleteCategoryAction}>
              <input type="hidden" name="id" value={c.id} />
              <SubmitButton className="btn btn-ghost !min-h-12" confirm="Supprimer cette catégorie ?">Supprimer</SubmitButton>
            </form>
          </div>
        ))}
        <form action={saveCategoryAction} className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
          <label className="flex-1 text-sm font-bold">Nouvelle catégorie<input name="name" className="field mt-1" required /></label>
          <SubmitButton className="btn btn-primary !min-h-12">Ajouter</SubmitButton>
        </form>
      </section>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { getSql } from "@/server/db";
import { getSettings } from "@/server/settings";
import { storageConfigured } from "@/server/admin/storage";
import { SIZES } from "@/lib/constants";
import { SIZE_HINT } from "@/lib/labels";
import { minorToInput } from "@/lib/money";
import { isOtherConfigured, type SaleUnit } from "@/lib/productSale";
import { saveProductAction } from "../../../actions";
import { Flash } from "@/components/admin/Flash";
import { SubmitButton } from "@/components/admin/SubmitButton";

type P = {
  default_image: string | null; id: string; name: string; description: string; ingredients: string | null; image_url: string | null; available: boolean; visible: boolean;
  position: number; is_demo: boolean; category_id: string | null; product_type: "pizza" | "other"; sale_unit: SaleUnit | null; base_price_minor: number | null; pieces_per_portion: number | null;
};

export default async function ProductForm({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string; type?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const sql = getSql();
  const isNew = id === "nouveau";
  let p: P | undefined;
  let sizes: { size: string; price_minor: number; available: boolean }[] = [];
  let variants: { label: string; price_minor: number }[] = [];
  if (!isNew) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
    [p] = await sql<P[]>`select default_image, id, name, description, ingredients, image_url, available, visible, position, is_demo, category_id, product_type, sale_unit, base_price_minor, pieces_per_portion from products where id = ${id}`;
    if (!p) notFound();
    sizes = await sql`select size, price_minor, available from product_sizes where product_id = ${id}`;
    variants = await sql`select label, price_minor from product_variants where product_id = ${id} order by position, label`;
  }
  const type: "pizza" | "other" = p?.product_type ?? (sp.type === "other" ? "other" : "pizza");
  const [cats, settings] = await Promise.all([sql<{ id: string; name: string }[]>`select id, name from categories order by position, name`, getSettings(sql)]);
  const cur = settings.currency ?? "HTG";
  const configured = p ? (type === "other" ? isOtherConfigured(p) : sizes.some((s) => s.available && s.price_minor > 0)) : false;

  return (
    <div className="max-w-2xl space-y-5">
      <Link href="/admin/menu" className="text-sm font-bold underline">← Menu</Link>
      <Flash sp={sp} />
      <h1 className="text-3xl font-extrabold">{isNew ? "Nouveau produit" : p!.name}</h1>
      {isNew && (
        <nav aria-label="Type de produit" className="flex gap-2">
          <Link href="/admin/menu/nouveau" aria-current={type === "pizza" ? "page" : undefined} className={`btn ${type === "pizza" ? "btn-primary" : "btn-ghost"}`}>Pizza (tailles S à XXL)</Link>
          <Link href="/admin/menu/nouveau?type=other" aria-current={type === "other" ? "page" : undefined} className={`btn ${type === "other" ? "btn-primary" : "btn-ghost"}`}>Autre produit (burger, wings…)</Link>
        </nav>
      )}
      {!isNew && type === "other" && (
        <p role="status" className={`rounded-xl p-3 text-sm font-semibold ${configured ? "bg-[#e8f4ed] text-basil-dark" : "bg-amber-100 text-amber-950"}`}>
          {configured ? "Prix et unité de vente renseignés : vous pouvez activer ce produit." : "Non configuré : tant que le prix et l'unité de vente ne sont pas renseignés, le produit s'affiche « Bientôt disponible » et ne peut pas être commandé."}
        </p>
      )}
      <form action={saveProductAction} className="card space-y-4 p-5" encType="multipart/form-data">
        {!isNew && <input type="hidden" name="id" value={p!.id} />}
        <input type="hidden" name="productType" value={type} />
        <input type="hidden" name="visibleField" value="1" />
        <label className="block text-sm font-bold">Nom<input name="name" required maxLength={120} defaultValue={p?.name} className="field mt-1" /></label>
        <label className="block text-sm font-bold">Description<textarea name="description" rows={2} maxLength={1000} defaultValue={p?.description} className="field mt-1" /></label>
        <label className="block text-sm font-bold">Ingrédients (facultatif)<textarea name="ingredients" rows={2} maxLength={1000} defaultValue={p?.ingredients ?? ""} className="field mt-1" placeholder="À renseigner par le restaurant : rien n'est affiché tant que ce champ est vide." /></label>
        <label className="block text-sm font-bold">Catégorie
          <select name="categoryId" defaultValue={p?.category_id ?? ""} className="field mt-1"><option value="">Sans catégorie</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </label>

        {type === "pizza" ? (
          <fieldset className="space-y-2">
            <legend className="text-sm font-bold">Tailles proposées et prix ({cur})</legend>
            {SIZES.map((s) => {
              const row = sizes.find((x) => x.size === s);
              return (
                <div key={s} className="flex items-center gap-3">
                  <label className="flex w-28 min-h-12 items-center gap-2 font-bold"><input type="checkbox" name={`size_${s}_on`} defaultChecked={!!row?.available} className="h-5 w-5" />{s} <span className="text-xs font-normal text-ink-soft">{SIZE_HINT[s]}</span></label>
                  <input name={`size_${s}_price`} inputMode="decimal" defaultValue={minorToInput(row?.price_minor)} placeholder="Prix" aria-label={`Prix taille ${s}`} className="field max-w-40" />
                </div>
              );
            })}
          </fieldset>
        ) : (
          <fieldset className="space-y-3 rounded-2xl border border-line p-4">
            <legend className="px-1 text-sm font-bold">Vente et prix</legend>
            <p className="text-xs text-ink-soft">Les tailles S à XXL ne s'appliquent pas à ce produit. Aucun prix ni nombre de pièces n'est préchargé.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-bold">Prix ({cur})<input name="basePrice" inputMode="decimal" defaultValue={minorToInput(p?.base_price_minor)} placeholder="Non défini" className="field mt-1" /></label>
              <label className="block text-sm font-bold">Unité de vente
                <select name="saleUnit" defaultValue={p?.sale_unit ?? ""} className="field mt-1">
                  <option value="">Non définie</option>
                  <option value="unit">À l'unité</option>
                  <option value="portion">Par portion</option>
                </select>
              </label>
              <label className="block text-sm font-bold sm:col-span-2">Nombre de pièces par portion (facultatif, vente par portion seulement)
                <input name="pieces" inputMode="numeric" defaultValue={p?.pieces_per_portion ?? ""} placeholder="Non défini" className="field mt-1 sm:max-w-40" />
              </label>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-bold">Variantes (facultatif) — chacune avec son propre prix</p>
              <p className="text-xs text-ink-soft">Le produit se vend très bien sans variante. Avec des variantes, le client choisit « Standard » (prix ci-dessus) ou l'une d'elles.</p>
              {Array.from({ length: 4 }, (_, k) => (
                <div key={k} className="grid grid-cols-[1fr_8rem] gap-2">
                  <input name={`variant_${k}_label`} defaultValue={variants[k]?.label ?? ""} maxLength={40} placeholder={`Variante ${k + 1}`} aria-label={`Nom de la variante ${k + 1}`} className="field" />
                  <input name={`variant_${k}_price`} inputMode="decimal" defaultValue={minorToInput(variants[k]?.price_minor)} placeholder="Prix" aria-label={`Prix de la variante ${k + 1}`} className="field" />
                </div>
              ))}
            </div>
          </fieldset>
        )}

        <div className="space-y-2">
          <p className="text-sm font-bold">Photo</p>
          {p?.default_image && <p className="text-xs text-ink-soft">{p.image_url ? "Votre photo remplace l'illustration par défaut. Retirez-la pour revenir à l'illustration." : "Une photo d'illustration est affichée par défaut. Ajoutez votre photo pour la remplacer."}</p>}
          {p?.image_url && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.image_url} alt="" className="h-32 w-32 rounded-2xl object-cover" />
              <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="removeImage" className="h-5 w-5" /> Retirer la photo actuelle</label>
            </>
          )}
          <input type="file" name="image" accept="image/jpeg,image/png,image/webp" className="block w-full text-sm" />
          <p className="text-xs text-ink-soft">JPEG, PNG ou WebP, 5 Mo maximum. L'image est recadrée automatiquement au format 4:3 (1200×900, WebP), sans retouche : cadrez bien le produit au centre.{!storageConfigured() && " ⚠ Stockage non configuré : le téléversement échouera."}</p>
        </div>

        <div className="flex flex-wrap gap-x-6">
          <label className="flex min-h-12 items-center gap-2 font-bold"><input type="checkbox" name="visible" defaultChecked={p?.visible ?? true} className="h-5 w-5" />Visible au catalogue</label>
          <label className="flex min-h-12 items-center gap-2 font-bold"><input type="checkbox" name="available" defaultChecked={p?.available ?? (type === "pizza")} className="h-5 w-5" />Disponible (commandable)</label>
          <label className="flex min-h-12 items-center gap-2 font-bold"><input type="checkbox" name="isDemo" defaultChecked={p?.is_demo ?? false} className="h-5 w-5" />Produit de démonstration (non payable)</label>
          <label className="flex items-center gap-2 font-bold">Ordre<input name="position" type="number" defaultValue={p?.position ?? 0} className="field !w-24" /></label>
        </div>
        <SubmitButton className="btn btn-primary btn-lg">Enregistrer</SubmitButton>
      </form>
    </div>
  );
}

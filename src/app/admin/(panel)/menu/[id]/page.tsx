import Link from "next/link";
import { notFound } from "next/navigation";
import { getSql } from "@/server/db";
import { getSettings } from "@/server/settings";
import { storageConfigured } from "@/server/admin/storage";
import { SIZES } from "@/lib/constants";
import { SIZE_HINT } from "@/lib/labels";
import { minorToInput } from "@/lib/money";
import { saveProductAction } from "../../../actions";
import { Flash } from "@/components/admin/Flash";
import { SubmitButton } from "@/components/admin/SubmitButton";

type P = { default_image: string | null; id: string; name: string; description: string; image_url: string | null; available: boolean; position: number; is_demo: boolean; category_id: string | null };

export default async function ProductForm({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const sql = getSql();
  const isNew = id === "nouveau";
  let p: P | undefined;
  let sizes: { size: string; price_minor: number; available: boolean }[] = [];
  if (!isNew) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
    [p] = await sql<P[]>`select default_image, id, name, description, image_url, available, position, is_demo, category_id from products where id = ${id}`;
    if (!p) notFound();
    sizes = await sql`select size, price_minor, available from product_sizes where product_id = ${id}`;
  }
  const [cats, settings] = await Promise.all([sql<{ id: string; name: string }[]>`select id, name from categories order by position, name`, getSettings(sql)]);

  return (
    <div className="max-w-2xl space-y-5">
      <Link href="/admin/menu" className="text-sm font-bold underline">← Menu</Link>
      <Flash sp={sp} />
      <h1 className="text-3xl font-extrabold">{isNew ? "Nouveau produit" : p!.name}</h1>
      <form action={saveProductAction} className="card space-y-4 p-5" encType="multipart/form-data">
        {!isNew && <input type="hidden" name="id" value={p!.id} />}
        <label className="block text-sm font-bold">Nom<input name="name" required maxLength={120} defaultValue={p?.name} className="field mt-1" /></label>
        <label className="block text-sm font-bold">Description / ingrédients<textarea name="description" rows={3} maxLength={1000} defaultValue={p?.description} className="field mt-1" /></label>
        <label className="block text-sm font-bold">Catégorie
          <select name="categoryId" defaultValue={p?.category_id ?? ""} className="field mt-1"><option value="">Sans catégorie</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </label>

        <fieldset className="space-y-2">
          <legend className="text-sm font-bold">Tailles proposées et prix ({settings.currency ?? "devise à confirmer"})</legend>
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
          <label className="flex min-h-12 items-center gap-2 font-bold"><input type="checkbox" name="available" defaultChecked={p?.available ?? true} className="h-5 w-5" />Disponible</label>
          <label className="flex min-h-12 items-center gap-2 font-bold"><input type="checkbox" name="isDemo" defaultChecked={p?.is_demo ?? false} className="h-5 w-5" />Produit de démonstration (non payable)</label>
          <label className="flex items-center gap-2 font-bold">Ordre<input name="position" type="number" defaultValue={p?.position ?? 0} className="field !w-24" /></label>
        </div>
        <SubmitButton className="btn btn-primary btn-lg">Enregistrer</SubmitButton>
      </form>
    </div>
  );
}

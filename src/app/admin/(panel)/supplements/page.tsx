import { getSql } from "@/server/db";
import { getSettings } from "@/server/settings";
import { minorToInput } from "@/lib/money";
import { deleteExtraAction, saveExtraAction } from "../../actions";
import { Flash } from "@/components/admin/Flash";
import { SubmitButton } from "@/components/admin/SubmitButton";

export default async function Extras({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const sql = getSql();
  const [extras, s] = await Promise.all([sql<{ id: string; name: string; price_minor: number; available: boolean; is_demo: boolean }[]>`select * from extras order by position, name`, getSettings(sql)]);
  return (
    <div className="max-w-2xl space-y-5">
      <Flash sp={sp} />
      <h1 className="text-3xl font-extrabold">Suppléments</h1>
      <p className="text-sm text-ink-soft">Proposés en option sur chaque pizza ({s.currency ?? "devise à confirmer"}). Aucun supplément n'est préchargé.</p>
      {extras.map((e) => (
        <div key={e.id} className="card flex flex-wrap items-end gap-2 p-4">
          <form action={saveExtraAction} className="flex flex-1 flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={e.id} />
            <label className="min-w-40 flex-1 text-sm font-bold">Nom<input name="name" defaultValue={e.name} required className="field mt-1" /></label>
            <label className="w-32 text-sm font-bold">Prix<input name="price" inputMode="decimal" defaultValue={minorToInput(e.price_minor)} required className="field mt-1" /></label>
            <label className="flex min-h-12 items-center gap-2 text-sm font-bold"><input type="checkbox" name="available" defaultChecked={e.available} className="h-5 w-5" />Disponible</label>
            <label className="flex min-h-12 items-center gap-2 text-sm font-bold"><input type="checkbox" name="isDemo" defaultChecked={e.is_demo} className="h-5 w-5" />Démo</label>
            <SubmitButton className="btn btn-basil !min-h-12">Enregistrer</SubmitButton>
          </form>
          <form action={deleteExtraAction}><input type="hidden" name="id" value={e.id} /><SubmitButton className="btn btn-ghost !min-h-12" confirm="Supprimer ce supplément ?">Supprimer</SubmitButton></form>
        </div>
      ))}
      <form action={saveExtraAction} className="card flex flex-wrap items-end gap-2 p-4">
        <label className="min-w-40 flex-1 text-sm font-bold">Nouveau supplément<input name="name" required className="field mt-1" /></label>
        <label className="w-32 text-sm font-bold">Prix<input name="price" inputMode="decimal" required className="field mt-1" /></label>
        <SubmitButton className="btn btn-primary !min-h-12">Ajouter</SubmitButton>
      </form>
    </div>
  );
}

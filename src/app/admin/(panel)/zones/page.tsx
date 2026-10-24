import { getSql } from "@/server/db";
import { getSettings } from "@/server/settings";
import { minorToInput } from "@/lib/money";
import { deleteZoneAction, saveZoneAction } from "../../actions";
import { Flash } from "@/components/admin/Flash";
import { SubmitButton } from "@/components/admin/SubmitButton";

export default async function Zones({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const sql = getSql();
  const [zones, s] = await Promise.all([sql<{ id: string; name: string; commune: string | null; fee_minor: number; active: boolean; is_demo: boolean }[]>`select * from delivery_zones order by position, name`, getSettings(sql)]);
  return (
    <div className="max-w-3xl space-y-5">
      <Flash sp={sp} />
      <h1 className="text-3xl font-extrabold">Zones et tarifs de livraison</h1>
      <p className="text-sm text-ink-soft">Tarifs en {s.currency ?? "devise à confirmer"}. Une zone active est proposée au client avec son tarif fixe. Pour toute autre adresse, le client envoie une demande et vous fixez les frais depuis la commande. Aucune zone n'est préchargée.</p>
      {zones.map((z) => (
        <div key={z.id} className="card flex flex-wrap items-end gap-2 p-4">
          <form action={saveZoneAction} className="flex flex-1 flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={z.id} />
            <label className="min-w-40 flex-1 text-sm font-bold">Zone<input name="name" defaultValue={z.name} required className="field mt-1" /></label>
            <label className="w-40 text-sm font-bold">Commune<input name="commune" defaultValue={z.commune ?? ""} className="field mt-1" /></label>
            <label className="w-32 text-sm font-bold">Tarif<input name="fee" inputMode="decimal" defaultValue={minorToInput(z.fee_minor)} required className="field mt-1" /></label>
            <label className="flex min-h-12 items-center gap-2 text-sm font-bold"><input type="checkbox" name="active" defaultChecked={z.active} className="h-5 w-5" />Active</label>
            <label className="flex min-h-12 items-center gap-2 text-sm font-bold"><input type="checkbox" name="isDemo" defaultChecked={z.is_demo} className="h-5 w-5" />Démo</label>
            <SubmitButton className="btn btn-basil !min-h-12">Enregistrer</SubmitButton>
          </form>
          <form action={deleteZoneAction}><input type="hidden" name="id" value={z.id} /><SubmitButton className="btn btn-ghost !min-h-12" confirm="Supprimer cette zone ?">Supprimer</SubmitButton></form>
        </div>
      ))}
      <form action={saveZoneAction} className="card flex flex-wrap items-end gap-2 p-4">
        <label className="min-w-40 flex-1 text-sm font-bold">Nouvelle zone<input name="name" required className="field mt-1" /></label>
        <label className="w-40 text-sm font-bold">Commune<input name="commune" className="field mt-1" /></label>
        <label className="w-32 text-sm font-bold">Tarif<input name="fee" inputMode="decimal" required className="field mt-1" /></label>
        <SubmitButton className="btn btn-primary !min-h-12">Ajouter</SubmitButton>
      </form>
    </div>
  );
}

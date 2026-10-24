import { getSql } from "@/server/db";
import { getSettings } from "@/server/settings";
import { env } from "@/server/env";
import Link from "next/link";
import { saveSettingsAction } from "../../actions";
import { Flash } from "@/components/admin/Flash";
import { SubmitButton } from "@/components/admin/SubmitButton";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const sql = getSql();
  const s = await getSettings(sql);
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from orders`;
  return (
    <div className="max-w-2xl space-y-5">
      <Flash sp={sp} />
      <h1 className="text-3xl font-extrabold">Réglages du restaurant</h1>
      <form action={saveSettingsAction} className="card space-y-4 p-5">
        <label className="block text-sm font-bold">Nom<input name="name" defaultValue={s.restaurant_name} required className="field mt-1" /></label>
        <label className="block text-sm font-bold">Adresse<input name="address" defaultValue={s.address} required className="field mt-1" /></label>
        <label className="block text-sm font-bold">Horaires (texte affiché)<input name="hours" defaultValue={s.hours_text} className="field mt-1" /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-bold">Téléphone<input name="phone" defaultValue={s.phone} required className="field mt-1" /></label>
          <label className="block text-sm font-bold">WhatsApp (chiffres, avec indicatif)<input name="whatsapp" defaultValue={s.whatsapp_number} required inputMode="numeric" className="field mt-1" /></label>
        </div>

        <fieldset className="space-y-2 rounded-2xl border-2 border-line p-4">
          <legend className="px-1 text-sm font-bold">Devise</legend>
          <select name="currency" defaultValue={s.currency ?? ""} className="field">
            <option value="">Non confirmée (commandes bloquées)</option>
            <option value="HTG">HTG — gourde haïtienne</option>
            <option value="USD">USD — dollar américain</option>
          </select>
          <p className="text-xs text-ink-soft">À confirmer avec le propriétaire. Une seule devise à la fois : les prix du menu ne sont jamais convertis.</p>
          {n > 0 && <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirmCurrency" className="mt-1 h-5 w-5" /> Je comprends que changer la devise ne convertit pas les prix existants (requis si je modifie la devise).</label>}
        </fieldset>

        <fieldset className="space-y-2 rounded-2xl border-2 border-line p-4">
          <legend className="px-1 text-sm font-bold">Suspension des commandes</legend>
          <label className="flex min-h-12 items-center gap-2 font-bold"><input type="checkbox" name="paused" defaultChecked={s.orders_paused} className="h-5 w-5" />Suspendre temporairement les nouvelles commandes</label>
          <label className="block text-sm font-bold">Message affiché aux clients<input name="pauseMessage" defaultValue={s.pause_message ?? ""} maxLength={200} className="field mt-1" /></label>
          <p className="text-xs text-ink-soft">Les commandes déjà enregistrées restent consultables et payables.</p>
        </fieldset>

        <SubmitButton className="btn btn-primary btn-lg">Enregistrer</SubmitButton>
      </form>

      <section className="card space-y-1 p-5 text-sm">
        <h2 className="text-lg font-bold">Moyens de paiement</h2>
        <p>Les moyens proposés aux clients (MonCash, etc.) se gèrent dans <Link className="font-bold underline" href="/admin/moyens-paiement">Moyens de paiement</Link>.</p>
      </section>

      <section className="card space-y-1 p-5 text-sm">
        <h2 className="text-lg font-bold">État technique</h2>
        <p>Paiement en ligne : <strong>désactivé dans cette version</strong> (paiement organisé hors site)</p>
        <p>Fuseau horaire des dates : America/Port-au-Prince</p>
        <p>Confirmations par e-mail : {env.emailEnabled() ? "activées" : "non configurées"}</p>
      </section>
    </div>
  );
}

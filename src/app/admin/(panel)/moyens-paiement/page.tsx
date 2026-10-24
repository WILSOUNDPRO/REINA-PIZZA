import { getSql } from "@/server/db";
import { listPaymentMethods } from "@/server/paymentMethods";
import { deleteMethodAction, saveMethodAction } from "../../actions";
import { Flash } from "@/components/admin/Flash";
import { SubmitButton } from "@/components/admin/SubmitButton";

export default async function PaymentMethodsPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const methods = await listPaymentMethods(getSql());
  return (
    <div className="max-w-3xl space-y-5">
      <Flash sp={sp} />
      <div>
        <h1 className="text-3xl font-extrabold">Moyens de paiement</h1>
        <p className="mt-1 text-ink-soft">Proposés aux clients au moment de la commande. Seuls les moyens activés apparaissent.</p>
      </div>
      <div role="note" className="rounded-xl bg-cream-2 p-4 text-sm">
        <strong>Aucun paiement n'est effectué sur le site.</strong> Le client indique le moyen souhaité ; le paiement est ensuite organisé directement avec Reina Pizza, sur WhatsApp ou par téléphone, après confirmation de la commande. Choisir un moyen ne signifie jamais que la commande est payée : seul un administrateur peut confirmer la réception d'un paiement, depuis la commande.
      </div>

      {methods.map((m) => (
        <div key={m.id} className="card space-y-3 p-4">
          <form action={saveMethodAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="id" value={m.id} />
            <label className="block text-sm font-bold">Nom<input name="label" defaultValue={m.label} required maxLength={80} className="field mt-1" /></label>
            <label className="block text-sm font-bold">Ordre d'affichage<input name="position" type="number" defaultValue={m.position} className="field mt-1" /></label>
            <label className="block text-sm font-bold sm:col-span-2">Instructions pour le client (facultatif)
              <textarea name="instructions" defaultValue={m.instructions ?? ""} maxLength={500} rows={2} className="field mt-1" placeholder="Ex. : le paiement se fait après confirmation, sur le numéro indiqué." />
            </label>
            <label className="block text-sm font-bold">Numéro ou compte destinataire (facultatif)<input name="recipientAccount" defaultValue={m.recipient_account ?? ""} maxLength={60} inputMode="text" className="field mt-1" /></label>
            <label className="block text-sm font-bold">Nom du bénéficiaire (facultatif)<input name="recipientName" defaultValue={m.recipient_name ?? ""} maxLength={100} className="field mt-1" /></label>
            <label className="flex min-h-11 items-center gap-2 text-sm font-bold"><input type="checkbox" name="enabled" defaultChecked={m.enabled} className="h-5 w-5" />Activé (proposé aux clients)</label>
            <div className="flex items-center justify-end"><SubmitButton className="btn btn-basil">Enregistrer</SubmitButton></div>
          </form>
          {m.label === "MonCash" && !m.recipient_account && (
            <p className="rounded-lg bg-amber-100 p-3 text-xs font-semibold text-amber-950">Le numéro de réception MonCash n'est pas renseigné. Il n'est pas supposé identique au numéro de contact de Reina Pizza : complétez-le ici.</p>
          )}
          <form action={deleteMethodAction} className="border-t border-line pt-3"><input type="hidden" name="id" value={m.id} /><SubmitButton className="btn btn-ghost text-sm" confirm={`Supprimer « ${m.label} » ? Les commandes déjà passées gardent leur choix.`}>Supprimer</SubmitButton></form>
        </div>
      ))}

      <section aria-labelledby="ajout" className="card space-y-3 p-4">
        <h2 id="ajout" className="text-xl font-extrabold">Ajouter un moyen de paiement</h2>
        <form action={saveMethodAction} className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-bold">Nom<input name="label" required maxLength={80} className="field mt-1" /></label>
          <label className="block text-sm font-bold">Ordre d'affichage<input name="position" type="number" defaultValue={10} className="field mt-1" /></label>
          <label className="block text-sm font-bold sm:col-span-2">Instructions pour le client (facultatif)<textarea name="instructions" maxLength={500} rows={2} className="field mt-1" /></label>
          <label className="block text-sm font-bold">Numéro ou compte destinataire (facultatif)<input name="recipientAccount" maxLength={60} className="field mt-1" /></label>
          <label className="block text-sm font-bold">Nom du bénéficiaire (facultatif)<input name="recipientName" maxLength={100} className="field mt-1" /></label>
          <div className="sm:col-span-2"><SubmitButton className="btn btn-primary">Ajouter</SubmitButton></div>
        </form>
      </section>
    </div>
  );
}

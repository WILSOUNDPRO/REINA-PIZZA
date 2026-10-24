import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSql } from "@/server/db";
import { getOrderByToken } from "@/server/orders";
import { getSettings } from "@/server/settings";
import { paymentsAvailable } from "@/server/payments/index";
import { allow, clientKey } from "@/server/ratelimit";
import { payState } from "@/lib/orderState";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { formatPhoneDisplay } from "@/lib/phone";
import { locationHref } from "@/lib/location";
import { customerContactMessage, waLink } from "@/lib/whatsapp";
import { OrderActions } from "@/components/OrderActions";
import { PrintButton } from "@/components/PrintButton";
import { FeeBadge, OrderStatusBadge, PaymentStatusBadge } from "@/components/StatusBadge";

export const metadata: Metadata = { title: "Ma commande", robots: { index: false, follow: false } };

const PAY_NOTES: Record<string, { tone: string; text: string }> = {
  await_fee: { tone: "bg-amber-100", text: "Frais de livraison à confirmer. Nous étudions votre adresse et fixons les frais ; vous ne payez rien pour l'instant. Revenez sur cette page ou attendez notre message WhatsApp." },
  expired: { tone: "bg-amber-100", text: "Ce total a expiré. Contactez Reina Pizza pour le renouveler." },
  review: { tone: "bg-red-100", text: "Un paiement reçu doit être vérifié par Reina Pizza (montant ou total différent). Contactez-nous : ne payez pas une seconde fois." },
  order_cancelled: { tone: "bg-stone-200", text: "Cette commande est annulée." },
};

export default async function OrderPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ paiement?: string }> }) {
  const { token } = await params;
  const { paiement } = await searchParams;
  const sql = getSql();
  // Freine l'énumération de jetons (le jeton fait 256 bits : l'attaque reste impraticable, ceci limite surtout le bruit).
  if (!(await allow(sql, `tokview:${await clientKey()}`, 120, 600))) notFound();
  const found = await getOrderByToken(sql, token);
  if (!found) notFound();
  const { order: o, items } = found;
  const settings = await getSettings(sql);
  const state = payState(o);
  const [paid] = await sql<{ provider: string; paid_at: Date; amount_minor: number }[]>`
    select provider, paid_at, amount_minor from payments where order_id = ${o.id} and status = 'paid'`;
  const money = (n: number) => formatMoney(n, o.currency);
  const note = PAY_NOTES[state];

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 pt-8">
      <header className="space-y-2">
        <p className="text-sm font-bold uppercase tracking-wide text-ink-soft">Votre commande</p>
        <h1 className="text-4xl font-extrabold">Référence <span className="whitespace-nowrap text-tomato">{o.ref}</span></h1>
        <p className="text-sm text-ink-soft">Passée le {formatDateTime(o.created_at)} (heure de Port-au-Prince). Conservez ce lien : il donne accès à votre commande.</p>
        <div className="flex flex-wrap gap-2">
          <OrderStatusBadge status={o.order_status} />
          <PaymentStatusBadge status={state === "await_fee" || state === "needs_acceptance" ? "unpaid" : o.payment_status} />
          <FeeBadge status={o.fee_status} />
        </div>
      </header>

      {note && <p role="status" className={`rounded-2xl p-4 text-sm ${note.tone}`}>{note.text}</p>}

      <OrderActions token={token} state={state} totalLabel={o.total_minor === null ? null : money(o.total_minor)} paymentsEnabled={paymentsAvailable()} returning={paiement === "retour"} />

      <section className="card p-5" aria-labelledby="articles">
        <h2 id="articles" className="mb-3 text-2xl font-bold">Articles</h2>
        <ul className="divide-y divide-line">
          {items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3 py-2">
              <span>
                <strong>{i.quantity} × {i.product_name}</strong> <span className="text-ink-soft">({i.size})</span>
                {i.extras.length > 0 && <span className="block text-sm text-ink-soft">+ {i.extras.map((e) => e.name).join(", ")}</span>}
                <span className="block text-xs text-ink-soft">{money(i.unit_price_minor)} l'unité</span>
              </span>
              <span className="font-semibold">{money(i.line_total_minor)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1 border-t border-line pt-3">
          <div className="flex justify-between"><dt>Sous-total</dt><dd>{money(o.subtotal_minor)}</dd></div>
          <div className="flex justify-between"><dt>Livraison{o.delivery_zone_name ? ` (${o.delivery_zone_name})` : ""}</dt><dd>{o.delivery_fee_minor === null ? "À confirmer" : money(o.delivery_fee_minor)}</dd></div>
          <div className="flex justify-between text-xl font-extrabold"><dt>Total</dt><dd>{o.total_minor === null ? "Frais à confirmer" : money(o.total_minor)}</dd></div>
        </dl>
        {o.total_expires_at && o.payment_status !== "paid" && o.fee_status !== "to_confirm" && (
          <p className="mt-2 text-xs text-ink-soft">Ce total est valable jusqu'au {formatDateTime(o.total_expires_at)}.</p>
        )}
      </section>

      <section className="card p-5" aria-labelledby="livraison">
        <h2 id="livraison" className="mb-3 text-2xl font-bold">Livraison</h2>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div><dt className="font-bold">Nom</dt><dd>{o.customer_name}</dd></div>
          <div><dt className="font-bold">Téléphone</dt><dd>{formatPhoneDisplay(o.customer_phone)}</dd></div>
          {o.customer_whatsapp && <div><dt className="font-bold">WhatsApp</dt><dd>{formatPhoneDisplay(o.customer_whatsapp)}</dd></div>}
          {o.customer_email && <div><dt className="font-bold">E-mail</dt><dd>{o.customer_email}</dd></div>}
          <div><dt className="font-bold">Commune</dt><dd>{o.commune}</dd></div>
          <div><dt className="font-bold">Quartier / zone</dt><dd>{o.quarter}</dd></div>
          <div className="sm:col-span-2"><dt className="font-bold">Adresse</dt><dd>{o.address}</dd></div>
          <div className="sm:col-span-2"><dt className="font-bold">Point de repère</dt><dd>{o.landmark}</dd></div>
          {o.gps_location && <div className="sm:col-span-2"><dt className="font-bold">Position</dt><dd><a className="underline" href={locationHref(o.gps_location)} target="_blank" rel="noopener noreferrer">{o.gps_location.startsWith("http") ? "Voir sur la carte" : o.gps_location}</a></dd></div>}
          {o.delivery_instructions && <div className="sm:col-span-2"><dt className="font-bold">Instructions</dt><dd>{o.delivery_instructions}</dd></div>}
          {o.notes && <div className="sm:col-span-2"><dt className="font-bold">Remarques</dt><dd>{o.notes}</dd></div>}
        </dl>
      </section>

      {paid && o.payment_status === "paid" && (
        <section className="card border-2 !border-basil p-5" aria-labelledby="recu">
          <h2 id="recu" className="text-2xl font-bold text-basil">Reçu de paiement</h2>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between"><dt>Commande</dt><dd>{o.ref}</dd></div>
            <div className="flex justify-between"><dt>Payé le</dt><dd>{formatDateTime(paid.paid_at)}</dd></div>
            <div className="flex justify-between"><dt>Montant payé</dt><dd className="font-bold">{money(paid.amount_minor)}</dd></div>
            {paid.provider === "simulation" && <div className="flex justify-between"><dt>Mode</dt><dd className="font-bold text-tomato">Paiement SIMULÉ (test, sans valeur)</dd></div>}
          </dl>
          <p className="mt-2 text-xs text-ink-soft">Ce reçu confirme la réception du paiement par le prestataire. {o.order_status === "cancelled" && "La commande a été annulée : aucun remboursement n'est automatique, Reina Pizza vous contactera."}</p>
        </section>
      )}

      <div className="no-print flex flex-col gap-3 sm:flex-row">
        <a className="btn btn-basil btn-lg" href={waLink(settings.whatsapp_number, customerContactMessage(o.ref))} target="_blank" rel="noopener noreferrer">Contacter Reina Pizza sur WhatsApp</a>
        <PrintButton label={o.payment_status === "paid" ? "Imprimer le reçu" : "Imprimer la confirmation"} />
      </div>
      <p className="no-print pb-4 text-xs text-ink-soft">La transmission de votre commande à Reina Pizza ne dépend pas de WhatsApp : elle est déjà enregistrée. Le bouton sert uniquement à nous écrire.</p>
    </div>
  );
}

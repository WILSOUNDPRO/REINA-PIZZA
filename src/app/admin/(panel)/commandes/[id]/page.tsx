import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getSql } from "@/server/db";
import { acknowledgeOrder, getOrderById } from "@/server/orders";
import { getSettings } from "@/server/settings";
import { env } from "@/server/env";
import { payState } from "@/lib/orderState";
import { allowedNextStatuses, EVENT_LABELS, ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, type OrderStatus, type PaymentStatus } from "@/lib/labels";
import { formatMoney, minorToInput } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { formatPhoneDisplay, phoneToWaDigits } from "@/lib/phone";
import { locationHref } from "@/lib/location";
import { adminToCustomerMessage, waLink } from "@/lib/whatsapp";
import { setFeeAction, updateStatusAction } from "../../../actions";
import { Flash } from "@/components/admin/Flash";
import { CopyButton } from "@/components/admin/CopyButton";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { FeeBadge, OrderStatusBadge, PaymentStatusBadge } from "@/components/StatusBadge";

function eventText(kind: string, from: string | null, to: string | null, currency: string, meta: Record<string, unknown>) {
  const m = (v: string | null) => (v === null ? "—" : formatMoney(Number(v), currency as "HTG" | "USD"));
  if (kind === "status") return `${ORDER_STATUS_LABELS[from as OrderStatus] ?? from} → ${ORDER_STATUS_LABELS[to as OrderStatus] ?? to}${meta.refund ? " (aucun remboursement automatique : à traiter manuellement)" : ""}`;
  if (kind === "delivery_fee") return `${m(from)} → ${m(to)}`;
  if (kind === "fee_accepted") return `Total accepté : ${m(to)}`;
  if (kind === "payment") return `${PAYMENT_STATUS_LABELS[from as PaymentStatus] ?? from ?? "—"} → ${PAYMENT_STATUS_LABELS[to as PaymentStatus] ?? to}${meta.reason ? ` (${meta.reason})` : ""}${meta.action ? ` — ${meta.action}` : ""}`;
  return to ?? "";
}

export default async function OrderDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const sql = getSql();
  const data = await getOrderById(sql, id);
  if (!data) notFound();
  const { order: o, items, events, payments } = data;
  await acknowledgeOrder(sql, o.id);
  const settings = await getSettings(sql);
  const h = await headers();
  const origin = env.siteUrl() || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const link = `${origin}/commande/${o.access_token}`;
  const state = payState(o);
  const money = (n: number) => formatMoney(n, o.currency);
  const customerDigits = phoneToWaDigits(o.customer_whatsapp ?? o.customer_phone);
  const canSetFee = !["paid", "review"].includes(o.payment_status) && !["cancelled", "delivered"].includes(o.order_status);
  const next = allowedNextStatuses(o.order_status);

  return (
    <div className="space-y-5">
      <Flash sp={sp} />
      <header className="space-y-2">
        <h1 className="text-3xl font-extrabold">Commande {o.ref}</h1>
        <p className="text-sm text-ink-soft">Passée le {formatDateTime(o.created_at)} · {o.delivery_mode === "zone" ? `Zone : ${o.delivery_zone_name ?? "—"}` : "Estimation de livraison demandée"}</p>
        <div className="flex flex-wrap gap-2"><OrderStatusBadge status={o.order_status} /><PaymentStatusBadge status={o.payment_status} /><FeeBadge status={o.fee_status} />{o.has_demo_items && <span className="badge bg-cream-2">Contient des produits de démonstration</span>}</div>
        {o.order_status === "cancelled" && o.payment_status === "paid" && <p role="alert" className="rounded-xl bg-amber-100 p-3 text-sm font-bold">Commande annulée mais PAYÉE : aucun remboursement n'est effectué automatiquement. Remboursez via le prestataire si nécessaire.</p>}
        {o.payment_status === "review" && <p role="alert" className="rounded-xl bg-red-100 p-3 text-sm font-bold">Un paiement a été reçu avec un montant ou un total différent : vérifiez-le auprès du prestataire avant toute action.</p>}
        {payments.some((p) => p.status === "duplicate") && <p role="alert" className="rounded-xl bg-red-100 p-3 text-sm font-bold">Un paiement en double a été détecté : un remboursement manuel est probablement nécessaire.</p>}
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card space-y-2 p-5" aria-labelledby="client">
          <h2 id="client" className="text-xl font-bold">Client et adresse</h2>
          <p className="font-bold">{o.customer_name}</p>
          <p><a className="underline" href={`tel:${o.customer_phone}`}>{formatPhoneDisplay(o.customer_phone)}</a>{o.customer_whatsapp && <> · WhatsApp {formatPhoneDisplay(o.customer_whatsapp)}</>}</p>
          {o.customer_email && <p className="text-sm">{o.customer_email}</p>}
          <p>{o.address}<br />{o.quarter}, {o.commune}</p>
          <p className="text-sm"><strong>Repère :</strong> {o.landmark}</p>
          {o.gps_location && <p className="text-sm"><a className="underline" href={locationHref(o.gps_location)} target="_blank" rel="noopener noreferrer">📍 {o.gps_location.startsWith("http") ? "Ouvrir la carte" : o.gps_location}</a></p>}
          {o.delivery_instructions && <p className="text-sm"><strong>Instructions :</strong> {o.delivery_instructions}</p>}
          {o.notes && <p className="text-sm"><strong>Remarques :</strong> {o.notes}</p>}
          <a className="btn btn-basil" target="_blank" rel="noopener noreferrer" href={waLink(customerDigits, `Bonjour, au sujet de votre commande Reina Pizza ${o.ref}.`)}>Contacter le client sur WhatsApp</a>
        </section>

        <section className="card space-y-3 p-5" aria-labelledby="statut">
          <h2 id="statut" className="text-xl font-bold">Statut de la commande</h2>
          {next.length === 0 ? <p className="text-sm text-ink-soft">Commande terminée : le statut ne peut plus changer.</p> : (
            <form action={updateStatusAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="orderId" value={o.id} />
              <label className="flex-1 text-sm font-bold">Nouveau statut
                <select name="status" className="field mt-1" defaultValue="">
                  <option value="" disabled>Choisir…</option>
                  {next.map((s) => <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>)}
                </select>
              </label>
              <SubmitButton>Mettre à jour</SubmitButton>
            </form>
          )}
          <p className="text-xs text-ink-soft">Le statut de paiement est indépendant : il ne change que par confirmation du prestataire. Annuler ne rembourse pas.</p>
        </section>
      </div>

      <section className="card space-y-3 p-5" aria-labelledby="frais">
        <h2 id="frais" className="text-xl font-bold">Frais de livraison et lien client</h2>
        <dl className="grid gap-1 text-sm sm:grid-cols-3">
          <div><dt className="font-bold">Sous-total</dt><dd>{money(o.subtotal_minor)}</dd></div>
          <div><dt className="font-bold">Livraison</dt><dd>{o.delivery_fee_minor === null ? "À confirmer" : money(o.delivery_fee_minor)}</dd></div>
          <div><dt className="font-bold">Total</dt><dd className="text-lg font-extrabold">{o.total_minor === null ? "—" : money(o.total_minor)}</dd></div>
        </dl>
        {o.total_expires_at && o.payment_status !== "paid" && <p className="text-xs text-ink-soft">Total valable jusqu'au {formatDateTime(o.total_expires_at)}{state === "expired" ? " — EXPIRÉ" : ""}.</p>}
        {canSetFee ? (
          <form action={setFeeAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="orderId" value={o.id} />
            <label className="text-sm font-bold">{o.fee_status === "to_confirm" ? "Fixer les frais de livraison" : "Modifier / renouveler les frais"} ({o.currency})
              <input name="fee" inputMode="decimal" required defaultValue={minorToInput(o.delivery_fee_minor)} className="field mt-1" placeholder="0,00" />
            </label>
            <SubmitButton confirm={o.fee_status === "to_confirm" ? undefined : "Le client devra accepter à nouveau le total et toute session de paiement ouverte sera annulée. Continuer ?"}>Enregistrer les frais</SubmitButton>
          </form>
        ) : <p className="text-sm text-ink-soft">Le total ne peut plus être modifié.</p>}
        <div className="space-y-2 border-t border-line pt-3">
          <p className="text-sm font-bold">Lien sécurisé de consultation et de paiement</p>
          <input readOnly value={link} className="field text-xs" aria-label="Lien client" onFocus={undefined} />
          <div className="flex flex-wrap gap-2">
            <CopyButton text={link} />
            <a className="btn btn-basil !min-h-11 text-sm" target="_blank" rel="noopener noreferrer" href={waLink(customerDigits, adminToCustomerMessage(o.ref, link))}>Envoyer par WhatsApp</a>
          </div>
          <p className="text-xs text-ink-soft">Toute personne ayant ce lien voit la commande : ne le publiez pas. {state === "await_fee" ? "Fixez d'abord les frais : le client ne peut pas payer avant." : state === "needs_acceptance" ? "Le client doit accepter le total avant de payer." : ""}</p>
        </div>
      </section>

      <section className="card p-5" aria-labelledby="articles">
        <h2 id="articles" className="mb-2 text-xl font-bold">Articles (prix au moment de l'achat)</h2>
        <ul className="divide-y divide-line">
          {items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3 py-2 text-sm">
              <span><strong>{i.quantity} × {i.product_name}</strong> ({i.size}){i.is_demo && <span className="badge ml-1 bg-cream-2">démo</span>}{i.extras.length > 0 && <span className="block text-ink-soft">+ {i.extras.map((e) => `${e.name} (${money(e.price_minor)})`).join(", ")}</span>}<span className="block text-xs text-ink-soft">{money(i.unit_price_minor)} l'unité</span></span>
              <span className="font-semibold">{money(i.line_total_minor)}</span>
            </li>
          ))}
        </ul>
      </section>

      {payments.length > 0 && (
        <section className="card p-5" aria-labelledby="paiements">
          <h2 id="paiements" className="mb-2 text-xl font-bold">Tentatives de paiement</h2>
          <ul className="space-y-1 text-sm">{payments.map((p) => <li key={p.id}>{formatDateTime(p.created_at)} · {p.provider} · {money(p.amount_minor)} · <strong>{p.status}</strong>{p.paid_at && ` · confirmé ${formatDateTime(p.paid_at)}`}</li>)}</ul>
        </section>
      )}

      <section className="card p-5" aria-labelledby="historique">
        <h2 id="historique" className="mb-2 text-xl font-bold">Historique</h2>
        <ol className="space-y-2 text-sm">
          {events.map((e) => (
            <li key={e.id} className="border-l-4 border-line pl-3">
              <p className="font-bold">{EVENT_LABELS[e.kind] ?? e.kind} <span className="font-normal text-ink-soft">· {formatDateTime(e.created_at)} · {e.actor}</span></p>
              <p className="text-ink-soft">{eventText(e.kind, e.from_value, e.to_value, o.currency, e.meta)}</p>
            </li>
          ))}
        </ol>
      </section>
      <p className="text-xs text-ink-soft">Devise de la commande : {o.currency} · réglage actuel : {settings.currency ?? "non confirmée"}</p>
    </div>
  );
}

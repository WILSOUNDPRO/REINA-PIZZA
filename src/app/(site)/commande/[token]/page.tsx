import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { getSql } from "@/server/db";
import { getOrderByToken } from "@/server/orders";
import { getSettings } from "@/server/settings";
import { allow, clientKey } from "@/server/ratelimit";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { formatPhoneDisplay, normalizePhone } from "@/lib/phone";
import { locationHref } from "@/lib/location";
import { buildOrderMessage, waLink } from "@/lib/whatsapp";
import { PAYMENT_STATUS_LABELS } from "@/lib/labels";
import { OrderMessageActions } from "@/components/OrderMessageActions";
import { Logo } from "@/components/Logo";
import { PrintButton } from "@/components/PrintButton";
import { FeeBadge, OrderStatusBadge, PaymentStatusBadge } from "@/components/StatusBadge";

export const metadata: Metadata = { title: "Ma commande", robots: { index: false, follow: false } };

export default async function OrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sql = getSql();
  // Freine l'énumération de jetons (256 bits : l'attaque reste impraticable, ceci limite le bruit).
  if (!(await allow(sql, `tokview:${await clientKey()}`, 120, 600))) notFound();
  const found = await getOrderByToken(sql, token);
  if (!found) notFound();
  const { order: o, items } = found;
  const settings = await getSettings(sql);
  const money = (n: number) => formatMoney(n, o.currency);
  const feeKnown = o.delivery_fee_minor !== null && o.total_minor !== null;
  // Le message est construit côté serveur depuis les données enregistrées ; il ne contient jamais le jeton d'accès.
  const message = buildOrderMessage(o, items);
  const waUrl = waLink(settings.whatsapp_number, message);
  const phone = normalizePhone(settings.phone) ?? `+${settings.whatsapp_number}`;
  const confirmedPay = o.payment_status === "confirmed_manually" || o.payment_status === "paid";

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 pt-8">
      <div className="hidden items-center justify-between print:flex"><Logo className="h-14 w-auto" /><p className="text-sm">Delmas 33, rue Charbonnier, impasse Costo, Haïti<br />{settings.phone}</p></div>
      <header className="space-y-2">
        <p className="inline-flex items-center gap-1 text-sm font-bold uppercase tracking-wide text-basil"><Check size={16} aria-hidden="true" />Commande enregistrée</p>
        <h1 className="text-3xl font-extrabold sm:text-4xl">Votre commande a été enregistrée</h1>
        <p className="text-lg">Référence <strong className="whitespace-nowrap text-2xl text-tomato">{o.ref}</strong></p>
        <p className="text-sm text-ink-soft">Enregistrée le {formatDateTime(o.created_at)} (heure de Port-au-Prince). Conservez cette page : le lien donne accès à votre commande.</p>
        <div className="flex flex-wrap gap-2">
          <OrderStatusBadge status={o.order_status} />
          <PaymentStatusBadge status={o.payment_status} />
          <FeeBadge status={o.fee_status} />
        </div>
        {o.order_status === "to_confirm" && <p role="status" className="rounded-2xl bg-amber-100 p-4 font-bold">En attente de confirmation par la pizzeria.</p>}
      </header>

      <section className="no-print card space-y-3 !border-basil p-5" aria-labelledby="suite">
        <h2 id="suite" className="text-2xl font-bold">Prochaine étape</h2>
        <p className="text-sm">La pizzeria a reçu votre commande dans son espace de gestion, même si vous n'ouvrez pas WhatsApp. Pour confirmer la livraison, les frais éventuels et le paiement, contactez-la. <strong>Le bouton ouvre un brouillon de message : c'est à vous de l'envoyer.</strong></p>
        <OrderMessageActions waUrl={waUrl} message={message} phoneHref={`tel:${phone}`} />
      </section>

      <section className="card p-5" aria-labelledby="articles">
        <h2 id="articles" className="mb-3 text-2xl font-bold">Articles</h2>
        <ul className="divide-y divide-line">
          {items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3 py-2">
              <span>
                <strong>{i.quantity} × {i.product_name}</strong> <span className="text-ink-soft">(taille {i.size})</span>
                {i.extras.length > 0 && <span className="block text-sm text-ink-soft">+ {i.extras.map((e) => e.name).join(", ")}</span>}
                <span className="block text-xs text-ink-soft">{money(i.unit_price_minor)} l'unité</span>
              </span>
              <span className="font-semibold">{money(i.line_total_minor)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1 border-t border-line pt-3">
          <div className="flex justify-between"><dt>Sous-total des produits</dt><dd>{money(o.subtotal_minor)}</dd></div>
          <div className="flex justify-between"><dt>Livraison{o.delivery_zone_name ? ` (${o.delivery_zone_name})` : ""}</dt><dd>{o.delivery_fee_minor === null ? "À confirmer selon l'adresse" : money(o.delivery_fee_minor)}</dd></div>
          {feeKnown && <div className="flex justify-between text-xl font-extrabold"><dt>Total</dt><dd>{money(o.total_minor!)}</dd></div>}
        </dl>
        {!feeKnown && <p className="mt-2 text-sm text-ink-soft">Frais de livraison à confirmer selon votre adresse. Le montant des pizzas ci-dessus n'est pas un total final.</p>}
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
          {o.gps_location && <div className="sm:col-span-2"><dt className="font-bold">Localisation</dt><dd><a className="underline" href={locationHref(o.gps_location)} target="_blank" rel="noopener noreferrer">{o.gps_location.startsWith("http") ? "Voir sur la carte" : o.gps_location}</a></dd></div>}
          {o.delivery_instructions && <div className="sm:col-span-2"><dt className="font-bold">Instructions</dt><dd>{o.delivery_instructions}</dd></div>}
          {o.notes && <div className="sm:col-span-2"><dt className="font-bold">Remarques</dt><dd>{o.notes}</dd></div>}
        </dl>
      </section>

      <section className="card p-5" aria-labelledby="paiement">
        <h2 id="paiement" className="mb-2 text-2xl font-bold">Paiement</h2>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between gap-3"><dt>Moyen souhaité</dt><dd className="text-right">{o.payment_method ?? "—"}{o.payment_method_note ? ` — ${o.payment_method_note}` : ""}</dd></div>
          <div className="flex justify-between gap-3"><dt>Statut</dt><dd className="text-right font-bold">{PAYMENT_STATUS_LABELS[o.payment_status]}</dd></div>
          {confirmedPay && o.paid_at && <div className="flex justify-between gap-3"><dt>Confirmé le</dt><dd>{formatDateTime(o.paid_at)}</dd></div>}
        </dl>
        <p className="mt-2 text-xs text-ink-soft">Le paiement est organisé directement avec la pizzeria. Aucun paiement n'est effectué sur le site. Seule Reina Pizza peut confirmer qu'un paiement a été reçu.</p>
      </section>

      <div className="no-print"><PrintButton label="Imprimer la confirmation de commande" /></div>
      <p className="hidden text-xs print:block">Confirmation de commande {o.ref} — ce document n'est pas un reçu de paiement.</p>
    </div>
  );
}

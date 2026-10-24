import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, CreditCard, Home, Info, Landmark, MapPin, MessageCircle, Navigation, Phone, StickyNote, User, XCircle } from "lucide-react";
import { getSql } from "@/server/db";
import { getOrderByToken } from "@/server/orders";
import { getSettings } from "@/server/settings";
import { allow, clientKey } from "@/server/ratelimit";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { formatPhoneDisplay, normalizePhone } from "@/lib/phone";
import { locationHref } from "@/lib/location";
import { buildOrderMessage, waLink } from "@/lib/whatsapp";
import { PAYMENT_STATUS_LABELS, ORDER_STATUS_LABELS } from "@/lib/labels";
import { Logo } from "@/components/Logo";
import { ProductImage } from "@/components/ProductCard";
import { OrderMessageActions } from "@/components/OrderMessageActions";
import { OrderProgress } from "@/components/OrderProgress";
import { CopyRef } from "@/components/CopyRef";

export const metadata: Metadata = { title: "Ma commande", robots: { index: false, follow: false } };

const SUBTITLE = { to_confirm: "En attente de confirmation", confirmed: "Confirmée par la pizzeria", preparing: "En préparation", out_for_delivery: "En livraison", delivered: "Livrée", cancelled: "Annulée" } as const;

function Row({ Icon, children, label }: { Icon: typeof User; children: React.ReactNode; label: string }) {
  return (
    <li className="flex gap-3">
      <Icon size={18} className="mt-0.5 shrink-0 text-tomato" aria-hidden="true" />
      <span className="min-w-0 break-words"><span className="sr-only">{label} : </span>{children}</span>
    </li>
  );
}

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
  const cancelled = o.order_status === "cancelled";
  // Instructions de paiement actuelles du moyen choisi (retrouvé par son nom enregistré) : affichées seulement après confirmation de la commande.
  const [cur] = o.payment_method
    ? await sql<{ instructions: string | null; recipient_account: string | null; recipient_name: string | null }[]>`select * from payment_methods where label = ${o.payment_method} and enabled`
    : [];
  const hasPayInfo = !!(cur && (cur.instructions || cur.recipient_account || cur.recipient_name));
  const showPayInfo = hasPayInfo && o.order_status !== "to_confirm" && !cancelled;
  const confirmedPay = o.payment_status === "confirmed_manually" || o.payment_status === "paid";

  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 pb-4 pt-6">
      <div className="hidden items-center justify-between print:flex"><Logo className="h-14 w-auto" /><p className="text-right text-sm">Delmas 33, rue Charbonnier, impasse Costo, Haïti<br />{settings.phone}</p></div>

      <header className="space-y-3 text-center">
        {/* L'icône confirme uniquement l'ENREGISTREMENT de la commande, pas la disponibilité ni le paiement. */}
        <span className={`mx-auto grid h-16 w-16 place-items-center rounded-full ${cancelled ? "bg-stone-200 text-stone-700" : "bg-[#e3f2ea] text-basil"}`}>
          {cancelled ? <XCircle size={32} aria-hidden="true" /> : <Check size={34} strokeWidth={2.5} aria-hidden="true" />}
        </span>
        <div>
          <h1 className="text-3xl font-extrabold">{cancelled ? "Commande annulée" : "Commande enregistrée"}</h1>
          <p className="mt-1 text-lg text-ink-soft">{cancelled ? "Enregistrée puis annulée" : SUBTITLE[o.order_status]}</p>
          {o.order_status === "to_confirm" && <p className="mx-auto mt-1 max-w-sm text-xs text-ink-soft">L'enregistrement ne confirme ni la disponibilité ni le paiement : la pizzeria doit d'abord confirmer.</p>}
        </div>
        <CopyRef value={o.ref} />
        <p className="text-xs text-ink-soft">Enregistrée le {formatDateTime(o.created_at)} (heure de Port-au-Prince). Conservez cette page : le lien donne accès à votre commande.</p>
      </header>

      <OrderProgress status={o.order_status} />

      <section className="card space-y-3 p-4" aria-labelledby="detail">
        <h2 id="detail" className="text-lg font-extrabold">Détail de la commande</h2>
        <ul className="divide-y divide-line">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 py-3 first:pt-0">
              <ProductImage url={i.image_url ?? null} defaultImage={i.default_image} name={i.product_name} className="h-[48px] w-16 shrink-0 rounded-lg" sizes="64px" showBadge={false} />
              <span className="min-w-0 flex-1">
                <strong className="block">{i.product_name} · {i.size}</strong>
                <span className="block text-sm text-ink-soft">{i.quantity} × {money(i.unit_price_minor)}</span>
                {i.extras.length > 0 && <span className="block text-xs text-ink-soft">+ {i.extras.map((e) => e.name).join(", ")}</span>}
              </span>
              <span className="shrink-0 font-bold">{money(i.line_total_minor)}</span>
            </li>
          ))}
        </ul>
        <dl className="space-y-1 border-t border-line pt-3 text-sm">
          <div className="flex justify-between"><dt className="text-ink-soft">Sous-total</dt><dd className="font-semibold">{money(o.subtotal_minor)}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-soft">Livraison{o.delivery_zone_name ? ` (${o.delivery_zone_name})` : ""}</dt><dd className="font-semibold">{o.delivery_fee_minor === null ? "À confirmer" : money(o.delivery_fee_minor)}</dd></div>
          {feeKnown && <div className="flex justify-between border-t border-line pt-2 text-base"><dt className="font-extrabold">Total</dt><dd className="font-extrabold">{money(o.total_minor!)}</dd></div>}
        </dl>
        {!feeKnown && <p className="text-xs text-ink-soft">Frais de livraison à confirmer selon votre adresse : le sous-total n'est pas un total final.</p>}
      </section>

      <section className="card space-y-3 p-4" aria-labelledby="livraison">
        <h2 id="livraison" className="text-lg font-extrabold">Livraison</h2>
        <ul className="space-y-2.5 text-sm">
          <Row Icon={User} label="Nom"><strong>{o.customer_name}</strong></Row>
          <Row Icon={Phone} label="Téléphone">{formatPhoneDisplay(o.customer_phone)}</Row>
          {o.customer_whatsapp && o.customer_whatsapp !== o.customer_phone && <Row Icon={MessageCircle} label="WhatsApp">{formatPhoneDisplay(o.customer_whatsapp)}</Row>}
          <Row Icon={MapPin} label="Commune et quartier">{o.commune}, {o.quarter}</Row>
          <Row Icon={Home} label="Adresse">{o.address}</Row>
          <Row Icon={Landmark} label="Point de repère">{o.landmark}</Row>
          {o.gps_location && <Row Icon={Navigation} label="Localisation"><a className="underline" href={locationHref(o.gps_location)} target="_blank" rel="noopener noreferrer">{o.gps_location.startsWith("http") ? "Voir sur la carte" : o.gps_location}</a></Row>}
          {o.delivery_instructions && <Row Icon={Info} label="Instructions">{o.delivery_instructions}</Row>}
          {o.notes && <Row Icon={StickyNote} label="Remarques">{o.notes}</Row>}
        </ul>
      </section>

      <section className="card space-y-2 p-4" aria-labelledby="paiement">
        <h2 id="paiement" className="flex items-center gap-2 text-lg font-extrabold"><CreditCard size={20} className="text-tomato" aria-hidden="true" />Paiement</h2>
        <p className="text-sm"><span className="text-ink-soft">Moyen souhaité : </span><strong>{o.payment_method ?? "—"}</strong>{o.payment_method_note ? ` — ${o.payment_method_note}` : ""}</p>
        <p className="text-sm font-semibold">Le paiement sera organisé directement avec Reina Pizza après confirmation de la commande.</p>
        <p className="text-sm"><span className="text-ink-soft">Statut : </span><strong>{PAYMENT_STATUS_LABELS[o.payment_status]}</strong>{confirmedPay && o.paid_at ? ` (le ${formatDateTime(o.paid_at)})` : ""}</p>
        {showPayInfo && cur && (
          <div className="space-y-1 rounded-xl border border-line bg-cream p-3 text-sm">
            <p className="font-bold">Instructions de paiement — {o.payment_method}</p>
            {cur.instructions && <p>{cur.instructions}</p>}
            {cur.recipient_account && <p><span className="text-ink-soft">Numéro ou compte destinataire : </span><strong className="select-all">{cur.recipient_account}</strong></p>}
            {cur.recipient_name && <p><span className="text-ink-soft">Bénéficiaire : </span><strong>{cur.recipient_name}</strong></p>}
            <p className="text-xs text-ink-soft">Conservez la référence {o.ref} et confirmez votre paiement avec Reina Pizza sur WhatsApp.</p>
          </div>
        )}
        {hasPayInfo && !showPayInfo && !cancelled && <p className="text-xs text-ink-soft">Les instructions de paiement s'afficheront ici après confirmation de la commande par Reina Pizza.</p>}
        <p className="text-xs text-ink-soft">Aucun paiement n'est effectué sur le site. Seule Reina Pizza peut confirmer qu'un paiement a été reçu.</p>
      </section>

      <OrderMessageActions waUrl={waUrl} message={message} phoneHref={`tel:${phone}`} />
      <p className="hidden text-xs print:block">Confirmation de commande {o.ref} ({ORDER_STATUS_LABELS[o.order_status]}) — ce document n'est pas un reçu de paiement.</p>
    </div>
  );
}

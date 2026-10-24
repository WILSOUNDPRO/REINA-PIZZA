import { formatMoney } from "./money";
import { formatPhoneDisplay } from "./phone";
import type { Currency } from "./constants";

// Les liens WhatsApp ne contiennent JAMAIS le jeton d'accès à la commande.
export function waLink(digits: string, text?: string): string {
  const base = `https://wa.me/${digits.replace(/\D/g, "")}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

export function customerContactMessage(ref: string): string {
  return `Bonjour Reina Pizza, je vous contacte au sujet de ma commande ${ref}.`;
}

export type MessageOrder = {
  ref: string;
  currency: Currency;
  subtotal_minor: number;
  delivery_fee_minor: number | null;
  total_minor: number | null;
  customer_name: string;
  customer_phone: string;
  customer_whatsapp: string | null;
  commune: string;
  quarter: string;
  address: string;
  landmark: string;
  gps_location: string | null;
  delivery_instructions: string | null;
  notes: string | null;
  payment_method: string | null;
  payment_method_note: string | null;
};
export type MessageItem = { product_name: string; size: string; quantity: number; line_total_minor: number; extras: { name: string }[] };

const plain = (s: string) => s.replace(/[  ]/g, " "); // espaces normaux dans le message

/** Message complet construit à partir des données enregistrées par le serveur. Les lignes facultatives vides sont omises. */
export function buildOrderMessage(o: MessageOrder, items: MessageItem[]): string {
  const m = (n: number) => plain(formatMoney(n, o.currency));
  const feeKnown = o.delivery_fee_minor !== null && o.total_minor !== null;
  const L: string[] = [];
  L.push("Bonjour Reina Pizza 🍕", `Je souhaite confirmer ma commande n° ${o.ref}.`, "", "COMMANDE");
  for (const i of items) {
    const extras = i.extras.length ? ` (+ ${i.extras.map((e) => e.name).join(", ")})` : "";
    L.push(`• ${i.quantity} × ${i.product_name} — taille ${i.size}${extras} — ${m(i.line_total_minor)}`);
  }
  L.push("", `Sous-total des produits : ${m(o.subtotal_minor)}`);
  L.push(`Livraison : ${feeKnown ? m(o.delivery_fee_minor!) : "À confirmer selon mon adresse"}`);
  if (feeKnown) L.push(`Total : ${m(o.total_minor!)}`);

  L.push("", "LIVRAISON", `Nom : ${o.customer_name}`, `Téléphone : ${formatPhoneDisplay(o.customer_phone)}`);
  if (o.customer_whatsapp && o.customer_whatsapp !== o.customer_phone) L.push(`WhatsApp : ${formatPhoneDisplay(o.customer_whatsapp)}`);
  L.push(`Commune : ${o.commune}`, `Quartier : ${o.quarter}`, `Adresse : ${o.address}`, `Point de repère : ${o.landmark}`);
  if (o.gps_location) L.push(`Localisation : ${o.gps_location}`);
  if (o.delivery_instructions) L.push(`Instructions : ${o.delivery_instructions}`);

  L.push("", "PAIEMENT");
  if (o.payment_method) L.push(`Moyen souhaité : ${o.payment_method}${o.payment_method_note ? ` — ${o.payment_method_note}` : ""}`);
  L.push("Paiement à organiser directement avec la pizzeria.");
  if (o.notes) L.push("", `Remarques : ${o.notes}`);

  L.push("", "Merci de confirmer la disponibilité, les frais de livraison s'ils restent à définir et le délai estimé.");
  return L.join("\n");
}

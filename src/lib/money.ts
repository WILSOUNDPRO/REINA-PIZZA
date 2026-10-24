import type { Currency } from "./constants";

// Montants en unités mineures (centimes). La devise est toujours affichée en code (HTG / USD)
// pour éviter toute ambiguïté (« $ » peut désigner le dollar haïtien ou américain).
export function formatMoney(minor: number, currency: Currency | null | undefined): string {
  const d = minor % 100 === 0 ? 0 : 2; // « 1 500 HTG », « 1 250,50 HTG »
  const n = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(minor / 100).replace(/\u202f/g, "\u00a0"); // espace insécable ordinaire : plus lisible que l'espace fine
  return currency ? `${n} ${currency}` : `${n} (devise à confirmer)`;
}

/** « 1 250,50 », « 1250.5 », « 1250 » → 125050. Retourne null si invalide. */
export function parseMajorToMinor(input: string): number | null {
  const s = input.replace(/[\s  ]/g, "").replace(",", ".");
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

export function minorToInput(minor: number | null | undefined): string {
  if (minor == null) return "";
  return (minor / 100).toFixed(2);
}

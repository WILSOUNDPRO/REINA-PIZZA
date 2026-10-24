import type { Currency } from "./constants";

// Montants en unités mineures (centimes). La devise est toujours affichée en code (HTG / USD)
// pour éviter toute ambiguïté (« $ » peut désigner le dollar haïtien ou américain).
export function formatMoney(minor: number, currency: Currency | null | undefined): string {
  const n = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100);
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

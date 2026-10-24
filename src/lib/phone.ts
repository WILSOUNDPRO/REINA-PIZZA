// Normalisation des numéros : Haïti (+509 + 8 chiffres) accepté sous toutes les écritures usuelles ;
// numéros internationaux (diaspora) acceptés s'ils sont en format E.164 explicite (+…).
export function normalizePhone(input: string): string | null {
  let s = input.trim().replace(/[\s().\- ]/g, "");
  if (!/^\+?\d+$/.test(s)) return null;
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (s.startsWith("+")) {
    const digits = s.slice(1);
    if (digits.startsWith("509")) return /^509[2-9]\d{7}$/.test(digits) ? "+" + digits : null;
    return /^[1-9]\d{7,14}$/.test(digits) ? "+" + digits : null;
  }
  if (/^[2-9]\d{7}$/.test(s)) return "+509" + s;
  if (/^509[2-9]\d{7}$/.test(s)) return "+" + s;
  return null;
}

/** Chiffres seuls, utilisables dans un lien wa.me. */
export function phoneToWaDigits(e164: string): string {
  return e164.replace(/\D/g, "");
}

export function formatPhoneDisplay(e164: string): string {
  const m = /^\+509(\d{4})(\d{4})$/.exec(e164);
  return m ? `+509 ${m[1]}-${m[2]}` : e164;
}

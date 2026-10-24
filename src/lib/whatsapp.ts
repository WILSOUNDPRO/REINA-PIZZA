// Les liens WhatsApp ne contiennent jamais l'adresse ni d'autres données personnelles : seulement la référence.
export function waLink(digits: string, text?: string): string {
  const base = `https://wa.me/${digits.replace(/\D/g, "")}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

export function customerContactMessage(ref: string): string {
  return `Bonjour Reina Pizza, je vous contacte au sujet de ma commande ${ref}.`;
}

export function adminToCustomerMessage(ref: string, orderUrl: string): string {
  return `Bonjour, voici le détail et le total de votre commande Reina Pizza ${ref} : ${orderUrl}`;
}

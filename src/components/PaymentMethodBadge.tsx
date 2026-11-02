import Image from "next/image";
import { Banknote, HandCoins } from "lucide-react";

/** Pastille d'un moyen de paiement souhaité : logo MonCash, icône dorée pour les espèces, sinon icône neutre. Purement visuel : aucun paiement n'est effectué sur le site. */
export function PaymentMethodBadge({ label, className = "" }: { label: string; className?: string }) {
  const l = label.toLowerCase();
  const mon = l.includes("moncash");
  const cash = /esp[eè]ces|cash/.test(l) && !mon;
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border border-line bg-white/5 py-1 pl-1 pr-3 text-sm font-semibold ${className}`}>
      {mon ? (
        <Image src="/images/design/moncash.webp" alt="" width={28} height={28} className="h-7 w-7 rounded-lg" />
      ) : (
        <span className="grid h-7 w-7 place-items-center rounded-full bg-tomato/15 text-tomato">
          {cash ? <HandCoins size={18} aria-hidden="true" /> : <Banknote size={18} aria-hidden="true" />}
        </span>
      )}
      {label}
    </span>
  );
}

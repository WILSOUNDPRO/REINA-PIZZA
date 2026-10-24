import { Check, Truck, ChefHat, ClipboardCheck, CircleCheck, XCircle } from "lucide-react";
import type { OrderStatus } from "@/lib/labels";

const STEPS = [
  { label: "Enregistrée", Icon: ClipboardCheck },
  { label: "Confirmée", Icon: Check },
  { label: "En préparation", Icon: ChefHat },
  { label: "En livraison", Icon: Truck },
  { label: "Livrée", Icon: CircleCheck },
];
const INDEX: Record<Exclude<OrderStatus, "cancelled">, number> = { to_confirm: 0, confirmed: 1, preparing: 2, out_for_delivery: 3, delivered: 4 };

/** Progression alimentée par le vrai statut de la commande ; une commande annulée n'affiche jamais d'étape « en cours ». */
export function OrderProgress({ status }: { status: OrderStatus }) {
  if (status === "cancelled") {
    return (
      <div role="status" className="flex items-center gap-3 rounded-xl border border-line bg-stone-100 p-3 text-stone-800">
        <XCircle size={22} aria-hidden="true" className="shrink-0" />
        <p className="text-sm font-semibold">Cette commande a été annulée. Contactez Reina Pizza pour toute question.</p>
      </div>
    );
  }
  const active = INDEX[status];
  const done = status === "delivered";
  return (
    <ol aria-label="Progression de la commande" className="grid grid-cols-5 gap-1">
      {STEPS.map(({ label, Icon }, i) => {
        const state = i < active || (done && i === active) ? "done" : i === active ? "current" : "todo";
        return (
          <li key={label} aria-current={state === "current" ? "step" : undefined} className="relative flex flex-col items-center text-center">
            {i > 0 && <span aria-hidden="true" className={`absolute right-1/2 top-[15px] -z-0 h-0.5 w-full ${i <= active ? "bg-tomato" : "bg-line"}`} />}
            <span className={`relative z-10 grid h-8 w-8 place-items-center rounded-full border-2 ${state === "done" ? "border-tomato bg-tomato text-white" : state === "current" ? "border-tomato bg-white text-tomato ring-4 ring-[#f6e3e3]" : "border-line bg-white text-[#9a948b]"}`}>
              {state === "done" ? <Check size={16} aria-hidden="true" /> : <Icon size={15} aria-hidden="true" />}
            </span>
            <span className={`mt-1.5 text-[11px] leading-tight sm:text-xs ${state === "todo" ? "text-ink-soft" : "font-bold text-ink"}`}>{label}</span>
            <span className="sr-only">{state === "done" ? " : terminée" : state === "current" ? " : étape en cours" : " : à venir"}</span>
          </li>
        );
      })}
    </ol>
  );
}

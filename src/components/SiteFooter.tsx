import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { ChefHat, ChevronRight, Clock, MapPin, Phone, Truck } from "lucide-react";
import Link from "next/link";
import { Logo } from "./Logo";
import { waLink } from "@/lib/whatsapp";
import { normalizePhone } from "@/lib/phone";
import type { Settings } from "@/server/settings";

const RIBBON = [[ChefHat, "Préparation fraîche"], [Clock, "Ouvert 24h/24, 7j/7"], [Truck, "Livraison à domicile"], [WhatsAppIcon, "Commande WhatsApp"]] as const;
const LINKS = [["/", "Accueil"], ["/menu", "Menu"], ["/#apropos", "À propos"], ["/#contact", "Contact"]] as const;

export function SiteFooter({ s }: { s: Settings }) {
  const tel = normalizePhone(s.phone) ?? `+${s.whatsapp_number}`;
  return (
    <footer className="no-print mt-20 border-t border-line bg-cream/90 backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-4 pt-8">
        <ul className="glass flex flex-wrap items-center justify-center gap-x-8 gap-y-3 rounded-3xl px-5 py-3 text-sm font-semibold sm:rounded-full" aria-label="Nos engagements">
          {RIBBON.map(([Icon, t]) => <li key={t} className="flex items-center gap-2"><Icon size={18} className="text-tomato" aria-hidden="true" />{t}</li>)}
        </ul>
      </div>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.3fr]">
        <div className="space-y-3">
          <Logo size="lg" />
          <p className="max-w-xs text-ink-soft">Pizzas artisanales, burgers généreux et wings croustillantes. Préparés avec soin et livrés chauds à toute heure.</p>
        </div>
        <div>
          <p className="font-bold">Liens rapides</p>
          <ul className="mt-1">{LINKS.map(([href, t]) => <li key={href}><Link className="inline-flex min-h-11 items-center gap-1 text-ink-soft hover:text-white" href={href}><ChevronRight size={14} className="text-tomato" aria-hidden="true" />{t}</Link></li>)}
            <li><Link className="inline-flex min-h-11 items-center gap-1 text-ink-soft hover:text-white" href="/panier"><ChevronRight size={14} className="text-tomato" aria-hidden="true" />Panier</Link></li></ul>
        </div>
        <div>
          <p className="font-bold">Horaires</p>
          <p className="mt-2 flex items-center gap-2 text-ink-soft"><Clock size={18} className="shrink-0" aria-hidden="true" />{s.hours_text}</p>
          {!s.orders_paused && <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-basil/40 bg-basil/10 px-3 py-1 text-xs font-bold text-basil"><span className="h-2 w-2 rounded-full bg-basil" aria-hidden="true" />Reina Pizza est ouvert</p>}
        </div>
        <div className="space-y-1">
          <p className="font-bold">Contact</p>
          <p className="flex items-start gap-2 pt-1 text-ink-soft"><MapPin size={18} className="mt-0.5 shrink-0" aria-hidden="true" />{s.address}, Haïti</p>
          <p><a className="inline-flex min-h-11 items-center gap-2 underline" href={`tel:${tel}`}><Phone size={18} aria-hidden="true" />{s.phone}</a></p>
          <p><a className="inline-flex min-h-11 items-center gap-2 font-semibold text-basil underline" href={waLink(s.whatsapp_number)} target="_blank" rel="noopener noreferrer"><WhatsAppIcon size={18} aria-hidden="true" />WhatsApp</a></p>
        </div>
      </div>
      <div className="border-t border-line px-4 py-4 text-center">
        <p className="script text-2xl text-tomato">Le goût du bonheur dans chaque bouchée</p>
        <p className="mt-1 text-xs text-ink-soft">© {new Date().getFullYear()} Reina Pizza. Tous droits réservés.</p>
      </div>
    </footer>
  );
}

import { MapPin, MessageCircle, Phone, Clock } from "lucide-react";
import { Logo } from "./Logo";
import { waLink } from "@/lib/whatsapp";
import { normalizePhone } from "@/lib/phone";
import type { Settings } from "@/server/settings";
import Link from "next/link";

export function SiteFooter({ s }: { s: Settings }) {
  const tel = normalizePhone(s.phone) ?? `+${s.whatsapp_number}`;
  return (
    <footer className="no-print mt-16 border-t border-line bg-cream-2">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-[1.2fr_1fr_1fr]">
        <div className="space-y-3">
          <Logo className="h-12 w-auto" />
          <p className="flex items-start gap-2 text-ink-soft"><MapPin size={18} className="mt-0.5 shrink-0" aria-hidden="true" />{s.address}, Haïti</p>
          <p className="flex items-center gap-2 text-ink-soft"><Clock size={18} className="shrink-0" aria-hidden="true" />{s.hours_text}</p>
        </div>
        <div className="space-y-2">
          <p className="font-bold">Contact</p>
          <p><a className="inline-flex min-h-11 items-center gap-2 underline" href={`tel:${tel}`}><Phone size={18} aria-hidden="true" />{s.phone}</a></p>
          <p><a className="inline-flex min-h-11 items-center gap-2 font-semibold text-basil underline" href={waLink(s.whatsapp_number)} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} aria-hidden="true" />WhatsApp</a></p>
        </div>
        <div className="space-y-1">
          <p className="font-bold">Liens utiles</p>
          <p><Link className="inline-flex min-h-11 items-center underline" href="/menu">Menu</Link></p>
          <p><Link className="inline-flex min-h-11 items-center underline" href="/panier">Panier</Link></p>
          <p><Link className="inline-flex min-h-11 items-center underline" href="/#livraison">Livraison</Link></p>
        </div>
      </div>
    </footer>
  );
}

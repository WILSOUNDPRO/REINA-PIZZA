import { waLink } from "@/lib/whatsapp";
import type { Settings } from "@/server/settings";

export function SiteFooter({ s }: { s: Settings }) {
  return (
    <footer className="no-print mt-16 border-t border-line bg-cream-2 pb-24 sm:pb-8">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 text-sm sm:grid-cols-3">
        <div>
          <p className="font-display text-xl font-extrabold text-tomato">{s.restaurant_name}</p>
          <p className="mt-1 text-ink-soft">{s.address}, Haïti</p>
        </div>
        <div>
          <p className="font-bold">Horaires</p>
          <p className="text-ink-soft">{s.hours_text}</p>
        </div>
        <div className="space-y-1">
          <p className="font-bold">Contact</p>
          <p><a className="underline" href={`tel:${"+" + s.whatsapp_number}`}>{s.phone}</a></p>
          <p><a className="underline" href={waLink(s.whatsapp_number)} target="_blank" rel="noopener noreferrer">WhatsApp</a></p>
        </div>
      </div>
    </footer>
  );
}

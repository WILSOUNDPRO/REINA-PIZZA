import Link from "next/link";
import { ArrowRight, ChefHat, Clock, HandCoins, MapPin, MessageCircle, Phone, Truck } from "lucide-react";
import { getSql } from "@/server/db";
import { getSettings } from "@/server/settings";
import { getPublicCatalog, getEnabledPaymentMethods } from "@/server/catalog";
import { ProductImage } from "@/components/ProductCard";
import { PaymentMethodBadge } from "@/components/PaymentMethodBadge";
import { waLink } from "@/lib/whatsapp";
import { formatMoney } from "@/lib/money";
import { normalizePhone } from "@/lib/phone";
import { minPriceMinor, variantRequired } from "@/lib/productSale";

const TRUST = [
  [ChefHat, "Préparation fraîche", "Chaque commande est préparée à la demande avec des ingrédients de qualité."],
  [Clock, "Ouvert 24h/24, 7j/7", "À toute heure du jour et de la nuit, Reina Pizza est là pour vous."],
  [Truck, "Livraison rapide", "Livraison dans tout Delmas et ses environs."],
  [MessageCircle, "Commande facile", "Commandez en ligne ou directement via WhatsApp."],
] as const;

const ENGAGEMENTS = [
  ["01", ChefHat, "Préparation fraîche", "Chaque commande est préparée à la demande pour garantir fraîcheur et qualité à chaque bouchée."],
  ["02", Clock, "Ouvert 24h/24", "Reina Pizza vous accueille à toute heure du jour et de la nuit, 7 jours sur 7."],
  ["03", Truck, "Livraison rapide", "Commandez en ligne ou via WhatsApp et recevez votre repas chaud directement chez vous."],
] as const;

export default async function Home() {
  const sql = getSql();
  const [s, { products }, methods] = await Promise.all([getSettings(sql), getPublicCatalog(sql), getEnabledPaymentMethods(sql)]);
  const tel = normalizePhone(s.phone) ?? `+${s.whatsapp_number}`;
  // Vitrine : tous les produits commandables (pizzas, burger, wings…), avec leur prix de départ lu en base.
  const tiles = products.filter((p) => p.state === "orderable").map((p) => {
    const from = p.product_type === "pizza" ? p.sizes[0]?.price_minor ?? null : minPriceMinor(p);
    const note = p.product_type === "pizza" ? `Taille ${p.sizes[0]?.size}` : variantRequired(p) ? "À partir de" : null;
    return { p, from, note };
  }).filter((t) => t.from !== null);

  return (
    <>
      <section className="mx-auto flex min-h-[78dvh] max-w-6xl flex-col justify-center px-4 pb-10 pt-10 md:pt-16">
        <div className="fade-up max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-tomato">Fraîche • Artisanale • Livrée 24h/24</p>
          <h1 className="mt-4 text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">Pizza, Burger <span className="text-gold-grad">&amp; Wings</span></h1>
          <p className="mt-5 max-w-xl text-lg text-ink-soft">Vos plats favoris fraîchement préparés et livrés chauds à toute heure du jour et de la nuit. Commandez depuis chez vous, on s'occupe du reste.</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="/menu" className="btn btn-primary !px-7">Commander maintenant<ArrowRight size={18} aria-hidden="true" /></Link>
            <a href={waLink(s.whatsapp_number)} target="_blank" rel="noopener noreferrer" className="btn btn-ghost"><MessageCircle size={18} aria-hidden="true" />WhatsApp</a>
          </div>
          <ul className="mt-7 flex flex-wrap gap-2 text-sm font-semibold text-ink-soft" aria-label="Nos atouts">
            {["Fraîchement préparée", "Livraison 24h/24", "Commande WhatsApp"].map((t) => <li key={t} className="rounded-full border border-line bg-black/30 px-3 py-1.5">{t}</li>)}
          </ul>
          <p className="mt-4 flex items-start gap-2 text-sm text-basil"><MessageCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" /><span>Livraison et paiement à confirmer avec la pizzeria sur WhatsApp.</span></p>
          {s.orders_paused && <p role="alert" className="mt-4 rounded-xl bg-tomato p-3 font-semibold">{s.pause_message || "Les commandes sont temporairement suspendues."}</p>}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4" aria-label="Pourquoi Reina Pizza">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST.map(([Icon, t, d]) => (
            <li key={t} className="card flex gap-3 p-4"><Icon className="mt-0.5 shrink-0 text-tomato" size={24} aria-hidden="true" /><span><strong className="block">{t}</strong><span className="text-sm text-ink-soft">{d}</span></span></li>
          ))}
        </ul>
      </section>

      <section id="pizzas" className="mx-auto mt-14 max-w-6xl px-4" aria-labelledby="nos-pizzas">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-tomato">Notre carte</p>
        <div className="mb-5 mt-1 flex items-end justify-between gap-3">
          <h2 id="nos-pizzas" className="text-3xl font-extrabold sm:text-4xl">Le Menu</h2>
          <Link href="/menu" className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-tomato">Tout afficher<ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map(({ p, from, note }) => (
            <Link key={p.id} href={`/menu#p-${p.id}`} className="card group flex flex-col overflow-hidden transition-transform hover:-translate-y-0.5 hover:border-tomato" aria-label={`Choisir ${p.name}`}>
              <ProductImage url={p.image_url} defaultImage={p.default_image} name={p.name} className="aspect-[4/3] w-full" sizes="(max-width: 640px) 100vw, 380px" />
              <div className="flex items-end justify-between gap-3 p-4">
                <div><h3 className="text-lg font-extrabold">{p.name}</h3>{note && <p className="text-sm text-ink-soft">{note}</p>}<p className="mt-1 text-lg font-extrabold text-tomato">{formatMoney(from!, s.currency)}</p></div>
                <span className="btn btn-primary !min-h-11 !px-4">Choisir</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-14 max-w-6xl px-4" aria-labelledby="envie">
        <div className="card flex flex-col items-start gap-5 p-6 sm:p-8 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-tomato">Ouvert 24h/24, 7j/7</p>
            <h2 id="envie" className="mt-2 text-3xl font-extrabold">Envie de pizza à n'importe quelle heure ?</h2>
            <p className="mt-3 text-ink-soft">Passez votre commande directement sur notre site ou contactez notre équipe sur WhatsApp. Livraison dans tout Delmas et ses environs, jour et nuit.</p>
          </div>
          <a href={waLink(s.whatsapp_number)} target="_blank" rel="noopener noreferrer" className="btn btn-basil shrink-0"><MessageCircle size={18} aria-hidden="true" />Contacter via WhatsApp</a>
        </div>
      </section>

      <section id="apropos" className="mx-auto mt-14 max-w-6xl scroll-mt-20 px-4" aria-labelledby="engagement">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-tomato">Notre engagement</p>
        <h2 id="engagement" className="mt-1 text-3xl font-extrabold sm:text-4xl">Reina Pizza, votre pizzeria à Delmas</h2>
        <p className="mt-3 max-w-2xl text-ink-soft">Des pizzas préparées avec des ingrédients de qualité, des burgers généreux et des wings croustillantes. Ouvert 24h/24, 7j/7 pour satisfaire toutes vos envies.</p>
        <ol className="mt-6 grid gap-3 sm:grid-cols-3">
          {ENGAGEMENTS.map(([n, Icon, t, d]) => (
            <li key={n} className="card p-5"><div className="flex items-center justify-between"><Icon className="text-tomato" size={28} aria-hidden="true" /><span className="text-3xl font-extrabold text-tomato/40">{n}</span></div><strong className="mt-3 block text-lg">{t}</strong><span className="text-ink-soft">{d}</span></li>
          ))}
        </ol>
      </section>

      <section className="mx-auto mt-14 max-w-6xl px-4" aria-labelledby="etapes">
        <h2 id="etapes" className="sr-only">Comment commander</h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {[["1", "Choisissez vos plats", "Taille, portion et quantité, directement sur le menu."], ["2", "Renseignez votre livraison", "Adresse précise et point de repère."], ["3", "Confirmez sur WhatsApp", "Reina Pizza confirme la livraison et organise le paiement avec vous."]].map(([n, t, d]) => (
            <li key={n} className="card flex gap-4 p-5"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-tomato font-extrabold">{n}</span><span><strong className="block text-lg">{t}</strong><span className="text-ink-soft">{d}</span></span></li>
          ))}
        </ol>
      </section>

      <section className="mx-auto mt-14 grid max-w-6xl gap-4 px-4 sm:grid-cols-2" aria-label="Livraison et contact">
        <div id="livraison" className="card scroll-mt-20 p-5">
          <h2 className="text-xl font-extrabold">Livraison et paiement</h2>
          <p className="mt-2 text-ink-soft">Les frais dépendent de votre adresse. Si votre zone est tarifée, ils s'affichent avant l'enregistrement ; sinon ils sont à confirmer avec la pizzeria. Aucun paiement n'est effectué sur le site : il s'organise avec la pizzeria.</p>
          {methods.length > 0 && (
            <div className="mt-4">
              <p className="flex items-center gap-2 text-sm font-bold"><HandCoins size={18} className="text-tomato" aria-hidden="true" />Moyens de paiement souhaités</p>
              <ul className="mt-2 flex flex-wrap gap-2">{methods.map((m) => <li key={m.id}><PaymentMethodBadge label={m.label} /></li>)}</ul>
            </div>
          )}
        </div>
        <div id="contact" className="card scroll-mt-20 p-5">
          <h2 className="text-xl font-extrabold">Contact</h2>
          <p className="mt-2 flex items-start gap-2 text-ink-soft"><MapPin size={18} className="mt-0.5 shrink-0" aria-hidden="true" />{s.address}, Haïti</p>
          <p className="mt-1 flex items-center gap-2 text-ink-soft"><Clock size={18} className="shrink-0" aria-hidden="true" />{s.hours_text}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a className="btn btn-ghost" href={`tel:${tel}`}><Phone size={18} aria-hidden="true" />{s.phone}</a>
            <a className="btn btn-basil" href={waLink(s.whatsapp_number)} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} aria-hidden="true" />WhatsApp</a>
          </div>
        </div>
      </section>
    </>
  );
}

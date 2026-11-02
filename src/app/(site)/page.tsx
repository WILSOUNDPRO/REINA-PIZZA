import { HandHeart, WhatsAppIcon } from "@/components/WhatsAppIcon";
import Link from "next/link";
import { ArrowRight, ChefHat, Clock, HandCoins, MapPin, Phone, Truck } from "lucide-react";
import { getSql } from "@/server/db";
import { getSettings } from "@/server/settings";
import { getPublicCatalog, getEnabledPaymentMethods } from "@/server/catalog";
import { HomeMenu } from "@/components/HomeMenu";
import { PaymentMethodBadge } from "@/components/PaymentMethodBadge";
import { waLink } from "@/lib/whatsapp";
import { normalizePhone } from "@/lib/phone";

const TRUST = [
  [ChefHat, "Préparation fraîche", "Chaque commande est préparée à la demande avec des ingrédients de qualité."],
  [Clock, "Ouvert 24h/24, 7j/7", "À toute heure du jour et de la nuit, Reina Pizza est là pour vous."],
  [Truck, "Livraison rapide", "Livraison dans tout Delmas et ses environs."],
  [WhatsAppIcon, "Commande facile", "Commandez en ligne ou directement via WhatsApp."],
] as const;

const ENGAGEMENTS = [
  ["01", ChefHat, "Préparation fraîche", "Chaque commande est préparée à la demande pour garantir fraîcheur et qualité à chaque bouchée."],
  ["02", Clock, "Ouvert 24h/24", "Reina Pizza vous accueille à toute heure du jour et de la nuit, 7 jours sur 7."],
  ["03", Truck, "Livraison rapide", "Commandez en ligne ou via WhatsApp et recevez votre repas chaud directement chez vous."],
] as const;

export default async function Home() {
  const sql = getSql();
  const [s, { products, extras }, methods] = await Promise.all([getSettings(sql), getPublicCatalog(sql), getEnabledPaymentMethods(sql)]);
  const tel = normalizePhone(s.phone) ?? `+${s.whatsapp_number}`;
  const orderable = !s.orders_paused && !!s.currency;

  return (
    <>
      <section className="mx-auto flex min-h-[calc(100dvh-4.5rem)] max-w-6xl flex-col justify-center px-4 pb-16 pt-10" aria-labelledby="titre">
        <div className="fade-up max-w-[36rem]">
          <p className="glass on-canvas mb-5 inline-flex items-center gap-2 rounded-full !bg-white/10 px-3.5 py-1.5 text-xs font-extrabold uppercase tracking-[0.15em]"><span className="fire-dot h-2 w-2 rounded-full bg-tomato" aria-hidden="true" />Fraîche • Artisanale • Livrée 24h/24</p>
          <h1 id="titre" className="on-canvas text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">Pizza, Burger<br /><span className="script text-[1.25em] leading-none text-tomato">&amp; Wings</span><HandHeart className="ml-2 inline-block -translate-y-3 text-tomato" /></h1>
          <p className="on-canvas mt-5 max-w-xl text-lg text-white/90">Vos plats favoris fraîchement préparés et livrés chauds à toute heure du jour et de la nuit. Commandez depuis chez vous, on s'occupe du reste.</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="/menu" className="btn btn-primary !rounded-full !px-7">Commander maintenant<ArrowRight size={18} aria-hidden="true" /></Link>
            <a href={waLink(s.whatsapp_number)} target="_blank" rel="noopener noreferrer" className="btn btn-hero-wa !px-6"><WhatsAppIcon size={20} className="text-tomato" aria-hidden="true" />WhatsApp</a>
          </div>
          <ul className="glass mt-7 flex max-w-full flex-col gap-4 rounded-2xl px-5 py-4 sm:inline-flex sm:flex-row sm:items-center sm:gap-6 sm:rounded-full sm:px-7" aria-label="Nos atouts">
            {[[ChefHat, "Fraîchement", "préparée"], [Truck, "Livraison", "24h/24"], [WhatsAppIcon, "Commande", "WhatsApp"]].map(([Icon, a, b], i) => {
              const I = Icon as typeof ChefHat;
              return <li key={String(a)} className="flex items-center gap-3 sm:gap-6">{i > 0 && <span className="hidden h-8 w-px bg-white/15 sm:block" aria-hidden="true" />}<span className="flex items-center gap-3"><I size={24} className="text-tomato" aria-hidden="true" /><span className="flex flex-col text-sm font-bold leading-tight">{String(a)}<span className="font-medium text-ink-soft">{String(b)}</span></span></span></li>;
            })}
          </ul>
          <p className="on-canvas mt-4 flex items-start gap-2 text-sm text-white/90"><WhatsAppIcon size={18} className="mt-0.5 shrink-0 text-basil" aria-hidden="true" /><span>Livraison et paiement à confirmer avec la pizzeria sur WhatsApp.</span></p>
          {s.orders_paused && <p role="alert" className="mt-4 rounded-xl bg-tomato p-3 font-semibold">{s.pause_message || "Les commandes sont temporairement suspendues."}</p>}
        </div>
        <a href="#pizzas" className="on-canvas mt-10 flex w-fit items-center gap-3 text-xs uppercase tracking-widest text-ink-soft opacity-80 hover:opacity-100">
          <span className="flex h-8 w-5 justify-center rounded-full border-2 border-white/60 pt-1.5" aria-hidden="true"><span className="scroll-wheel h-1.5 w-0.5 rounded bg-tomato" /></span>
          Faites défiler pour explorer le menu
        </a>
      </section>

      <section className="mx-auto max-w-6xl px-4" aria-label="Pourquoi Reina Pizza">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST.map(([Icon, t, d]) => (
            <li key={t} className="card flex gap-3 p-4"><Icon className="mt-0.5 shrink-0 text-tomato" size={24} aria-hidden="true" /><span><strong className="block">{t}</strong><span className="text-sm text-ink-soft">{d}</span></span></li>
          ))}
        </ul>
      </section>

      <section id="pizzas" className="mx-auto mt-20 max-w-6xl scroll-mt-20 px-4" aria-labelledby="nos-pizzas">
        <div className="text-center">
          <p className="on-canvas text-xs font-bold uppercase tracking-[0.2em] text-tomato">Notre carte</p>
          <h2 id="nos-pizzas" className="on-canvas mt-1 text-4xl font-extrabold sm:text-5xl">Le Menu</h2>
          <p className="on-canvas mx-auto mt-3 max-w-xl text-ink-soft">Découvrez nos pizzas artisanales, notre burger généreux et nos wings croustillantes.</p>
          <Link href="/menu" className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-bold text-tomato">Tout afficher<ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
        <HomeMenu products={products} extras={extras} currency={s.currency} orderable={orderable} />
      </section>

      <section className="mx-auto mt-20 max-w-4xl px-4 text-center" aria-labelledby="envie">
        <div className="glass rounded-3xl p-8 sm:p-12">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-tomato">Ouvert 24h/24, 7j/7</p>
          <h2 id="envie" className="mt-3 text-3xl font-extrabold sm:text-5xl">Envie de pizza<br /><span className="script text-[1.2em] text-tomato">à n'importe quelle heure ?</span></h2>
          <p className="mx-auto mt-4 max-w-2xl text-ink-soft">Passez votre commande directement sur notre site ou contactez notre équipe sur WhatsApp. Livraison dans tout Delmas et ses environs, jour et nuit.</p>
          <ul className="mt-5 flex flex-wrap justify-center gap-2 text-sm font-semibold">
            {[[Clock, "24h/24, 7j/7"], [Truck, "Livraison à domicile"], [WhatsAppIcon, "WhatsApp"]].map(([Icon, t]) => { const I = Icon as typeof Clock; return <li key={String(t)} className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5"><I size={16} className="text-tomato" aria-hidden="true" />{String(t)}</li>; })}
          </ul>
          <a href={waLink(s.whatsapp_number)} target="_blank" rel="noopener noreferrer" className="btn btn-basil mt-6 !rounded-full !px-8"><WhatsAppIcon size={20} aria-hidden="true" />Contacter via WhatsApp<ArrowRight size={18} aria-hidden="true" /></a>
        </div>
      </section>

      <section id="apropos" className="mx-auto mt-20 max-w-6xl scroll-mt-20 px-4 text-center" aria-labelledby="engagement">
        <p className="on-canvas text-xs font-bold uppercase tracking-[0.2em] text-tomato">Notre engagement</p>
        <h2 id="engagement" className="on-canvas mx-auto mt-1 max-w-2xl text-3xl font-extrabold sm:text-5xl">Reina Pizza, votre pizzeria à Delmas</h2>
        <p className="on-canvas mx-auto mt-3 max-w-2xl text-ink-soft">Des pizzas préparées avec des ingrédients de qualité, des burgers généreux et des wings croustillantes. Ouvert 24h/24, 7j/7 pour satisfaire toutes vos envies.</p>
        <ol className="mt-8 grid gap-3 text-left sm:grid-cols-3">
          {ENGAGEMENTS.map(([n, Icon, t, d]) => (
            <li key={n} className="card p-5"><div className="flex items-center justify-between"><span className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-tomato/10 text-tomato"><Icon size={24} aria-hidden="true" /></span><span className="text-3xl font-extrabold text-tomato/40">{n}</span></div><strong className="mt-3 block text-lg">{t}</strong><span className="text-ink-soft">{d}</span></li>
          ))}
        </ol>
      </section>

      <section className="mx-auto mt-20 grid max-w-6xl gap-4 px-4 sm:grid-cols-2" aria-label="Livraison et contact">
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
            <a className="btn btn-basil" href={waLink(s.whatsapp_number)} target="_blank" rel="noopener noreferrer"><WhatsAppIcon size={18} aria-hidden="true" />WhatsApp</a>
          </div>
        </div>
      </section>
    </>
  );
}

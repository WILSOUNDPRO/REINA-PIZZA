import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Clock, MapPin, MessageCircle, Phone } from "lucide-react";
import { getSql } from "@/server/db";
import { getSettings } from "@/server/settings";
import { getPublicCatalog } from "@/server/catalog";
import { ProductImage } from "@/components/ProductCard";
import { LogoSymbol } from "@/components/Logo";
import { waLink } from "@/lib/whatsapp";
import { formatMoney } from "@/lib/money";
import { normalizePhone } from "@/lib/phone";

export default async function Home() {
  const sql = getSql();
  const [s, { products }] = await Promise.all([getSettings(sql), getPublicCatalog(sql)]);
  const heroPhoto = products.find((p) => p.image_url)?.image_url ?? null; // uniquement une photo réellement téléversée
  const tel = normalizePhone(s.phone) ?? `+${s.whatsapp_number}`;
  const localHero = heroPhoto ? /^https?:\/\/(localhost|127\.0\.0\.1)/.test(heroPhoto) : false;

  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-8 px-4 pb-4 pt-8 md:grid-cols-[1.1fr_1fr] md:pt-14">
        <div className="fade-up">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-tomato">Delmas · Ouvert 24 h/24</p>
          <h1 className="mt-3 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">Vos envies de pizza, <span className="text-tomato">à toute heure.</span></h1>
          <p className="mt-4 max-w-md text-lg text-ink-soft">Choisissez vos pizzas, renseignez votre adresse : Reina Pizza reçoit votre commande et vous la livre.</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link href="/menu" className="btn btn-primary !px-7">Commander<ArrowRight size={18} aria-hidden="true" /></Link>
            <Link href="#pizzas" className="btn btn-ghost hidden sm:inline-flex">Voir le menu</Link>
          </div>
          <p className="mt-4 flex items-start gap-2 text-sm text-basil"><MessageCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" /><span>Livraison et paiement à confirmer avec la pizzeria sur WhatsApp.</span></p>
          {s.orders_paused && <p role="alert" className="mt-4 rounded-xl bg-tomato p-3 font-semibold text-white">{s.pause_message || "Les commandes sont temporairement suspendues."}</p>}
        </div>
        {/* Photo réelle si elle existe, sinon un panneau d'informations : jamais une fausse photo ni une illustration générique. */}
        {heroPhoto ? (
          <div className="relative hidden aspect-[4/3] overflow-hidden rounded-2xl border border-line md:block">
            <Image src={heroPhoto} alt="" fill priority sizes="(min-width: 768px) 50vw, 0px" quality={80} unoptimized={localHero} className="object-cover" />
          </div>
        ) : (
          <div className="card relative hidden overflow-hidden p-8 md:block">
            <LogoSymbol className="pointer-events-none absolute -right-6 -top-4 h-56 w-auto opacity-[0.07]" />
            <ul className="relative space-y-5 text-base">
              <li className="flex gap-3"><Clock className="mt-0.5 shrink-0 text-tomato" size={22} aria-hidden="true" /><span><strong className="block">Ouvert 24 h/24, 7 j/7</strong><span className="text-ink-soft">Heure de Port-au-Prince</span></span></li>
              <li className="flex gap-3"><MapPin className="mt-0.5 shrink-0 text-tomato" size={22} aria-hidden="true" /><span><strong className="block">Delmas</strong><span className="text-ink-soft">{s.address}</span></span></li>
              <li className="flex gap-3"><MessageCircle className="mt-0.5 shrink-0 text-basil" size={22} aria-hidden="true" /><span><strong className="block">Confirmation sur WhatsApp</strong><span className="text-ink-soft">Livraison et paiement organisés avec la pizzeria</span></span></li>
            </ul>
          </div>
        )}
      </section>

      <section id="pizzas" className="mx-auto mt-10 max-w-6xl px-4" aria-labelledby="nos-pizzas">
        <div className="mb-4 flex items-end justify-between gap-3">
          <h2 id="nos-pizzas" className="text-2xl font-extrabold sm:text-3xl">Nos pizzas</h2>
          <Link href="/menu" className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-tomato">Voir tout le menu<ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {products.map((p, i) => (
            <Link key={p.id} href={`/menu#p-${p.id}`} className="card group flex flex-col overflow-hidden transition-shadow hover:shadow-md" aria-label={`Choisir ${p.name}`}>
              <ProductImage url={p.image_url} name={p.name} className={p.image_url ? "aspect-[4/3] w-full" : "h-24 w-full"} priority={i === 0 && !!p.image_url} />
              <div className="flex items-end justify-between gap-3 p-4">
                <div><h3 className="text-lg font-extrabold">{p.name}</h3><p className="text-sm text-ink-soft">Taille {p.sizes[0].size}</p><p className="mt-1 text-lg font-extrabold text-tomato">{formatMoney(p.sizes[0].price_minor, s.currency)}</p></div>
                <span className="btn btn-primary !min-h-11 !px-4 group-hover:bg-tomato-dark">Choisir</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-12 max-w-6xl px-4" aria-labelledby="etapes">
        <h2 id="etapes" className="sr-only">Comment commander</h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {[["1", "Choisissez vos pizzas", "Taille et quantité, directement sur le menu."], ["2", "Renseignez votre livraison", "Adresse précise et point de repère."], ["3", "Confirmez sur WhatsApp", "Reina Pizza confirme la livraison et organise le paiement avec vous."]].map(([n, t, d]) => (
            <li key={n} className="card flex gap-4 p-5"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-tomato font-extrabold text-white">{n}</span><span><strong className="block text-lg">{t}</strong><span className="text-ink-soft">{d}</span></span></li>
          ))}
        </ol>
      </section>

      <section className="mx-auto mt-12 grid max-w-6xl gap-4 px-4 sm:grid-cols-2" aria-label="Livraison et contact">
        <div id="livraison" className="card p-5">
          <h2 className="text-xl font-extrabold">Livraison</h2>
          <p className="mt-2 text-ink-soft">Les frais dépendent de votre adresse. Si votre zone est tarifée, ils s'affichent avant l'enregistrement ; sinon ils sont à confirmer avec la pizzeria. Aucun paiement n'est effectué sur le site.</p>
        </div>
        <div id="contact" className="card p-5">
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

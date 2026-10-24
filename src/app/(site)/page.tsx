import Link from "next/link";
import { getSql } from "@/server/db";
import { getSettings } from "@/server/settings";
import { PizzaMark } from "@/components/PizzaMark";
import { waLink } from "@/lib/whatsapp";

export default async function Home() {
  const s = await getSettings(getSql());
  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-8 px-4 pb-6 pt-8 md:grid-cols-2 md:pt-14">
        <div className="fade-up">
          <p className="mb-3 inline-block rounded-full bg-basil px-3 py-1 text-sm font-bold text-white">{s.hours_text}</p>
          <h1 className="text-5xl font-black leading-[1.02] sm:text-6xl">
            La pizza,<br /><span className="text-tomato">à toute heure.</span>
          </h1>
          <p className="mt-4 max-w-md text-lg text-ink-soft">
            Reina Pizza prépare vos pizzas à Delmas et les livre chez vous. Choisissez votre taille, indiquez votre adresse, payez sur le site.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link href="/menu" className="btn btn-primary btn-lg sm:!w-auto sm:px-10">Commander</Link>
            <Link href="/menu" className="btn btn-ghost btn-lg sm:!w-auto sm:px-8">Voir le menu</Link>
          </div>
          {s.orders_paused && (
            <p role="alert" className="mt-4 rounded-2xl bg-tomato p-3 font-bold text-white">{s.pause_message || "Les commandes sont temporairement suspendues."}</p>
          )}
        </div>
        <div className="mx-auto w-full max-w-sm md:max-w-md">
          <PizzaMark className="drop-shadow-xl" spin />
        </div>
      </section>

      <section className="mx-auto mt-10 max-w-6xl px-4" aria-labelledby="etapes">
        <h2 id="etapes" className="sr-only">Comment commander</h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {[
            ["1", "Choisissez", "Pizzas, tailles et suppléments selon la carte."],
            ["2", "Indiquez où livrer", "Votre zone, votre adresse et un point de repère."],
            ["3", "Payez le total", "Vous voyez le total complet, livraison comprise, avant de payer."],
          ].map(([n, t, d]) => (
            <li key={n} className="card flex gap-4 p-5">
              <span className="font-display text-4xl font-black text-tomato">{n}</span>
              <span><strong className="block text-lg">{t}</strong><span className="text-ink-soft">{d}</span></span>
            </li>
          ))}
        </ol>
      </section>

      <section id="infos" className="mx-auto mt-12 grid max-w-6xl gap-4 px-4 sm:grid-cols-2" aria-labelledby="infos-titre">
        <h2 id="infos-titre" className="text-3xl font-extrabold sm:col-span-2">Livraison et contact</h2>
        <div className="card p-5">
          <h3 className="text-xl font-bold text-basil">Livraison</h3>
          <p className="mt-2 text-ink-soft">
            Les frais varient selon la destination. Si votre zone est couverte, le total complet s'affiche tout de suite. Sinon, vous envoyez votre demande : nous fixons les frais et vous recevez un lien pour voir le total, l'accepter et payer.
          </p>
        </div>
        <div className="card p-5">
          <h3 className="text-xl font-bold text-basil">Horaires</h3>
          <p className="mt-2 text-ink-soft">{s.hours_text}.</p>
        </div>
        <div className="card p-5">
          <h3 className="text-xl font-bold text-basil">Adresse</h3>
          <p className="mt-2 text-ink-soft">{s.address}, Haïti.</p>
        </div>
        <div className="card p-5">
          <h3 className="text-xl font-bold text-basil">Contact</h3>
          <p className="mt-2"><a className="font-bold underline" href={`tel:+${s.whatsapp_number}`}>{s.phone}</a></p>
          <a className="btn btn-basil mt-3" href={waLink(s.whatsapp_number)} target="_blank" rel="noopener noreferrer">Écrire sur WhatsApp</a>
        </div>
      </section>
    </>
  );
}

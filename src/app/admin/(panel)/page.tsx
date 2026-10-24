import Link from "next/link";
import { getSql } from "@/server/db";
import { listOrders } from "@/server/orders";
import { OrderListItem } from "@/components/admin/OrderRow";
import { getSettings } from "@/server/settings";
import { env } from "@/server/env";

export default async function Dashboard() {
  const sql = getSql();
  const [stats] = await sql<{ new_: number; fees: number; active: number; today: number; paid_today: number }[]>`
    select count(*) filter (where acknowledged_at is null)::int as new_,
      count(*) filter (where fee_status = 'to_confirm' and order_status <> 'cancelled')::int as fees,
      count(*) filter (where order_status in ('to_confirm','confirmed','preparing','out_for_delivery'))::int as active,
      count(*) filter (where (created_at at time zone 'America/Port-au-Prince')::date = (now() at time zone 'America/Port-au-Prince')::date)::int as today,
      count(*) filter (where payment_status = 'paid' and (paid_at at time zone 'America/Port-au-Prince')::date = (now() at time zone 'America/Port-au-Prince')::date)::int as paid_today
    from orders`;
  const [settings, recent, products, zones] = await Promise.all([
    getSettings(sql),
    listOrders(sql, { unacknowledged: true }),
    sql<{ n: number; demo: number }[]>`select count(*)::int as n, count(*) filter (where is_demo)::int as demo from products`,
    sql<{ n: number }[]>`select count(*)::int as n from delivery_zones where active`,
  ]);
  const cards: [string, number, string][] = [
    ["Nouvelles commandes", stats.new_, "/admin/commandes?vue=nouvelles"],
    ["Frais à confirmer", stats.fees, "/admin/commandes?frais=1"],
    ["En cours", stats.active, "/admin/commandes"],
    ["Aujourd'hui", stats.today, "/admin/commandes"],
  ];
  const warnings: string[] = [];
  if (!settings.currency) warnings.push("La devise n'est pas confirmée : les commandes sont bloquées. Réglages → Devise.");
  if (products[0].demo > 0) warnings.push(`${products[0].demo} produit(s) de démonstration au menu : à remplacer par le vrai menu.`);
  if (zones[0].n === 0) warnings.push("Aucune zone de livraison tarifée : tous les clients voient « frais à confirmer ». Ajoutez les zones et tarifs (Livraison).");
  if (products[0].n === 0) warnings.push("Le menu est vide.");
  if (settings.orders_paused) warnings.push("Les commandes sont actuellement SUSPENDUES.");
  if (!env.siteUrl()) warnings.push("SITE_URL n'est pas défini : les liens clients utilisent l'hôte de la requête en cours.");

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold">Tableau de bord</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map(([label, n, href]) => (
          <Link key={label} href={href} className="card p-4 hover:border-ink"><p className="font-display text-4xl font-black text-tomato">{n}</p><p className="text-sm font-bold">{label}</p></Link>
        ))}
      </div>
      {warnings.length > 0 && (
        <section aria-labelledby="alertes" className="card space-y-2 p-4">
          <h2 id="alertes" className="font-bold">À régler avant l'ouverture</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </section>
      )}
      <section aria-labelledby="a-traiter">
        <h2 id="a-traiter" className="mb-3 text-2xl font-bold">À traiter (non consultées)</h2>
        {recent.rows.length === 0 ? <p className="card p-5 text-ink-soft">Aucune nouvelle commande.</p> : <ul className="space-y-3">{recent.rows.map((o) => <OrderListItem key={o.id} o={o} />)}</ul>}
      </section>
    </div>
  );
}

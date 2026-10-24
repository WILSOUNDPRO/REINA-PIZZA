import Link from "next/link";
import { getSql } from "@/server/db";
import { listOrders } from "@/server/orders";
import { OrderListItem } from "@/components/admin/OrderRow";
import { ORDER_STATUSES, ORDER_STATUS_LABELS, PAYMENT_STATUSES, PAYMENT_STATUS_LABELS } from "@/lib/labels";

type SP = { from?: string; to?: string; statut?: string; paiement?: string; frais?: string; vue?: string; q?: string; page?: string };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const res = await listOrders(getSql(), {
    from: sp.from, to: sp.to, orderStatus: sp.statut, paymentStatus: sp.paiement, feeToConfirm: sp.frais === "1",
    unacknowledged: sp.vue === "nouvelles", q: sp.q, page: Number(sp.page) || 1,
  });
  const pages = Math.max(1, Math.ceil(res.total / res.pageSize));
  const qs = (page: number) => new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v)), page: String(page) } as Record<string, string>).toString();

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-extrabold">Commandes</h1>
      <form className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4" role="search">
        <label className="text-sm font-bold">Du<input type="date" name="from" defaultValue={sp.from} className="field mt-1" /></label>
        <label className="text-sm font-bold">Au<input type="date" name="to" defaultValue={sp.to} className="field mt-1" /></label>
        <label className="text-sm font-bold">Statut de commande
          <select name="statut" defaultValue={sp.statut ?? ""} className="field mt-1"><option value="">Tous</option>{ORDER_STATUSES.map((s) => <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>)}</select>
        </label>
        <label className="text-sm font-bold">Statut de paiement
          <select name="paiement" defaultValue={sp.paiement ?? ""} className="field mt-1"><option value="">Tous</option>{PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{PAYMENT_STATUS_LABELS[s]}</option>)}</select>
        </label>
        <label className="text-sm font-bold sm:col-span-2">Recherche (référence, nom, téléphone)<input name="q" defaultValue={sp.q} className="field mt-1" /></label>
        <label className="flex min-h-12 items-center gap-2 text-sm font-bold"><input type="checkbox" name="frais" value="1" defaultChecked={sp.frais === "1"} className="h-5 w-5" /> Frais à confirmer</label>
        <label className="flex min-h-12 items-center gap-2 text-sm font-bold"><input type="checkbox" name="vue" value="nouvelles" defaultChecked={sp.vue === "nouvelles"} className="h-5 w-5" /> Nouvelles uniquement</label>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-4"><button className="btn btn-primary">Filtrer</button><Link href="/admin/commandes" className="btn btn-ghost">Réinitialiser</Link></div>
      </form>
      <p className="text-sm text-ink-soft">{res.total} commande{res.total > 1 ? "s" : ""} · dates à l'heure de Port-au-Prince</p>
      {res.rows.length === 0 ? <p className="card p-5 text-ink-soft">Aucune commande pour ces critères.</p> : <ul className="space-y-3">{res.rows.map((o) => <OrderListItem key={o.id} o={o} />)}</ul>}
      {pages > 1 && (
        <nav className="flex items-center justify-between" aria-label="Pagination">
          {res.page > 1 ? <Link className="btn btn-ghost" href={`?${qs(res.page - 1)}`}>← Précédent</Link> : <span />}
          <span className="text-sm">Page {res.page} / {pages}</span>
          {res.page < pages ? <Link className="btn btn-ghost" href={`?${qs(res.page + 1)}`}>Suivant →</Link> : <span />}
        </nav>
      )}
    </div>
  );
}

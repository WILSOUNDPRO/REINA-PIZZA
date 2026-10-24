"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PayState } from "@/lib/orderState";

export function OrderActions({ token, state, totalLabel, paymentsEnabled, returning }: { token: string; state: PayState; totalLabel: string | null; paymentsEnabled: boolean; returning: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"accept" | "pay" | null>(null);
  const [error, setError] = useState("");

  // Retour du prestataire : seule la notification serveur confirme le paiement ; on actualise la page jusqu'à ce qu'elle arrive.
  useEffect(() => {
    if (state !== "pending" || !returning) return;
    let n = 0;
    const t = setInterval(() => { if (++n > 30) clearInterval(t); else router.refresh(); }, 4000);
    return () => clearInterval(t);
  }, [state, returning, router]);

  async function call(kind: "accept" | "pay") {
    if (busy) return;
    setBusy(kind);
    setError("");
    try {
      const r = await fetch(`/api/orders/${token}/${kind}`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Une erreur est survenue.");
      if (kind === "pay" && j.redirectUrl) { window.location.assign(j.redirectUrl); return; }
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  return (
    <div className="no-print space-y-3">
      {state === "needs_acceptance" && (
        <div className="rounded-2xl border-2 border-basil bg-white p-4">
          <p className="font-bold">Reina Pizza a fixé les frais de livraison.</p>
          <p className="text-sm text-ink-soft">Vérifiez le total détaillé ci-dessous. Si vous l'acceptez, vous pourrez payer sur ce site.</p>
          <button className="btn btn-basil btn-lg mt-3" onClick={() => call("accept")} disabled={busy !== null}>
            {busy === "accept" ? "Un instant…" : `Accepter le total de ${totalLabel}`}
          </button>
        </div>
      )}
      {(state === "payable" || state === "pending") && paymentsEnabled && (
        <button className="btn btn-primary btn-lg" onClick={() => call("pay")} disabled={busy !== null}>
          {busy === "pay" ? "Ouverture du paiement…" : state === "pending" ? `Reprendre le paiement de ${totalLabel}` : `Payer ${totalLabel}`}
        </button>
      )}
      {(state === "payable" || state === "pending") && !paymentsEnabled && (
        <div role="note" className="rounded-2xl border-2 border-dashed border-ink-soft bg-paper p-4 text-sm">
          <strong>Le paiement en ligne n'est pas encore disponible.</strong> Votre commande est bien enregistrée : contactez Reina Pizza sur WhatsApp pour régler.
        </div>
      )}
      {state === "pending" && returning && (
        <p role="status" className="rounded-2xl bg-amber-100 p-4 text-sm">
          Nous vérifions votre paiement auprès du prestataire. Cette page se met à jour automatiquement ; revenir sur le site ne suffit pas à confirmer un paiement.
        </p>
      )}
      {error && <p role="alert" className="rounded-xl bg-tomato p-3 text-sm font-bold text-white">{error}</p>}
    </div>
  );
}

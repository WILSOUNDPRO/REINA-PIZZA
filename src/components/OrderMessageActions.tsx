"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle, Phone, Printer } from "lucide-react";

// Le bouton ouvre un BROUILLON WhatsApp : le client doit l'envoyer lui-même. Rien n'est envoyé automatiquement.
export function OrderMessageActions({ waUrl, message, phoneHref }: { waUrl: string; message: string; phoneHref: string }) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setState("ok");
      setTimeout(() => setState("idle"), 2500);
    } catch {
      // Repli : sélection manuelle du texte affiché dans le champ ci-dessous.
      setState("fail");
      requestAnimationFrame(() => (document.getElementById("order-message") as HTMLTextAreaElement | null)?.select());
    }
  }
  return (
    <div className="no-print space-y-3">
      <a className="btn btn-basil btn-lg" href={waUrl} target="_blank" rel="noopener noreferrer"><MessageCircle size={20} aria-hidden="true" />Confirmer sur WhatsApp</a>
      <p className="text-center text-xs text-ink-soft">Le message WhatsApp contiendra votre commande et vos coordonnées de livraison pour Reina Pizza.</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn btn-ghost" onClick={copy}>{state === "ok" ? <><Check size={18} aria-hidden="true" />Message copié</> : <><Copy size={18} aria-hidden="true" />Copier le message</>}</button>
        <button type="button" className="btn btn-ghost" onClick={() => window.print()}><Printer size={18} aria-hidden="true" />Imprimer</button>
      </div>
      <a className="btn btn-ghost w-full" href={phoneHref}><Phone size={18} aria-hidden="true" />Appeler Reina Pizza</a>
      <p role="status" aria-live="polite" className={state === "idle" ? "sr-only" : "text-center text-sm font-semibold"}>{state === "ok" ? "Message copié dans le presse-papiers." : state === "fail" ? "Copie automatique impossible : le texte ci-dessous est sélectionné, copiez-le puis collez-le dans WhatsApp." : ""}</p>
      <details open={state === "fail"} className="text-sm">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-bold">Voir le message</summary>
        <textarea id="order-message" readOnly value={message} rows={14} className="field mt-2 text-xs" aria-label="Message WhatsApp" />
      </details>
      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-ink-soft"><Check size={14} aria-hidden="true" />Votre commande est déjà enregistrée.</p>
    </div>
  );
}

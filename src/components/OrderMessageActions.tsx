"use client";

import { useState } from "react";

// Le bouton ouvre un BROUILLON WhatsApp : le client doit l'envoyer lui-même. Rien n'est envoyé automatiquement.
export function OrderMessageActions({ waUrl, message, phoneHref }: { waUrl: string; message: string; phoneHref: string }) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setState("ok");
    } catch {
      // Repli : sélection manuelle du texte affiché dans le champ ci-dessous.
      setState("fail");
      (document.getElementById("order-message") as HTMLTextAreaElement | null)?.select();
    }
    setTimeout(() => setState((s) => (s === "fail" ? "fail" : "idle")), 2500);
  }
  return (
    <div className="no-print space-y-3">
      <a className="btn btn-basil btn-lg" href={waUrl} target="_blank" rel="noopener noreferrer">Contacter Reina Pizza pour confirmer la livraison</a>
      <p className="text-xs text-ink-soft">En continuant, vous préparez un message WhatsApp contenant votre commande et vos coordonnées de livraison à destination de Reina Pizza.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" className="btn btn-ghost flex-1" onClick={copy}>{state === "ok" ? "Message copié ✓" : "Copier le message"}</button>
        <a className="btn btn-ghost flex-1" href={phoneHref}>📞 Appeler la pizzeria</a>
      </div>
      <details open={state === "fail"} className="text-sm">
        <summary className="cursor-pointer font-bold">Voir le message</summary>
        <textarea id="order-message" readOnly value={message} rows={14} className="field mt-2 text-xs" aria-label="Message WhatsApp" />
        {state === "fail" && <p role="alert" className="mt-1 font-bold text-tomato">Copie automatique impossible : le texte est sélectionné, copiez-le puis collez-le dans WhatsApp.</p>}
      </details>
    </div>
  );
}

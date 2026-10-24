"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Copier le lien" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("ok");
    } catch {
      setState("fail"); // le champ ci-dessus reste sélectionnable manuellement
    }
    setTimeout(() => setState("idle"), 2000);
  }
  return (
    <button type="button" className="btn btn-ghost !min-h-11 text-sm" onClick={copy}>
      {state === "ok" ? "Copié ✓" : state === "fail" ? "Copie impossible : sélectionnez le lien" : label}
    </button>
  );
}

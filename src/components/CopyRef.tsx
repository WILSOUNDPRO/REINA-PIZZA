"use client";

import { useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyRef({ value }: { value: string }) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  const textRef = useRef<HTMLElement>(null);
  async function copy() {
    try { await navigator.clipboard.writeText(value); setState("ok"); }
    catch {
      setState("fail"); // repli : sélection manuelle de la référence
      const r = document.createRange(); if (textRef.current) { r.selectNodeContents(textRef.current); const s = getSelection(); s?.removeAllRanges(); s?.addRange(r); }
    }
    setTimeout(() => setState("idle"), 2500);
  }
  return (
    <div className="inline-flex items-center gap-1 rounded-xl bg-cream-2 py-1 pl-4 pr-1">
      <span className="text-sm">Référence : <strong ref={textRef} className="select-all">{value}</strong></span>
      <button type="button" onClick={copy} className="grid h-11 w-11 place-items-center rounded-lg hover:bg-white" aria-label={`Copier la référence ${value}`}>
        {state === "ok" ? <Check size={18} className="text-basil" aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
      </button>
      <span role="status" aria-live="polite" className="sr-only">{state === "ok" ? "Référence copiée" : state === "fail" ? "Copie impossible : la référence est sélectionnée, copiez-la manuellement" : ""}</span>
      {state === "fail" && <span aria-hidden="true" className="pr-3 text-xs font-semibold text-tomato">Copie impossible</span>}
    </div>
  );
}

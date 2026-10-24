"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";

export type RowMenuItem = { label: string; onSelect: () => void; danger?: boolean; disabled?: boolean; hint?: string };

// Menu d'actions secondaires accessible : bouton nommé, flèches, Échap, fermeture au clic extérieur.
export function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    wrap.current?.querySelector<HTMLElement>("[role=menuitem]:not([disabled])")?.focus();
    const onDoc = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { setOpen(false); btn.current?.focus(); return; }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const els = [...(wrap.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not([disabled])") ?? [])];
    const i = els.indexOf(document.activeElement as HTMLElement);
    els[(i + (e.key === "ArrowDown" ? 1 : -1) + els.length) % els.length]?.focus();
  }

  return (
    <div ref={wrap} className="relative" onKeyDown={onKeyDown}>
      <button ref={btn} type="button" className="stepper-btn" aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)}><MoreVertical size={18} aria-hidden="true" /></button>
      {open && (
        <div role="menu" aria-label={label} className="absolute right-0 z-20 mt-1 w-64 rounded-xl border border-line bg-white p-1 shadow-lg">
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" disabled={it.disabled} title={it.hint}
              className={`flex min-h-11 w-full flex-col items-start justify-center rounded-lg px-3 text-left text-sm font-semibold hover:bg-cream-2 disabled:cursor-not-allowed disabled:opacity-50 ${it.danger ? "text-tomato" : ""}`}
              onClick={() => { setOpen(false); btn.current?.focus(); it.onSelect(); }}>
              {it.label}{it.disabled && it.hint && <span className="text-xs font-normal text-ink-soft">{it.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

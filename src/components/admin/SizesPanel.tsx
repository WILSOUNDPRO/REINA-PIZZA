"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { SIZES, type Currency, type Size } from "@/lib/constants";
import { SIZE_HINT } from "@/lib/labels";
import type { AdminProduct, AdminSize } from "@/server/menu";

const fmt = (minor: number) => (minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2));
const initialValues = (sizes: AdminSize[]): Record<Size, string> =>
  Object.fromEntries(SIZES.map((s) => { const r = sizes.find((x) => x.size === s && x.available && x.price_minor > 0); return [s, r ? fmt(r.price_minor) : ""]; })) as Record<Size, string>;

// Panneau « Tailles et prix » : modal accessible (focus piégé, Échap, retour du focus), bas d'écran sur téléphone et ordinateur.
export function SizesPanel({ product, currency, onClose, onSaved }: { product: AdminProduct; currency: Currency | null; onClose: () => void; onSaved: (sizes: AdminSize[]) => void }) {
  const [saved, setSaved] = useState(() => initialValues(product.sizes));
  const [values, setValues] = useState(saved);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const dirty = SIZES.some((s) => values[s].trim() !== saved[s]);

  function requestClose() {
    if (saving) return;
    if (dirty) setConfirmLeave(true);
    else onClose();
  }

  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>("input");
    first?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prevOverflow; };
  }, []);

  // Écouteur au niveau du document : Échap et Tab restent gérés même si le focus a été perdu (ex. bouton désactivé après un envoi).
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); requestCloseRef.current(); return; }
      if (e.key !== "Tab") return;
      const f = [...(ref.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input, a[href], textarea") ?? [])];
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      const inside = ref.current?.contains(document.activeElement);
      if (!inside) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  async function save() {
    if (saving) return;
    setSaving(true); setErrors({}); setMessage(null);
    try {
      const r = await fetch(`/api/admin/products/${product.id}/sizes`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prices: values }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErrors(j.errors ?? {});
        setMessage({ kind: "error", text: j.error ?? "L'enregistrement a échoué. Vos saisies sont conservées : réessayez." });
      } else {
        const now = initialValues(j.data as AdminSize[]);
        setSaved(now); setValues(now);
        setMessage({ kind: "ok", text: "Tarifs enregistrés." });
        onSaved(j.data as AdminSize[]);
      }
    } catch {
      setMessage({ kind: "error", text: "Connexion impossible. Vos saisies sont conservées : réessayez." });
    }
    setSaving(false);
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={requestClose} aria-hidden="true" />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="sizes-title"
        className="sheet-up fixed inset-x-0 bottom-0 z-50 max-h-[88dvh] overflow-y-auto rounded-t-2xl border border-line bg-white p-4 shadow-2xl sm:p-5 lg:left-60"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto max-w-4xl space-y-4">
          <div className="flex items-start justify-between gap-3">
            <h2 id="sizes-title" className="text-lg font-extrabold">Tailles et prix — {product.name}</h2>
            <button type="button" onClick={requestClose} className="-mr-2 -mt-2 grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-cream-2" aria-label="Fermer le panneau des tailles et prix"><X size={20} aria-hidden="true" /></button>
          </div>
          <p className="text-sm text-ink-soft">Une taille sans prix n'est pas proposée à la commande. Laissez le champ vide plutôt que de saisir 0.</p>
          <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="grid gap-3 sm:grid-cols-3 lg:grid-cols-[repeat(5,1fr)_auto]" noValidate>
            {SIZES.map((s) => (
              <div key={s}>
                <label htmlFor={`size-${s}`} className="mb-1 flex items-baseline gap-1 text-sm font-bold">{s}<span className="text-xs font-normal text-ink-soft">{SIZE_HINT[s]}</span></label>
                <div className="relative">
                  <input id={`size-${s}`} value={values[s]} onChange={(e) => setValues((v) => ({ ...v, [s]: e.target.value }))} inputMode="decimal" autoComplete="off" placeholder="—"
                    aria-invalid={errors[s] ? true : undefined} aria-describedby={errors[s] ? `size-${s}-err` : undefined} className="field !pr-14" />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-ink-soft">{currency ?? "HTG"}</span>
                </div>
                {errors[s] && <p id={`size-${s}-err`} role="alert" className="mt-1 text-xs font-bold text-tomato">{errors[s]}</p>}
              </div>
            ))}
            <div className="flex items-end gap-2 sm:col-span-3 lg:col-span-1">
              <button type="submit" className="btn btn-primary flex-1" disabled={saving || !dirty} aria-busy={saving}>{saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}Enregistrer</button>
              <button type="button" className="btn btn-ghost" onClick={requestClose} disabled={saving}>Annuler</button>
            </div>
          </form>
          {confirmLeave && (
            <div role="alertdialog" aria-labelledby="leave-title" className="flex flex-wrap items-center gap-3 rounded-xl border border-tomato bg-[#fdf3f3] p-3">
              <p id="leave-title" className="flex-1 text-sm font-semibold">Modifications non enregistrées. Quitter sans enregistrer ?</p>
              <button type="button" className="btn btn-ghost !min-h-11" onClick={() => setConfirmLeave(false)}>Continuer la saisie</button>
              <button type="button" className="btn btn-primary !min-h-11" onClick={onClose}>Quitter sans enregistrer</button>
            </div>
          )}
          <p role={message?.kind === "error" ? "alert" : "status"} aria-live="polite" className={message ? `rounded-xl p-3 text-sm font-semibold ${message.kind === "ok" ? "bg-[#e8f4ed] text-basil-dark" : "bg-tomato text-white"}` : "sr-only"}>{message?.text}</p>
        </div>
      </div>
    </>
  );
}

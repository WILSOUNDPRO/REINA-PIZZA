"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "./CartProvider";
import { useServerCart } from "./useServerCart";
import { checkoutSchema, fieldErrors } from "@/lib/validation";
import { formatMoney } from "@/lib/money";
import type { Currency } from "@/lib/constants";

type Zone = { id: string; name: string; commune: string | null; fee_minor: number; is_demo: boolean };
type Errors = Record<string, string>;

const KEY_STORAGE = "reina-idem-v1";
function newKey() {
  const a = new Uint8Array(18);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function Field({ id, label, error, hint, children, optional }: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode; optional?: boolean }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-bold">
        {label} {optional && <span className="font-normal text-ink-soft">(facultatif)</span>}
      </label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="mt-1 text-xs text-ink-soft">{hint}</p>}
      {error && <p id={`${id}-err`} role="alert" className="mt-1 text-sm font-bold text-tomato">{error}</p>}
    </div>
  );
}

export function CheckoutForm({ zones, currency, emailEnabled }: { zones: Zone[]; currency: Currency; emailEnabled: boolean }) {
  const router = useRouter();
  const { items, ready, clear } = useCart();
  const { data, loading } = useServerCart(items, ready);
  const [mode, setMode] = useState<"zone" | "quote">(zones.length ? "zone" : "quote");
  const [zoneId, setZoneId] = useState<string>("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const keyRef = useRef("");
  const formRef = useRef<HTMLFormElement>(null);
  const [gpsMsg, setGpsMsg] = useState("");

  useEffect(() => {
    try {
      keyRef.current = sessionStorage.getItem(KEY_STORAGE) || "";
      if (!keyRef.current) { keyRef.current = newKey(); sessionStorage.setItem(KEY_STORAGE, keyRef.current); }
    } catch { keyRef.current = newKey(); }
  }, []);

  const zone = zones.find((z) => z.id === zoneId);
  const subtotal = data?.subtotalMinor ?? 0;
  const fee = mode === "zone" && zone ? zone.fee_minor : null;
  const hasProblems = (data?.problems.length ?? 0) > 0;

  if (ready && items.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="font-display text-2xl font-bold">Votre panier est vide.</p>
        <Link href="/menu" className="btn btn-primary mt-4">Voir le menu</Link>
      </div>
    );
  }

  function fillMyPosition() {
    if (!navigator.geolocation) return setGpsMsg("La localisation n'est pas disponible sur cet appareil.");
    setGpsMsg("Recherche de votre position…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const el = formRef.current?.elements.namedItem("gps") as HTMLInputElement | null;
        if (el) el.value = `${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}`;
        setGpsMsg("Position ajoutée.");
      },
      () => setGpsMsg("Position refusée ou indisponible. Vous pouvez coller un lien Google Maps."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting.current) return; // empêche la double soumission
    setFormError("");
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) ?? "");
    const payload = {
      items,
      deliveryMode: mode,
      zoneId: mode === "zone" ? zoneId || undefined : undefined,
      expectedTotalMinor: mode === "zone" && zone && data ? subtotal + zone.fee_minor : undefined,
      idempotencyKey: keyRef.current,
      website: v("website"),
      customer: {
        fullName: v("fullName"), phone: v("phone"), whatsapp: v("whatsapp"), email: v("email"), commune: v("commune"),
        quarter: v("quarter"), address: v("address"), landmark: v("landmark"), gps: v("gps"),
        deliveryInstructions: v("deliveryInstructions"), notes: v("notes"),
      },
    };
    const parsed = checkoutSchema.safeParse(payload);
    if (!parsed.success) return showErrors(fieldErrors(parsed.error));

    submitting.current = true;
    setPending(true);
    try {
      const r = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        try { sessionStorage.removeItem(KEY_STORAGE); } catch { /* ignore */ }
        clear();
        router.push(`/commande/${j.token}`);
        return; // on garde le bouton bloqué pendant la navigation
      }
      if (r.status === 422 && j.fields) showErrors(j.fields);
      else setFormError(j.error ?? "Une erreur est survenue. Réessayez.");
    } catch {
      setFormError("Connexion impossible. Vos informations sont conservées : réessayez dans un instant.");
    }
    submitting.current = false;
    setPending(false);
  }

  function showErrors(errs: Errors) {
    setErrors(errs);
    setFormError("Vérifiez les champs signalés en rouge.");
    const first = Object.keys(errs)[0]?.replace("customer.", "");
    requestAnimationFrame(() => (document.getElementById(`f-${first}`) ?? document.getElementById("f-delivery"))?.focus());
  }

  const err = (k: string) => errors[`customer.${k}`];
  const a = (k: string) => ({ id: `f-${k}`, name: k, "aria-invalid": err(k) ? (true as const) : undefined, "aria-describedby": err(k) ? `f-${k}-err` : undefined, className: "field" });

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        <fieldset className="card space-y-3 p-5" id="f-delivery" tabIndex={-1}>
          <legend className="px-1 font-display text-2xl font-bold">1. Livraison</legend>
          {zones.map((z) => (
            <label key={z.id} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-2 p-3 ${mode === "zone" && zoneId === z.id ? "border-basil bg-white" : "border-line"}`}>
              <input type="radio" name="zone" className="h-5 w-5 accent-[#2d6a3e]" checked={mode === "zone" && zoneId === z.id} onChange={() => { setMode("zone"); setZoneId(z.id); }} />
              <span className="flex-1">
                <strong>{z.name}</strong>
                {z.commune && <span className="block text-sm text-ink-soft">{z.commune}</span>}
                {z.is_demo && <span className="badge bg-cream-2 text-ink-soft">Zone de démonstration</span>}
              </span>
              <span className="font-bold">{formatMoney(z.fee_minor, currency)}</span>
            </label>
          ))}
          <label className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-2xl border-2 p-3 ${mode === "quote" ? "border-basil bg-white" : "border-line"}`}>
            <input type="radio" name="zone" className="mt-1 h-5 w-5 accent-[#2d6a3e]" checked={mode === "quote"} onChange={() => setMode("quote")} />
            <span className="flex-1">
              <strong>{zones.length ? "Mon adresse n'est pas dans la liste" : "Demander le tarif de livraison"}</strong>
              <span className="block text-sm text-ink-soft">Vous envoyez votre demande, nous fixons les frais, puis vous recevez un lien pour voir le total, l'accepter et payer. Rien n'est encaissé avant.</span>
            </span>
          </label>
          {errors.zoneId && <p role="alert" className="text-sm font-bold text-tomato">{errors.zoneId}</p>}
          {errors.deliveryMode && <p role="alert" className="text-sm font-bold text-tomato">{errors.deliveryMode}</p>}
        </fieldset>

        <fieldset className="card space-y-4 p-5">
          <legend className="px-1 font-display text-2xl font-bold">2. Vos coordonnées</legend>
          <Field id="f-fullName" label="Nom complet" error={err("fullName")}><input {...a("fullName")} autoComplete="name" /></Field>
          <Field id="f-phone" label="Téléphone joignable" error={err("phone")} hint="Ex. 4646-1212 ou +509 4646-1212">
            <input {...a("phone")} type="tel" inputMode="tel" autoComplete="tel" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="f-commune" label="Commune" error={err("commune")}><input {...a("commune")} autoComplete="address-level2" /></Field>
            <Field id="f-quarter" label="Quartier ou zone" error={err("quarter")}><input {...a("quarter")} /></Field>
          </div>
          <Field id="f-address" label="Adresse précise" error={err("address")} hint="Rue, impasse, numéro de maison si disponible">
            <input {...a("address")} autoComplete="street-address" />
          </Field>
          <Field id="f-landmark" label="Point de repère" error={err("landmark")} hint="Ex. en face de l'église, près de la pharmacie…"><input {...a("landmark")} /></Field>
        </fieldset>

        <details className="card p-5">
          <summary className="cursor-pointer font-display text-xl font-bold">3. Informations facultatives</summary>
          <div className="mt-4 space-y-4">
            <Field id="f-whatsapp" label="Numéro WhatsApp différent" optional error={err("whatsapp")}><input {...a("whatsapp")} type="tel" inputMode="tel" /></Field>
            <Field id="f-email" label="E-mail" optional error={err("email")} hint={emailEnabled ? "Pour recevoir la confirmation par e-mail." : "Inutile pour commander."}>
              <input {...a("email")} type="email" inputMode="email" autoComplete="email" />
            </Field>
            <Field id="f-gps" label="Position GPS ou lien de localisation" optional error={err("gps")} hint="Latitude, longitude ou lien Google Maps / Waze.">
              <input {...a("gps")} />
            </Field>
            <button type="button" className="btn btn-ghost !min-h-11 text-sm" onClick={fillMyPosition}>📍 Utiliser ma position</button>
            {gpsMsg && <p className="text-sm text-ink-soft" role="status">{gpsMsg}</p>}
            <Field id="f-deliveryInstructions" label="Instructions pour le livreur" optional error={err("deliveryInstructions")}>
              <textarea {...a("deliveryInstructions")} rows={2} />
            </Field>
            <Field id="f-notes" label="Remarques sur la commande" optional error={err("notes")}><textarea {...a("notes")} rows={2} /></Field>
          </div>
        </details>
        {/* Champ piège pour les robots : invisible, hors tabulation. */}
        <div aria-hidden="true" className="absolute -left-[9999px]"><label>Site web<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      </div>

      <aside className="card h-fit space-y-3 p-5 lg:sticky lg:top-24" aria-label="Récapitulatif de commande">
        <h2 className="font-display text-2xl font-bold">Récapitulatif</h2>
        <ul className="space-y-1 text-sm">
          {data?.lines.map((l) => (
            <li key={l.key} className="flex justify-between gap-2"><span>{l.quantity} × {l.productName} ({l.size})</span><span className="font-semibold">{formatMoney(l.lineTotalMinor, currency)}</span></li>
          ))}
        </ul>
        <div className="space-y-1 border-t border-line pt-3">
          <div className="flex justify-between"><span>Sous-total</span><strong>{formatMoney(subtotal, currency)}</strong></div>
          <div className="flex justify-between"><span>Livraison</span><strong>{fee !== null ? formatMoney(fee, currency) : mode === "quote" ? "À confirmer" : "Choisissez une zone"}</strong></div>
          <div className="flex justify-between border-t border-line pt-2 text-lg">
            <span>Total</span>
            <strong>{fee !== null ? formatMoney(subtotal + fee, currency) : "Frais de livraison à confirmer"}</strong>
          </div>
        </div>
        {mode === "quote" && <p className="rounded-xl bg-cream-2 p-3 text-sm">Aucun paiement maintenant. Après confirmation des frais, vous aurez le total complet et un lien pour payer.</p>}
        {hasProblems && <p role="alert" className="text-sm font-bold text-tomato">Certains articles ne sont plus disponibles. <Link className="underline" href="/panier">Vérifier le panier</Link></p>}
        {formError && <p role="alert" className="rounded-xl bg-tomato p-3 text-sm font-bold text-white">{formError}</p>}
        <button type="submit" className="btn btn-primary btn-lg" disabled={pending || loading || hasProblems || !ready}>
          {pending ? "Envoi en cours…" : mode === "quote" ? "Envoyer ma demande" : "Valider la commande"}
        </button>
        <p className="text-center text-xs text-ink-soft">Vous pourrez payer sur la page suivante, une fois le total confirmé.</p>
      </aside>
    </form>
  );
}

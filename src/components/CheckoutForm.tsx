"use client";

import Link from "next/link";
import { MapPin } from "lucide-react";
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

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <fieldset className="card space-y-4 p-5">
      <legend className="float-left mb-1 flex w-full items-center gap-2 text-xl font-extrabold"><span className="grid h-7 w-7 place-items-center rounded-full bg-tomato text-sm text-white" aria-hidden="true">{n}</span>{title}</legend>
      <div className="clear-both space-y-4">{children}</div>
    </fieldset>
  );
}

export function CheckoutForm({ zones, currency, emailEnabled, paymentMethods }: { zones: Zone[]; currency: Currency; emailEnabled: boolean; paymentMethods: { id: string; label: string }[] }) {
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
  const priced = !!data && !loading;
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
      paymentMethodId: v("paymentMethodId"),
      paymentMethodNote: v("paymentMethodNote"),
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
      <div className="space-y-5">
        <Section n={1} title="Coordonnées">
          <Field id="f-fullName" label="Nom complet" error={err("fullName")}><input {...a("fullName")} autoComplete="name" /></Field>
          <Field id="f-phone" label="Téléphone joignable" error={err("phone")} hint="Ex. 4646-1212 ou +509 4646-1212">
            <input {...a("phone")} type="tel" inputMode="tel" autoComplete="tel" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="f-whatsapp" label="Numéro WhatsApp différent" optional error={err("whatsapp")}><input {...a("whatsapp")} type="tel" inputMode="tel" /></Field>
            <Field id="f-email" label="E-mail" optional error={err("email")} hint={emailEnabled ? "Pour recevoir la confirmation par e-mail." : undefined}>
              <input {...a("email")} type="email" inputMode="email" autoComplete="email" />
            </Field>
          </div>
        </Section>

        <fieldset className="card space-y-4 p-5" id="f-delivery" tabIndex={-1}>
          <legend className="float-left mb-1 flex w-full items-center gap-2 text-xl font-extrabold"><span className="grid h-7 w-7 place-items-center rounded-full bg-tomato text-sm text-white" aria-hidden="true">2</span>Adresse de livraison</legend>
          <div className="clear-both space-y-4">
            <div className="space-y-2" role="radiogroup" aria-label="Zone de livraison">
              {zones.map((z) => (
                <label key={z.id} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border p-3 ${mode === "zone" && zoneId === z.id ? "border-ink bg-cream" : "border-line"}`}>
                  <input type="radio" name="zone" className="h-5 w-5 accent-[#921f24]" checked={mode === "zone" && zoneId === z.id} onChange={() => { setMode("zone"); setZoneId(z.id); }} />
                  <span className="flex-1"><strong>{z.name}</strong>{z.commune && <span className="block text-sm text-ink-soft">{z.commune}</span>}</span>
                  <span className="font-bold">{formatMoney(z.fee_minor, currency)}</span>
                </label>
              ))}
              <label className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border p-3 ${mode === "quote" ? "border-ink bg-cream" : "border-line"}`}>
                <input type="radio" name="zone" className="mt-1 h-5 w-5 accent-[#921f24]" checked={mode === "quote"} onChange={() => setMode("quote")} />
                <span className="flex-1"><strong>{zones.length ? "Mon adresse n'est pas dans la liste" : "Frais de livraison à confirmer"}</strong><span className="block text-sm text-ink-soft">Frais de livraison à confirmer selon votre adresse. Vous pouvez quand même enregistrer votre commande.</span></span>
              </label>
              {errors.zoneId && <p role="alert" className="text-sm font-bold text-tomato">{errors.zoneId}</p>}
              {errors.deliveryMode && <p role="alert" className="text-sm font-bold text-tomato">{errors.deliveryMode}</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="f-commune" label="Commune" error={err("commune")}><input {...a("commune")} autoComplete="address-level2" /></Field>
              <Field id="f-quarter" label="Quartier ou zone" error={err("quarter")}><input {...a("quarter")} /></Field>
            </div>
            <Field id="f-address" label="Adresse précise" error={err("address")} hint="Rue, impasse, numéro de maison si disponible"><input {...a("address")} autoComplete="street-address" /></Field>
            <Field id="f-landmark" label="Point de repère" error={err("landmark")} hint="Ex. en face de l'église, près de la pharmacie…"><input {...a("landmark")} /></Field>
            <Field id="f-gps" label="Localisation GPS ou lien" optional error={err("gps")} hint="Latitude, longitude ou lien Google Maps / Waze. La position n'est demandée que si vous touchez le bouton.">
              <input {...a("gps")} />
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="btn btn-ghost text-sm" onClick={fillMyPosition}><MapPin size={18} aria-hidden="true" />Utiliser ma position</button>
              {gpsMsg && <p className="text-sm text-ink-soft" role="status">{gpsMsg}</p>}
            </div>
            <Field id="f-deliveryInstructions" label="Instructions pour le livreur" optional error={err("deliveryInstructions")}><textarea {...a("deliveryInstructions")} rows={2} /></Field>
          </div>
        </fieldset>

        <Section n={3} title="Moyen de paiement souhaité">
          <p className="rounded-xl bg-cream-2 p-3 text-sm"><strong>Aucun paiement n'est effectué sur le site. Le paiement sera organisé directement avec Reina Pizza.</strong> Ne communiquez jamais de numéro de carte, de code PIN, de mot de passe ou de code de validation.</p>
          <Field id="f-paymentMethodId" label="Moyen de paiement souhaité" error={errors.paymentMethodId}>
            <select id="f-paymentMethodId" name="paymentMethodId" className="field" defaultValue={paymentMethods.length === 1 ? paymentMethods[0].id : ""} aria-invalid={errors.paymentMethodId ? true : undefined}>
              {paymentMethods.length !== 1 && <option value="" disabled>Choisir…</option>}
              {paymentMethods.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </Field>
          <Field id="f-paymentMethodNote" label="Précisez le moyen dont vous disposez" optional error={errors.paymentMethodNote} hint="Ex. : espèces à la livraison, ou le service mobile que vous utilisez.">
            <input id="f-paymentMethodNote" name="paymentMethodNote" maxLength={200} className="field" />
          </Field>
        </Section>

        <Section n={4} title="Remarques">
          <Field id="f-notes" label="Remarques sur la commande" optional error={err("notes")}><textarea {...a("notes")} rows={2} /></Field>
        </Section>
        {/* Champ piège pour les robots : invisible, hors tabulation. */}
        <div aria-hidden="true" className="absolute -left-[9999px]"><label>Site web<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      </div>

      <aside className="card h-fit space-y-3 p-5 lg:sticky lg:top-24" aria-label="Récapitulatif de commande">
        <h2 className="text-xl font-extrabold">Récapitulatif</h2>
        <ul className="space-y-1 text-sm">
          {data?.lines.map((l) => (
            <li key={l.key} className="flex justify-between gap-2"><span>{l.quantity} × {l.productName} ({l.size})</span><span className="font-semibold">{formatMoney(l.lineTotalMinor, currency)}</span></li>
          ))}
        </ul>
        <div className="space-y-1 border-t border-line pt-3">
          <div className="flex justify-between"><span>Sous-total des produits</span><strong>{priced ? formatMoney(subtotal, currency) : "Calcul…"}</strong></div>
          {fee !== null && !priced ? null : fee !== null ? (
            <>
              <div className="flex justify-between"><span>Livraison</span><strong>{formatMoney(fee, currency)}</strong></div>
              <div className="flex justify-between border-t border-line pt-2 text-lg"><span>Total</span><strong>{formatMoney(subtotal + fee, currency)}</strong></div>
            </>
          ) : (
            <p className="pt-1 text-sm font-semibold">{mode === "zone" ? "Choisissez une zone pour voir les frais." : "Frais de livraison à confirmer selon votre adresse."}</p>
          )}
        </div>
        {mode === "quote" && <p className="rounded-xl bg-cream-2 p-3 text-sm">Ce montant est le sous-total des pizzas, pas un total final : la livraison n'est pas encore comptée.</p>}
        {hasProblems && <p role="alert" className="text-sm font-bold text-tomato">Certains articles ne sont plus disponibles. <Link className="underline" href="/panier">Vérifier le panier</Link></p>}
        {formError && <p role="alert" className="rounded-xl bg-tomato p-3 text-sm font-semibold text-white">{formError}</p>}
        <button type="submit" className="btn btn-primary btn-lg" disabled={pending || loading || hasProblems || !ready} aria-busy={pending}>
          {pending ? "Enregistrement…" : "Enregistrer ma commande"}
        </button>
        <p className="text-center text-xs text-ink-soft">Ensuite, vous confirmez la livraison et le paiement avec Reina Pizza sur WhatsApp.</p>
      </aside>
    </form>
  );
}

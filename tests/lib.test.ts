import { describe, expect, it } from "vitest";
import { normalizePhone } from "@/lib/phone";
import { formatMoney, parseMajorToMinor } from "@/lib/money";
import { normalizeLocation } from "@/lib/location";
import { checkoutSchema, fieldErrors } from "@/lib/validation";
import { waLink, customerContactMessage, buildOrderMessage, type MessageOrder } from "@/lib/whatsapp";
import { payState } from "@/lib/orderState";
import { allowedNextStatuses } from "@/lib/labels";

describe("numéros haïtiens", () => {
  it.each([
    ["4646-1212", "+50946461212"],
    ["46461212", "+50946461212"],
    ["+509 4646-1212", "+50946461212"],
    ["509 4646 1212", "+50946461212"],
    ["00509 46461212", "+50946461212"],
    ["(509) 3412-3456", "+50934123456"],
    ["+1 305 555 0123", "+13055550123"],
  ])("%s → %s", (input, out) => expect(normalizePhone(input)).toBe(out));
  it.each(["", "123", "0646-1212", "abcd1234", "+509 123", "46461212345", "1234567"])("refuse %s", (i) => expect(normalizePhone(i)).toBeNull());
});

describe("montants", () => {
  it("affiche toujours le code de devise", () => {
    expect(formatMoney(125050, "HTG")).toMatch(/^1\s250,50\s+HTG$/);
    expect(formatMoney(150000, "HTG")).toMatch(/^1\s500\sHTG$/); // pas de décimales inutiles
    expect(formatMoney(125050, "USD")).toMatch(/USD$/);
    expect(formatMoney(100, null)).toContain("devise à confirmer");
  });
  it("parse les saisies", () => {
    expect(parseMajorToMinor("1 250,5")).toBe(125050);
    expect(parseMajorToMinor("1250.50")).toBe(125050);
    expect(parseMajorToMinor("12.345")).toBeNull();
    expect(parseMajorToMinor("-5")).toBeNull();
    expect(parseMajorToMinor("abc")).toBeNull();
  });
});

describe("position", () => {
  it("accepte coordonnées et liens de cartes https connus", () => {
    expect(normalizeLocation("18.5392, -72.3350")).toBe("18.5392, -72.335");
    expect(normalizeLocation("https://maps.app.goo.gl/abc123")).toContain("maps.app.goo.gl");
    expect(normalizeLocation("https://www.google.com/maps?q=18.5,-72.3")).toBeTruthy();
  });
  it("refuse le reste", () => {
    for (const bad of ["http://maps.google.com/x", "https://evil.example/x", "javascript:alert(1)", "95,200", "https://google.com.evil.io/"]) {
      expect(normalizeLocation(bad), bad).toBeNull();
    }
  });
});

describe("validation du formulaire", () => {
  const base = {
    items: [{ productId: "22222222-2222-2222-2222-222222222221", size: "M", quantity: 1 }],
    deliveryMode: "zone",
    zoneId: "44444444-4444-4444-4444-444444444441",
    idempotencyKey: "abcdefghijklmnopqrstu",
    paymentMethodId: "55555555-5555-5555-5555-555555555555",
    customer: { fullName: "Marie", phone: "3412 3456", commune: "Delmas", quarter: "Delmas 33", address: "Rue Charbonnier", landmark: "Près école" },
  };
  it("normalise le téléphone, pas d'e-mail ni de code postal requis", () => {
    const r = checkoutSchema.parse(base);
    expect(r.customer.phone).toBe("+50934123456");
    expect(r.customer.email).toBeUndefined();
  });
  it("exige le moyen de paiement souhaité, la précision est facultative", () => {
    expect(checkoutSchema.safeParse({ ...base, paymentMethodId: undefined }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...base, paymentMethodId: "" }).success).toBe(false);
    const ok = checkoutSchema.parse({ ...base, paymentMethodNote: "  espèces  " });
    expect(ok.paymentMethodNote).toBe("espèces");
    expect(checkoutSchema.safeParse({ ...base, paymentMethodNote: "x".repeat(201) }).success).toBe(false);
  });
  it("signale chaque champ obligatoire manquant", () => {
    const r = checkoutSchema.safeParse({ ...base, customer: { fullName: "", phone: "12", commune: "", quarter: "", address: "", landmark: "" } });
    expect(r.success).toBe(false);
    if (!r.success) {
      const e = fieldErrors(r.error);
      for (const k of ["fullName", "phone", "commune", "quarter", "address", "landmark"]) expect(e[`customer.${k}`], k).toBeTruthy();
    }
  });
  it("exige une zone en mode zone, pas en mode estimation", () => {
    expect(checkoutSchema.safeParse({ ...base, zoneId: undefined }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...base, deliveryMode: "quote", zoneId: undefined }).success).toBe(true);
  });
  it("refuse quantité abusive et e-mail invalide", () => {
    expect(checkoutSchema.safeParse({ ...base, items: [{ ...base.items[0], quantity: 999 }] }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...base, customer: { ...base.customer, email: "pas-un-mail" } }).success).toBe(false);
  });
});

describe("WhatsApp", () => {
  it("message prérempli encodé, sans donnée personnelle", () => {
    const url = waLink("50946461212", customerContactMessage("RP-ABC234"));
    expect(url).toBe("https://wa.me/50946461212?text=Bonjour%20Reina%20Pizza%2C%20je%20vous%20contacte%20au%20sujet%20de%20ma%20commande%20RP-ABC234.");
  });
});

describe("états de commande", () => {
  const o = { order_status: "to_confirm", payment_status: "unpaid", fee_status: "accepted", total_expires_at: null } as const;
  it("calcule la possibilité de payer", () => {
    expect(payState(o)).toBe("payable");
    expect(payState({ ...o, fee_status: "to_confirm" })).toBe("await_fee");
    expect(payState({ ...o, fee_status: "proposed" })).toBe("needs_acceptance");
    expect(payState({ ...o, total_expires_at: new Date(Date.now() - 1000) })).toBe("expired");
    expect(payState({ ...o, order_status: "cancelled" })).toBe("order_cancelled");
    expect(payState({ ...o, order_status: "cancelled", payment_status: "paid" })).toBe("paid");
  });
  it("verrouille les statuts finaux", () => {
    expect(allowedNextStatuses("delivered")).toEqual([]);
    expect(allowedNextStatuses("cancelled")).toEqual([]);
    expect(allowedNextStatuses("confirmed")).toContain("cancelled");
  });
});

describe("message WhatsApp complet", () => {
  const order: MessageOrder = {
    ref: "RP-ABC234", currency: "HTG", subtotal_minor: 300000, delivery_fee_minor: null, total_minor: null,
    customer_name: "Marie Test", customer_phone: "+50934123456", customer_whatsapp: null, commune: "Delmas", quarter: "Delmas 33",
    address: "Rue Charbonnier, impasse Costo, n° 12", landmark: "En face de la pharmacie", gps_location: null,
    delivery_instructions: null, notes: null, payment_method: "À convenir avec la pizzeria", payment_method_note: null,
  };
  const items = [{ product_name: "Pizza pepperoni", size: "S", quantity: 2, line_total_minor: 300000, extras: [] }];

  it("frais inconnus : sous-total seul, pas de total, question sur les frais, lignes facultatives omises", () => {
    const t = buildOrderMessage(order, items);
    expect(t).toContain("Bonjour Reina Pizza 🍕\nJe souhaite confirmer ma commande n° RP-ABC234.");
    expect(t).toContain("• 2 × Pizza pepperoni — taille S — 3 000 HTG");
    expect(t).toContain("Sous-total des produits : 3 000 HTG\nLivraison : À confirmer selon mon adresse");
    expect(t).not.toMatch(/^Total :/m);
    for (const absent of ["WhatsApp :", "Localisation :", "Instructions :", "Remarques :"]) expect(t).not.toContain(absent);
    expect(t).toContain("Téléphone : +509 3412-3456");
    expect(t).toContain("Moyen souhaité : À convenir avec la pizzeria\nPaiement à organiser directement avec la pizzeria.");
    expect(t).toContain("confirmer la disponibilité, les frais de livraison et le délai estimé");
    expect(t).not.toMatch(/\n\n\n/);
  });
  it("frais connus : total affiché, toutes les lignes facultatives présentes", () => {
    const t = buildOrderMessage({ ...order, delivery_fee_minor: 25000, total_minor: 325000, customer_whatsapp: "+50937001122", gps_location: "18.5, -72.3",
      delivery_instructions: "Sonner deux fois", notes: "Sans oignon", payment_method_note: "espèces" }, items);
    expect(t).toContain("Livraison : 250 HTG\nTotal : 3 250 HTG");
    expect(t).toContain("WhatsApp : +509 3700-1122");
    expect(t).toContain("Localisation : 18.5, -72.3");
    expect(t).toContain("Instructions : Sonner deux fois");
    expect(t).toContain("Moyen souhaité : À convenir avec la pizzeria — espèces");
    expect(t).toContain("Remarques : Sans oignon");
    expect(t).toContain("confirmer la disponibilité et le délai estimé");
    expect(t).not.toContain("les frais de livraison et");
  });
  it("encodé sans perte dans l'URL, et jamais de jeton", () => {
    const t = buildOrderMessage({ ...order, address: "Rue & « test » 100% #1 ?x=y" }, items);
    const url = waLink("50946461212", t);
    expect(url.startsWith("https://wa.me/50946461212?text=")).toBe(true);
    expect(decodeURIComponent(url.split("?text=")[1])).toBe(t);
    expect(url).not.toMatch(/[ \n]/);
    expect(t).not.toMatch(/commande\/|[A-Za-z0-9_-]{43}/);
  });
  it("ne tronque pas les champs essentiels à leur longueur maximale", () => {
    const t = buildOrderMessage({ ...order, address: "a".repeat(250), landmark: "b".repeat(250), notes: "c".repeat(500), delivery_instructions: "d".repeat(500) }, items);
    for (const ch of ["a", "b", "c", "d"]) expect(t).toContain(ch.repeat(ch === "a" || ch === "b" ? 250 : 500));
  });
});

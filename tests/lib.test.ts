import { describe, expect, it } from "vitest";
import { normalizePhone } from "@/lib/phone";
import { formatMoney, parseMajorToMinor } from "@/lib/money";
import { normalizeLocation } from "@/lib/location";
import { checkoutSchema, fieldErrors } from "@/lib/validation";
import { waLink, customerContactMessage } from "@/lib/whatsapp";
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
    expect(formatMoney(125050, "HTG")).toMatch(/1\s250,50\s+HTG$/);
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
    customer: { fullName: "Marie", phone: "3412 3456", commune: "Delmas", quarter: "Delmas 33", address: "Rue Charbonnier", landmark: "Près école" },
  };
  it("normalise le téléphone, pas d'e-mail ni de code postal requis", () => {
    const r = checkoutSchema.parse(base);
    expect(r.customer.phone).toBe("+50934123456");
    expect(r.customer.email).toBeUndefined();
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

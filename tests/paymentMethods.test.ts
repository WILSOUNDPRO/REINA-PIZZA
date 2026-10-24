import fs from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { checkout, resetDb, sql } from "./helpers";
import { createOrder, getOrderByToken, setManualPaymentStatus } from "@/server/orders";
import { deleteMethod, listEnabledPaymentMethods, listPaymentMethods, saveMethod } from "@/server/paymentMethods";
import { buildOrderMessage } from "@/lib/whatsapp";

beforeEach(() => resetDb());
const mig = fs.readFileSync("supabase/migrations/20260105000000_payment_methods_details.sql", "utf8");
const moncash = async () => (await listPaymentMethods(sql)).find((m) => m.label === "MonCash")!;

describe("migration MonCash", () => {
  it("active MonCash, sans numéro de réception supposé, de façon idempotente", async () => {
    await sql.unsafe(mig);
    await sql.unsafe(mig);
    const all = await listPaymentMethods(sql);
    expect(all.filter((m) => m.label === "MonCash").length).toBe(1);
    expect(await moncash()).toMatchObject({ enabled: true, recipient_account: null, recipient_name: null, instructions: null });
    expect((await listEnabledPaymentMethods(sql)).map((m) => m.label)).toContain("MonCash");
  });

  it("ne réactive pas MonCash désactivé et n'écrase pas les coordonnées saisies par l'administrateur", async () => {
    await sql.unsafe(mig);
    const m = await moncash();
    expect((await saveMethod(sql, { id: m.id, label: "MonCash", recipientAccount: "3700-0000", recipientName: "Titulaire test", position: 1, enabled: false })).ok).toBe(true);
    await sql.unsafe(mig);
    expect(await moncash()).toMatchObject({ enabled: false, recipient_account: "3700-0000", recipient_name: "Titulaire test" });
  });
});

describe("administration des moyens de paiement", () => {
  it("ajoute, modifie (nom, instructions, ordre, bénéficiaire), active et désactive", async () => {
    expect((await saveMethod(sql, { label: "MonCash", instructions: "Après confirmation.", recipientAccount: " 3412-0000 ", recipientName: "Bénéficiaire test", position: 2 })).ok).toBe(true);
    let m = await moncash();
    expect(m).toMatchObject({ instructions: "Après confirmation.", recipient_account: "3412-0000", recipient_name: "Bénéficiaire test", position: 2, enabled: true });
    expect((await saveMethod(sql, { id: m.id, label: "MonCash Haïti", position: -1, instructions: "", enabled: true })).ok).toBe(true);
    m = (await listPaymentMethods(sql)).find((x) => x.id === m.id)!;
    expect(m).toMatchObject({ label: "MonCash Haïti", position: -1, instructions: null, recipient_account: null });
    expect((await listEnabledPaymentMethods(sql))[0].label).toBe("MonCash Haïti"); // ordre d'affichage respecté
  });

  it("valide les champs : nom obligatoire et unique, longueurs, au moins un moyen activé", async () => {
    expect(await saveMethod(sql, { label: "  ", position: 0 })).toMatchObject({ ok: false });
    expect(await saveMethod(sql, { label: "x".repeat(81), position: 0 })).toMatchObject({ ok: false });
    expect(await saveMethod(sql, { label: "A", instructions: "i".repeat(501), position: 0 })).toMatchObject({ ok: false });
    expect(await saveMethod(sql, { label: "MonCash", position: 1 })).toMatchObject({ ok: true });
    expect(await saveMethod(sql, { label: "MonCash", position: 1 })).toMatchObject({ ok: false, message: expect.stringContaining("déjà ce nom") });
    const [only] = (await listPaymentMethods(sql)).filter((m) => m.label !== "MonCash");
    await saveMethod(sql, { id: (await moncash()).id, label: "MonCash", position: 1, enabled: false });
    expect(await saveMethod(sql, { id: only.id, label: only.label, position: 0, enabled: false })).toMatchObject({ ok: false, message: expect.stringContaining("Au moins un") });
    expect(await deleteMethod(sql, only.id)).toMatchObject({ ok: false });
  });
});

describe("commande avec MonCash", () => {
  async function orderWithMoncash(note?: string) {
    await saveMethod(sql, { label: "MonCash", instructions: "Instruction test", position: 1 });
    const m = await moncash();
    const r = await createOrder(sql, checkout({ paymentMethodId: m.id, paymentMethodNote: note }));
    if (!r.ok) throw new Error(r.message);
    const { order, items } = (await getOrderByToken(sql, r.token))!;
    return { m, order, items };
  }

  it("enregistre le choix, qui ne vaut pas paiement ; seul l'admin confirme", async () => {
    const { order } = await orderWithMoncash("depuis mon téléphone");
    expect(order).toMatchObject({ payment_method: "MonCash", payment_method_note: "depuis mon téléphone", payment_status: "to_arrange", paid_at: null, payment_confirmed_by: null });
    expect((await setManualPaymentStatus(sql, order.id, "confirmed_manually", "admin@test")).ok).toBe(true);
    expect((await sql`select payment_confirmed_by from orders where id = ${order.id}`)[0].payment_confirmed_by).toBe("admin@test");
  });

  it("inclut le moyen choisi dans le message WhatsApp, sans le compte destinataire", async () => {
    await saveMethod(sql, { label: "MonCash", recipientAccount: "3999-1111", position: 1 });
    const m = await moncash();
    const r = await createOrder(sql, checkout({ paymentMethodId: m.id, paymentMethodNote: "MonCash personnel" }));
    if (!r.ok) throw new Error(r.message);
    const { order, items } = (await getOrderByToken(sql, r.token))!;
    const msg = buildOrderMessage(order, items);
    expect(msg).toContain("Moyen souhaité : MonCash — MonCash personnel\nPaiement à organiser directement avec la pizzeria.");
    expect(msg).not.toContain("3999-1111");
  });

  it("conserve le nom du moyen choisi s'il est ensuite renommé, désactivé ou supprimé", async () => {
    const { m, order } = await orderWithMoncash();
    await saveMethod(sql, { id: m.id, label: "MonCash (nouveau nom)", position: 1, enabled: true });
    expect((await getOrderByToken(sql, (await sql`select access_token from orders where id = ${order.id}`)[0].access_token))!.order.payment_method).toBe("MonCash");
    await saveMethod(sql, { id: m.id, label: "MonCash (nouveau nom)", position: 1, enabled: false });
    expect((await sql`select payment_method from orders where id = ${order.id}`)[0].payment_method).toBe("MonCash");
    await saveMethod(sql, { label: "Autre", position: 5 });
    expect((await deleteMethod(sql, m.id)).ok).toBe(true);
    expect((await sql`select payment_method from orders where id = ${order.id}`)[0].payment_method).toBe("MonCash");
  });

  it("refuse un moyen désactivé ou supprimé pour une nouvelle commande", async () => {
    await saveMethod(sql, { label: "MonCash", position: 1 });
    const m = await moncash();
    await saveMethod(sql, { id: m.id, label: "MonCash", position: 1, enabled: false });
    expect(await createOrder(sql, checkout({ paymentMethodId: m.id }))).toMatchObject({ ok: false, code: "payment_method_invalid" });
  });
});

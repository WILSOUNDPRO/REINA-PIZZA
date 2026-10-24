import { beforeEach, describe, expect, it } from "vitest";
import { IDS, checkout, resetDb, sql } from "./helpers";
import { createOrder } from "@/server/orders";
import { deleteProduct, listAdminProducts, menuSummary, saveSizes, setArchived, setAvailability } from "@/server/menu";
import { getPublicCatalog } from "@/server/catalog";
import { priceCart } from "@/server/pricing";

beforeEach(() => resetDb());
const sizesOf = async (id: string) => (await sql`select size, price_minor, available from product_sizes where product_id = ${id} order by array_position(array['S','M','L','XL','XXL'], size)`).map((r) => [r.size, r.price_minor]);

describe("synthèse et liste du menu admin", () => {
  it("compte produits, disponibles et tailles tarifées depuis les données réelles", async () => {
    // fixtures : Pizza A (S, M), Pizza B (XL) → 3 tailles tarifées, 2 produits
    expect(await menuSummary(sql)).toMatchObject({ products: 2, available: 2, priced: 3, archived: 0 });
    await sql`update products set available = false where id = ${IDS.pizzaB}`;
    await sql`update product_sizes set available = false where product_id = ${IDS.pizzaA} and size = 'M'`; // non proposée : non comptée
    await sql`insert into product_sizes (product_id, size, price_minor) values (${IDS.pizzaA}, 'L', 0)`; // prix 0 : non valide
    expect(await menuSummary(sql)).toMatchObject({ products: 2, available: 1, priced: 2 });
  });

  it("recherche par nom, filtre de disponibilité, archivés à part", async () => {
    expect((await listAdminProducts(sql, { q: "pizza a" })).map((p) => p.name)).toEqual(["Pizza A"]);
    expect(await listAdminProducts(sql, { q: "inexistant" })).toEqual([]);
    expect((await listAdminProducts(sql, { q: "100%_" })).length).toBe(0); // jokers LIKE neutralisés
    await sql`update products set available = false where id = ${IDS.pizzaB}`;
    expect((await listAdminProducts(sql, { dispo: "available" })).map((p) => p.name)).toEqual(["Pizza A"]);
    expect((await listAdminProducts(sql, { dispo: "unavailable" })).map((p) => p.name)).toEqual(["Pizza B"]);
    await setArchived(sql, IDS.pizzaB, true);
    expect((await listAdminProducts(sql, {})).map((p) => p.name)).toEqual(["Pizza A"]);
    expect((await listAdminProducts(sql, { archived: true })).map((p) => p.name)).toEqual(["Pizza B"]);
    expect((await listAdminProducts(sql, { q: "A" }))[0].sizes.map((s) => s.size)).toEqual(["S", "M"]);
  });
});

describe("tailles et prix", () => {
  it("enregistre des prix exacts (centimes) et retire une taille laissée vide, jamais 0 par défaut", async () => {
    const r = await saveSizes(sql, IDS.pizzaA, { S: "1 250,50", M: "", L: "1800", XL: "", XXL: "" });
    expect(r.ok).toBe(true);
    expect(await sizesOf(IDS.pizzaA)).toEqual([["S", 125050], ["L", 180000]]);
  });

  it("refuse les montants nuls, négatifs, mal formés ou arrondis, et les tailles inconnues ; conserve l'état", async () => {
    const before = await sizesOf(IDS.pizzaA);
    for (const bad of ["0", "-5", "abc", "12.345", "1e3", "99999999999"]) {
      const r = await saveSizes(sql, IDS.pizzaA, { S: bad });
      expect(r.ok, bad).toBe(false);
      if (!r.ok) expect(r.errors?.S, bad).toBeTruthy();
    }
    const r = await saveSizes(sql, IDS.pizzaA, { S: "100", XXXL: "5" });
    expect(r).toMatchObject({ ok: false, errors: { XXXL: expect.any(String) } });
    expect(await sizesOf(IDS.pizzaA)).toEqual(before);
  });

  it("un produit disponible garde au moins une taille tarifée", async () => {
    expect(await saveSizes(sql, IDS.pizzaA, { S: "", M: "" })).toMatchObject({ ok: false, status: 409 });
    await setAvailability(sql, IDS.pizzaA, false);
    expect((await saveSizes(sql, IDS.pizzaA, { S: "", M: "" })).ok).toBe(true);
    expect(await setAvailability(sql, IDS.pizzaA, true)).toMatchObject({ ok: false, status: 409 }); // aucune taille tarifée
    await saveSizes(sql, IDS.pizzaA, { S: "900" });
    expect((await setAvailability(sql, IDS.pizzaA, true)).ok).toBe(true);
  });

  it("une taille retirée ou à prix 0 n'est pas commandable ; la nouvelle devient commandable ; les anciennes commandes ne changent pas", async () => {
    const created = await createOrder(sql, checkout({ items: [{ productId: IDS.pizzaA, size: "S", quantity: 1 }] }));
    expect(created.ok).toBe(true);
    const order = (await sql`select id, total_minor, subtotal_minor from orders order by created_at desc limit 1`)[0];
    await saveSizes(sql, IDS.pizzaA, { S: "999", XL: "2500" }); // M retirée, S modifiée, XL ajoutée
    expect((await priceCart(sql, [{ productId: IDS.pizzaA, size: "M", quantity: 1, extraIds: [] }])).problems.length).toBe(1);
    expect((await priceCart(sql, [{ productId: IDS.pizzaA, size: "XL", quantity: 2, extraIds: [] }])).subtotalMinor).toBe(500000);
    await sql`insert into product_sizes (product_id, size, price_minor) values (${IDS.pizzaA}, 'XXL', 0)`;
    expect((await priceCart(sql, [{ productId: IDS.pizzaA, size: "XXL", quantity: 1, extraIds: [] }])).problems.length).toBe(1);
    const cat = await getPublicCatalog(sql);
    expect(cat.products.find((p) => p.id === IDS.pizzaA)!.sizes.map((s) => s.size)).toEqual(["S", "XL"]);
    const after = (await sql`select total_minor, subtotal_minor from orders where id = ${order.id}`)[0];
    expect(after).toMatchObject({ total_minor: order.total_minor, subtotal_minor: order.subtotal_minor });
    expect((await sql`select unit_price_minor from order_items where order_id = ${order.id}`)[0].unit_price_minor).toBe(100000); // prix de l'achat conservé
  });
});

describe("disponibilité, archivage, suppression", () => {
  it("l'indisponibilité retire le produit du catalogue public", async () => {
    await setAvailability(sql, IDS.pizzaB, false);
    expect((await getPublicCatalog(sql)).products.map((p) => p.id)).toEqual([IDS.pizzaA]);
    expect(await setAvailability(sql, "00000000-0000-0000-0000-000000000000", true)).toMatchObject({ ok: false, status: 404 });
  });

  it("archive un produit commandé (masqué du site, commandes intactes) et refuse sa suppression", async () => {
    await createOrder(sql, checkout({ items: [{ productId: IDS.pizzaA, size: "S", quantity: 1 }] }));
    expect(await deleteProduct(sql, IDS.pizzaA)).toMatchObject({ ok: false, status: 409 });
    expect((await sql`select count(*)::int as n from products where id = ${IDS.pizzaA}`)[0].n).toBe(1);
    await setArchived(sql, IDS.pizzaA, true);
    expect((await getPublicCatalog(sql)).products.map((p) => p.id)).toEqual([IDS.pizzaB]);
    expect((await priceCart(sql, [{ productId: IDS.pizzaA, size: "S", quantity: 1, extraIds: [] }])).problems.length).toBe(1);
    expect(await setAvailability(sql, IDS.pizzaA, true)).toMatchObject({ ok: false, status: 409 }); // archivé : à restaurer d'abord
    await setArchived(sql, IDS.pizzaA, false);
    expect((await sql`select available from products where id = ${IDS.pizzaA}`)[0].available).toBe(false); // restauré indisponible
    expect((await sql`select count(*)::int as n from order_items where product_name = 'Pizza A'`)[0].n).toBe(1);
  });

  it("supprime un produit jamais commandé", async () => {
    expect((await deleteProduct(sql, IDS.pizzaB)).ok).toBe(true);
    expect((await sql`select count(*)::int as n from products where id = ${IDS.pizzaB}`)[0].n).toBe(0);
  });
});

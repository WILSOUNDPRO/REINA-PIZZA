import fs from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { IDS, checkout, resetDb, sql } from "./helpers";
import { createOrder, getOrderByToken } from "@/server/orders";
import { priceCart } from "@/server/pricing";
import { getPublicCatalog } from "@/server/catalog";
import { listAdminProducts, saveProduct, setAvailability } from "@/server/menu";
import { buildOrderMessage } from "@/lib/whatsapp";

const mig = fs.readFileSync("supabase/migrations/20260106000000_non_pizza_products.sql", "utf8");
beforeEach(() => resetDb());

async function seedOther() {
  await sql.unsafe(mig);
  const rows = await sql`select id, name from products where product_type = 'other' order by name`;
  return { burger: rows.find((r) => r.name === "Burger")!.id as string, wings: rows.find((r) => r.name === "Wings")!.id as string };
}
const item = (productId: string, over: Record<string, unknown> = {}) => ({ productId, quantity: 1, extraIds: [] as string[], ...over });

describe("migration Burger et Wings", () => {
  it("crée les deux produits non configurés, sans prix, sans portion, non commandables, avec catégorie et illustration", async () => {
    await sql.unsafe(mig);
    await sql.unsafe(mig); // idempotente
    const rows = await sql`select p.name, p.product_type, p.sale_unit, p.base_price_minor, p.pieces_per_portion, p.available, p.visible, p.default_image, p.description, p.ingredients, c.name as cat
      from products p join categories c on c.id = p.category_id where p.product_type = 'other' order by p.name`;
    expect(rows.map((r) => [r.name, r.cat, r.default_image])).toEqual([["Burger", "Burgers", "burger"], ["Wings", "Wings", "wings"]]);
    for (const r of rows) expect(r).toMatchObject({ sale_unit: null, base_price_minor: null, pieces_per_portion: null, available: false, visible: true, description: "", ingredients: null });
    expect((await sql`select count(*)::int as n from product_variants`)[0].n).toBe(0);
    expect((await sql`select count(*)::int as n from categories where lower(name) in ('burgers','wings')`)[0].n).toBe(2);
  });

  it("ne crée pas de doublon si un produit a été renommé, et n'écrase aucune saisie", async () => {
    const { burger } = await seedOther();
    await saveProduct(sql, { id: burger, name: "Cheeseburger", basePrice: "1000", saleUnit: "unit", available: true, visible: true });
    await sql.unsafe(mig);
    expect((await sql`select count(*)::int as n from products where default_image = 'burger'`)[0].n).toBe(1);
    expect(await sql`select name, base_price_minor, available from products where id = ${burger}`).toMatchObject([{ name: "Cheeseburger", base_price_minor: 100000, available: true }]);
  });

  it("les images par défaut existent (PNG d'origine + WebP 480/800/1200) et sont en 4:3", async () => {
    const sharp = (await import("sharp")).default;
    for (const slug of ["burger", "burger-frites", "wings"]) {
      expect(fs.existsSync(`public/images/products/${slug}.png`)).toBe(true);
      for (const f of [`${slug}-480.webp`, `${slug}-800.webp`, `${slug}.webp`]) {
        const m = await sharp(`public/images/products/${f}`).metadata();
        expect(m.format, f).toBe("webp");
        expect(Math.abs(m.width! / m.height! - 4 / 3), f).toBeLessThan(0.01);
      }
      expect((await sharp(`public/images/products/${slug}.webp`).metadata()).width).toBe(1200);
    }
  });
});

describe("catalogue public : états", () => {
  it("« soon » tant que prix ET unité ne sont pas configurés ; « unavailable » si désactivé ; masqué si invisible", async () => {
    const { burger, wings } = await seedOther();
    const state = async (id: string) => (await getPublicCatalog(sql)).products.find((p) => p.id === id)?.state;
    expect(await state(burger)).toBe("soon");
    await sql`update products set base_price_minor = 100000 where id = ${burger}`;
    expect(await state(burger)).toBe("soon"); // prix sans unité
    await sql`update products set sale_unit = 'unit' where id = ${burger}`;
    expect(await state(burger)).toBe("unavailable"); // configuré mais non activé
    await sql`update products set available = true where id = ${burger}`;
    expect(await state(burger)).toBe("orderable");
    await sql`update products set visible = false where id = ${burger}`;
    expect(await state(burger)).toBeUndefined();
    expect(await state(wings)).toBe("soon");
  });
});

describe("commande : vérification côté serveur", () => {
  it("refuse tout produit non configuré, même en forçant la requête", async () => {
    const { burger, wings } = await seedOther();
    await sql`update products set available = true where id in (${burger}, ${wings})`; // même « activés » de force
    for (const id of [burger, wings]) {
      const c = await priceCart(sql, [item(id)]);
      expect(c.lines).toEqual([]);
      expect(c.problems[0].reason).toBe("not_configured");
      expect(await createOrder(sql, checkout({ items: [item(id)] }))).toMatchObject({ ok: false, code: "cart_problems" });
    }
    await sql`update products set base_price_minor = 150000 where id = ${burger}`; // prix sans unité
    expect((await priceCart(sql, [item(burger)])).problems[0].reason).toBe("not_configured");
    await sql`update products set sale_unit = 'unit', available = false where id = ${burger}`;
    expect((await priceCart(sql, [item(burger)])).problems[0].reason).toBe("unavailable");
    expect((await sql`select count(*)::int as n from orders`)[0].n).toBe(0);
  });

  it("commande mixte pizza + burger + wings : montants recalculés côté serveur, libellés sans taille fictive", async () => {
    const { burger, wings } = await seedOther();
    await saveProduct(sql, { id: burger, name: "Burger", basePrice: "1 500", saleUnit: "unit", available: true, visible: true, variants: [{ label: "Double", price: "2200" }] });
    await saveProduct(sql, { id: wings, name: "Wings", basePrice: "1800", saleUnit: "portion", pieces: "6", available: true, visible: true });
    const r = await createOrder(sql, checkout({ items: [item(IDS.pizzaA, { size: "S", quantity: 1 }), item(burger, { quantity: 2 }), item(burger), item(wings, { quantity: 1 })], deliveryMode: "quote", zoneId: undefined }));
    if (!r.ok) throw new Error(r.message);
    const { order, items } = (await getOrderByToken(sql, r.token))!;
    // pizza A S = 1 000 ; burger ×(2+1 fusionnés) = 3 × 1 500 = 4 500 ; wings = 1 800  →  7 300 HTG
    expect(order.subtotal_minor).toBe(100000 + 450000 + 180000);
    expect(items.map((i) => [i.product_name, i.size, i.option_label, i.quantity, i.line_total_minor])).toEqual([
      ["Pizza A", "S", null, 1, 100000], ["Burger", null, null, 3, 450000], ["Wings", null, "portion de 6 pièces", 1, 180000],
    ]);
    const msg = buildOrderMessage(order, items);
    expect(msg).toContain("• 1 × Pizza A — taille S — 1 000 HTG");
    expect(msg).toContain("• 3 × Burger — 4 500 HTG");
    expect(msg).toContain("• 1 × Wings — portion de 6 pièces — 1 800 HTG");
    expect(msg).not.toMatch(/taille (null|undefined|\s|—)/);
    expect(msg).not.toMatch(/Burger — taille|Wings — taille/);
  });

  it("variante : son propre prix, libellé figé dans la commande ; les prix ultérieurs ne changent pas les anciennes commandes", async () => {
    const { burger } = await seedOther();
    await saveProduct(sql, { id: burger, name: "Burger", basePrice: "1500", saleUnit: "unit", available: true, visible: true, variants: [{ label: "Double", price: "2200" }] });
    const [v] = await sql`select id from product_variants where product_id = ${burger}`;
    const r = await createOrder(sql, checkout({ items: [item(burger, { variantId: v.id })] }));
    if (!r.ok) throw new Error(r.message);
    await saveProduct(sql, { id: burger, name: "Burger", basePrice: "9999", saleUnit: "portion", pieces: "3", available: true, visible: true, variants: [] });
    const { items, order } = (await getOrderByToken(sql, r.token))!;
    expect(items[0]).toMatchObject({ unit_price_minor: 220000, option_label: "Double · à l'unité", size: null });
    expect(order.subtotal_minor).toBe(220000);
  });

  it("refuse une taille de pizza, un supplément ou une variante inconnue sur un autre produit, et une variante sur une pizza", async () => {
    const { burger } = await seedOther();
    await saveProduct(sql, { id: burger, name: "Burger", basePrice: "1500", saleUnit: "unit", available: true, visible: true });
    const bad = [item(burger, { size: "S" }), item(burger, { extraIds: [IDS.extra] }), item(burger, { variantId: "99999999-9999-9999-9999-999999999999" }), item(IDS.pizzaA, { size: "S", variantId: "99999999-9999-9999-9999-999999999999" }), item(IDS.pizzaA)];
    for (const b of bad) expect((await priceCart(sql, [b])).lines, JSON.stringify(b)).toEqual([]);
  });
});

describe("administration : configuration et activation", () => {
  it("activation impossible sans prix et unité ; possible dès qu'ils sont renseignés ; vendable sans variantes", async () => {
    const { wings } = await seedOther();
    expect(await setAvailability(sql, wings, true)).toMatchObject({ ok: false, status: 409 });
    await saveProduct(sql, { id: wings, name: "Wings", basePrice: "1800", available: false, visible: true });
    expect(await setAvailability(sql, wings, true)).toMatchObject({ ok: false }); // prix sans unité
    await saveProduct(sql, { id: wings, name: "Wings", basePrice: "1800", saleUnit: "portion", available: false, visible: true });
    expect((await setAvailability(sql, wings, true)).ok).toBe(true);
    expect((await getPublicCatalog(sql)).products.find((p) => p.id === wings)).toMatchObject({ state: "orderable", variants: [], pieces_per_portion: null });
    expect((await saveProduct(sql, { name: "Nouveau", productType: "other", basePrice: "1000", saleUnit: "unit", available: true, visible: true })).ok).toBe(true);
  });

  it("valide prix (strictement positifs), unité, pièces et variantes", async () => {
    const { wings } = await seedOther();
    const base = { id: wings, name: "Wings", available: false, visible: true };
    for (const basePrice of ["0", "-5", "abc", "12.345"]) expect(await saveProduct(sql, { ...base, basePrice }), basePrice).toMatchObject({ ok: false, errors: { basePrice: expect.any(String) } });
    expect(await saveProduct(sql, { ...base, saleUnit: "kilo" })).toMatchObject({ ok: false, errors: { saleUnit: expect.any(String) } });
    expect(await saveProduct(sql, { ...base, saleUnit: "unit", pieces: "6" })).toMatchObject({ ok: false, errors: { pieces: expect.any(String) } }); // pièces : par portion seulement
    expect(await saveProduct(sql, { ...base, saleUnit: "portion", pieces: "0" })).toMatchObject({ ok: false });
    expect(await saveProduct(sql, { ...base, saleUnit: "portion", pieces: "1000" })).toMatchObject({ ok: false });
    expect(await saveProduct(sql, { ...base, variants: [{ label: "A", price: "0" }] })).toMatchObject({ ok: false });
    expect(await saveProduct(sql, { ...base, variants: [{ label: "", price: "10" }] })).toMatchObject({ ok: false });
    expect(await saveProduct(sql, { ...base, variants: [{ label: "A", price: "10" }, { label: "a", price: "12" }] })).toMatchObject({ ok: false });
    expect(await saveProduct(sql, { ...base, variants: [{ label: "", price: "" }] })).toMatchObject({ ok: true }); // ligne vide ignorée
    expect((await sql`select base_price_minor, sale_unit from products where id = ${wings}`)[0]).toMatchObject({ base_price_minor: null, sale_unit: null }); // rien d'inventé
  });

  it("variantes : ajout, mise à jour de prix, retrait ; le type d'un produit existant ne change pas", async () => {
    const { burger } = await seedOther();
    const cfg = { id: burger, name: "Burger", basePrice: "1500", saleUnit: "unit", available: true, visible: true };
    await saveProduct(sql, { ...cfg, variants: [{ label: "Double", price: "2200" }, { label: "Triple", price: "2800" }] });
    const [d] = await sql`select id from product_variants where label = 'Double'`;
    await saveProduct(sql, { ...cfg, variants: [{ label: "Double", price: "2300" }] });
    expect((await sql`select label, price_minor, id from product_variants where product_id = ${burger}`).map((v) => [v.label, v.price_minor, v.id === d.id])).toEqual([["Double", 230000, true]]);
    await saveProduct(sql, { ...cfg, productType: "pizza", sizes: { S: "100" } });
    expect((await sql`select product_type from products where id = ${burger}`)[0].product_type).toBe("other");
    expect((await sql`select count(*)::int as n from product_sizes where product_id = ${burger}`)[0].n).toBe(0);
  });

  it("la liste d'administration expose type, configuration, variantes et visibilité", async () => {
    const { burger } = await seedOther();
    const list = await listAdminProducts(sql, {});
    expect(list.find((p) => p.id === burger)).toMatchObject({ product_type: "other", sale_unit: null, base_price_minor: null, visible: true, variants: [] });
  });
});

describe("migration 7 : Burger + frites et Wings BBQ", () => {
  const mig7 = fs.readFileSync("supabase/migrations/20260107000000_burger_frites_wings_bbq.sql", "utf8");
  const apply = async () => { await sql.unsafe(mig); await sql.unsafe(mig7); };
  const ids = async () => {
    const rows = await sql`select id, name from products where product_type = 'other'`;
    return { burger: rows.find((r) => r.name === "Burger + frites")!.id as string, wings: rows.find((r) => r.name === "Wings BBQ")!.id as string };
  };

  it("configure les deux produits (prix, unité, variantes), idempotente, sans doublon", async () => {
    await apply();
    await sql.unsafe(mig7);
    await sql.unsafe(mig);
    const rows = await sql`select name, sale_unit, base_price_minor, available, default_image, description from products where product_type = 'other' order by name`;
    expect(rows.map((r) => [r.name, r.sale_unit, r.base_price_minor, r.available, r.default_image])).toEqual([
      ["Burger + frites", "unit", 125000, true, "burger-frites"], ["Wings BBQ", "portion", null, true, "wings"],
    ]);
    expect(rows[0].description).toContain("frites");
    expect(rows[0].description.toLowerCase()).not.toMatch(/cheddar|salade|tomate|oignon|cornichon/); // aucun ingrédient déduit de l'image
    expect((await sql`select p.name, v.label, v.price_minor, v.pieces from product_variants v join products p on p.id = v.product_id order by v.position`).map((r) => [r.name, r.label, r.price_minor, r.pieces])).toEqual([
      ["Wings BBQ", "6 pièces", 60000, 6], ["Wings BBQ", "12 pièces", 120000, 12],
    ]);
  });

  it("n'écrase jamais une configuration ou une photo saisies par l'administrateur", async () => {
    await sql.unsafe(mig);
    const { burger } = await seedOther();
    await sql`update products set image_url = 'https://exemple.test/photo.webp' where id = ${burger}`;
    await saveProduct(sql, { id: burger, name: "Burger maison", basePrice: "1000", saleUnit: "unit", available: false, visible: true, description: "Ma description" });
    await sql.unsafe(mig7);
    expect(await sql`select name, description, base_price_minor, available, image_url, default_image from products where id = ${burger}`).toMatchObject([
      { name: "Burger maison", description: "Ma description", base_price_minor: 100000, available: false, image_url: "https://exemple.test/photo.webp", default_image: "burger-frites" },
    ]);
  });

  it("catalogue : « À partir de 600 HTG », sans prix de base ; portion obligatoire côté serveur", async () => {
    await apply();
    const { burger, wings } = await ids();
    const cat = await getPublicCatalog(sql);
    const w = cat.products.find((p) => p.id === wings)!;
    expect(w).toMatchObject({ state: "orderable", base_price_minor: null });
    expect(w.variants.map((v) => [v.label, v.price_minor, v.pieces])).toEqual([["6 pièces", 60000, 6], ["12 pièces", 120000, 12]]);
    expect(cat.products.find((p) => p.id === burger)).toMatchObject({ state: "orderable", base_price_minor: 125000, variants: [] });
    const r = await priceCart(sql, [item(wings)]);
    expect(r.lines).toHaveLength(0);
    expect(r.problems[0].reason).toBe("variant_required");
    expect((await priceCart(sql, [item(wings, { variantId: crypto.randomUUID() })])).problems[0].reason).toBe("variant_unavailable");
    expect((await priceCart(sql, [item(wings, { size: "S" })])).problems[0].reason).toBe("size_unavailable");
  });

  it("prix par portion, quantités et lignes distinctes pour 6 et 12 pièces", async () => {
    await apply();
    const { burger, wings } = await ids();
    const v = Object.fromEntries((await sql`select id, pieces from product_variants`).map((r) => [r.pieces, r.id as string]));
    const r = await priceCart(sql, [item(burger, { quantity: 2 }), item(wings, { variantId: v[6], quantity: 2 }), item(wings, { variantId: v[12] })]);
    expect(r.problems).toHaveLength(0);
    expect(r.lines.map((l) => [l.productName, l.optionLabel, l.quantity, l.lineTotalMinor])).toEqual([
      ["Burger + frites", null, 2, 250000], ["Wings BBQ", "portion de 6 pièces", 2, 120000], ["Wings BBQ", "portion de 12 pièces", 1, 120000],
    ]);
    expect(r.subtotalMinor).toBe(490000);
  });

  it("commande mixte pizza / burger / wings : montants serveur, instantané conservé, message WhatsApp, anciennes commandes inchangées", async () => {
    await apply();
    const { burger, wings } = await ids();
    const v = Object.fromEntries((await sql`select id, pieces from product_variants`).map((r) => [r.pieces, r.id as string]));
    const created = await createOrder(sql, checkout({ deliveryMode: "quote", zoneId: undefined, items: [
      { productId: IDS.pizzaA, size: "S", quantity: 1, extraIds: [] }, { productId: burger, quantity: 2, extraIds: [] },
      { productId: wings, variantId: v[6], quantity: 2, extraIds: [] }, { productId: wings, variantId: v[12], quantity: 1, extraIds: [] },
    ] }));
    if (!created.ok) throw new Error(created.message);
    const token = created.token;
    const before = await sql`select product_name, option_label, unit_price_minor, quantity from order_items order by product_name, option_label`;
    // le catalogue change ensuite : la commande garde ses prix et son option
    await sql`update products set base_price_minor = 999900 where id = ${burger}`;
    await sql`update product_variants set price_minor = 1 where pieces = 6`;
    const { order, items } = (await getOrderByToken(sql, token))!;
    expect(await sql`select product_name, option_label, unit_price_minor, quantity from order_items order by product_name, option_label`).toEqual(before);
    expect(order.subtotal_minor).toBe(100000 + 250000 + 120000 + 120000);
    const msg = buildOrderMessage(order, items);
    expect(msg).toContain("• 2 × Burger + frites — 2 500 HTG");
    expect(msg).toContain("• 2 × Wings BBQ — portion de 6 pièces — 1 200 HTG");
    expect(msg).toContain("• 1 × Wings BBQ — portion de 12 pièces — 1 200 HTG");
    expect(msg).toContain("• 1 × Pizza A — taille S — 1 000 HTG");
  });
});

describe("administration : variantes avec nombre de pièces, sans prix de base", () => {
  it("activable avec des variantes tarifées seules ; pièces de variante refusées hors portion", async () => {
    const { wings } = await seedOther();
    const base = { id: wings, name: "Wings BBQ", saleUnit: "portion", available: true, visible: true, variants: [{ label: "6 pièces", price: "600", pieces: "6" }, { label: "12 pièces", price: "1 200", pieces: "12" }] };
    expect(await saveProduct(sql, base)).toMatchObject({ ok: true });
    expect(await sql`select base_price_minor, available from products where id = ${wings}`).toMatchObject([{ base_price_minor: null, available: true }]);
    expect((await sql`select label, pieces from product_variants where product_id = ${wings} order by position`).map((r) => [r.label, r.pieces])).toEqual([["6 pièces", 6], ["12 pièces", 12]]);
    expect(await saveProduct(sql, { ...base, saleUnit: "unit" })).toMatchObject({ ok: false });
    expect(await saveProduct(sql, { ...base, variants: [{ label: "6 pièces", price: "600", pieces: "0" }] })).toMatchObject({ ok: false });
    expect(await saveProduct(sql, { ...base, variants: [] })).toMatchObject({ ok: false }); // plus aucun prix : activation refusée
  });
});

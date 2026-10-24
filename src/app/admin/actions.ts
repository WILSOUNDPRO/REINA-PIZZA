"use server";

import { redirect } from "next/navigation";
import { createHash } from "node:crypto";
import { getSql } from "@/server/db";
import { requireAdmin, passwordLogin, setSessionCookies, clearSession } from "@/server/admin/auth";
import { uploadMenuImage } from "@/server/admin/storage";
import { setDeliveryFee, setManualPaymentStatus, setOrderStatus } from "@/server/orders";
import { deleteProduct } from "@/server/menu";
import { allow, clientKey } from "@/server/ratelimit";
import { bool, int, money, str } from "@/server/admin/money-input";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/labels";
import { CURRENCIES, SIZES } from "@/lib/constants";
import { normalizePhone } from "@/lib/phone";
import { log } from "@/server/logger";

function back(path: string, msg: string, ok = true): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${ok ? "ok" : "err"}=${encodeURIComponent(msg)}`);
}
const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

// ───────────── Session ─────────────
export async function loginAction(formData: FormData) {
  const sql = getSql();
  const email = str(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const emailHash = createHash("sha256").update(email).digest("hex").slice(0, 16);
  const ip = await clientKey();
  if (!(await allow(sql, `login:${ip}`, 20, 900)) || !(await allow(sql, `login-e:${emailHash}`, 8, 900))) {
    redirect("/admin/login?err=" + encodeURIComponent("Trop de tentatives. Réessayez dans quelques minutes."));
  }
  const generic = "Identifiants invalides ou accès non autorisé.";
  const tokens = email && password ? await passwordLogin(email, password) : null;
  if (!tokens) redirect("/admin/login?err=" + encodeURIComponent(generic));
  // Même compte valide : l'accès exige d'être listé dans admin_users.
  const [row] = await sql`select 1 from admin_users where email = ${email}`;
  if (!row) {
    log("admin.login_denied");
    redirect("/admin/login?err=" + encodeURIComponent(generic));
  }
  await setSessionCookies(tokens);
  log("admin.login");
  redirect("/admin");
}

export async function logoutAction() {
  await clearSession();
  redirect("/admin/login");
}

// ───────────── Commandes ─────────────
export async function updateStatusAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = str(formData, "orderId");
  const to = str(formData, "status") as OrderStatus;
  const path = `/admin/commandes/${id}`;
  if (!isUuid(id) || !ORDER_STATUSES.includes(to)) back(path, "Requête invalide.", false);
  const r = await setOrderStatus(getSql(), id, to, admin.email);
  back(path, r.ok ? "Statut mis à jour." : r.message, r.ok);
}

export async function setFeeAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = str(formData, "orderId");
  const path = `/admin/commandes/${id}`;
  const fee = money(formData, "fee");
  if (!isUuid(id) || fee === null) back(path, "Montant invalide (ex. 250 ou 250,50).", false);
  const r = await setDeliveryFee(getSql(), id, fee, admin.email);
  back(path, r.ok ? "Frais enregistrés. Communiquez le total au client." : r.message, r.ok);
}

export async function setPaymentStatusAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = str(formData, "orderId");
  const to = str(formData, "status");
  const path = `/admin/commandes/${id}`;
  if (!isUuid(id) || !to) back(path, "Choisissez un statut de paiement.", false);
  // Confirmer un paiement exige une case cochée explicitement par l'administrateur connecté.
  if (to === "confirmed_manually" && !bool(formData, "confirmReceived")) back(path, "Cochez la case de confirmation : le paiement doit avoir été réellement reçu.", false);
  const r = await setManualPaymentStatus(getSql(), id, to, admin.email);
  back(path, r.ok ? "Statut de paiement mis à jour." : r.message, r.ok);
}

// ───────────── Menu ─────────────
export async function saveCategoryAction(formData: FormData) {
  await requireAdmin();
  const sql = getSql();
  const id = str(formData, "id");
  const name = str(formData, "name");
  if (!name || name.length > 80) back("/admin/menu", "Nom de catégorie invalide.", false);
  if (id && isUuid(id)) {
    await sql`update categories set name = ${name}, position = ${int(formData, "position")}, active = ${bool(formData, "active")} where id = ${id}`;
  } else {
    await sql`insert into categories (name, position) values (${name}, ${int(formData, "position")})`;
  }
  back("/admin/menu", "Catégorie enregistrée.");
}

export async function deleteCategoryAction(formData: FormData) {
  await requireAdmin();
  const id = str(formData, "id");
  if (isUuid(id)) await getSql()`delete from categories where id = ${id}`;
  back("/admin/menu", "Catégorie supprimée (ses produits restent sans catégorie).");
}

export async function saveProductAction(formData: FormData) {
  await requireAdmin();
  const sql = getSql();
  const id = str(formData, "id");
  const editing = isUuid(id);
  const path = editing ? `/admin/menu/${id}` : "/admin/menu/nouveau";
  const name = str(formData, "name");
  const description = str(formData, "description");
  const categoryId = str(formData, "categoryId");
  if (!name || name.length > 120) back(path, "Le nom est obligatoire (120 caractères max).", false);
  if (description.length > 1000) back(path, "Description trop longue (1000 caractères max).", false);

  const sizes: { size: string; price: number }[] = [];
  const offered: string[] = [];
  for (const s of SIZES) {
    if (!bool(formData, `size_${s}_on`)) continue;
    const price = money(formData, `size_${s}_price`);
    if (price === null || price <= 0) back(path, `Prix invalide pour la taille ${s} (strictement supérieur à 0).`, false);
    sizes.push({ size: s, price });
    offered.push(s);
  }
  if (bool(formData, "available") && sizes.length === 0) back(path, "Un produit disponible doit avoir au moins une taille avec un prix.", false);

  let imageUrl: string | null | undefined;
  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    const up = await uploadMenuImage(file);
    if (!up.ok) back(path, up.message, false);
    imageUrl = up.url;
  } else if (bool(formData, "removeImage")) {
    imageUrl = null;
  }

  const cat = isUuid(categoryId) ? categoryId : null;
  const productId = await sql.begin(async (tx) => {
    let pid = id;
    if (editing) {
      await tx`update products set name = ${name}, description = ${description}, category_id = ${cat}, available = ${bool(formData, "available")},
        position = ${int(formData, "position")}, is_demo = ${bool(formData, "isDemo")} ${imageUrl !== undefined ? tx`, image_url = ${imageUrl}` : tx``} where id = ${id}`;
    } else {
      const [p] = await tx<{ id: string }[]>`insert into products (name, description, category_id, available, position, is_demo, image_url)
        values (${name}, ${description}, ${cat}, ${bool(formData, "available")}, ${int(formData, "position")}, ${bool(formData, "isDemo")}, ${imageUrl ?? null}) returning id`;
      pid = p.id;
    }
    for (const s of sizes) {
      await tx`insert into product_sizes (product_id, size, price_minor, available) values (${pid}, ${s.size}, ${s.price}, true)
        on conflict (product_id, size) do update set price_minor = excluded.price_minor, available = true`;
    }
    // Les tailles décochées ne sont plus proposées (le prix est conservé si on les réactive).
    await tx`update product_sizes set available = false where product_id = ${pid} ${offered.length ? tx`and size not in ${tx(offered)}` : tx``}`;
    return pid;
  });
  back(`/admin/menu/${productId}`, "Produit enregistré.");
}

export async function deleteProductAction(formData: FormData) {
  await requireAdmin();
  const id = str(formData, "id");
  const r = isUuid(id) ? await deleteProduct(getSql(), id) : { ok: false as const, message: "Requête invalide." };
  back("/admin/menu", r.ok ? "Produit supprimé. Les anciennes commandes ne changent pas." : r.message, r.ok);
}

export async function deleteDemoDataAction() {
  await requireAdmin();
  const sql = getSql();
  await sql.begin(async (tx) => {
    await tx`delete from products where is_demo`;
    await tx`delete from extras where is_demo`;
    await tx`delete from delivery_zones where is_demo`;
  });
  back("/admin/menu", "Données de démonstration supprimées.");
}

export async function saveExtraAction(formData: FormData) {
  await requireAdmin();
  const sql = getSql();
  const id = str(formData, "id");
  const name = str(formData, "name");
  const price = money(formData, "price");
  if (!name || name.length > 80 || price === null) back("/admin/supplements", "Nom et prix valides requis.", false);
  if (isUuid(id)) {
    await sql`update extras set name = ${name}, price_minor = ${price}, available = ${bool(formData, "available")}, is_demo = ${bool(formData, "isDemo")} where id = ${id}`;
  } else {
    await sql`insert into extras (name, price_minor, is_demo) values (${name}, ${price}, ${bool(formData, "isDemo")})`;
  }
  back("/admin/supplements", "Supplément enregistré.");
}

export async function deleteExtraAction(formData: FormData) {
  await requireAdmin();
  const id = str(formData, "id");
  if (isUuid(id)) await getSql()`delete from extras where id = ${id}`;
  back("/admin/supplements", "Supplément supprimé.");
}

// ───────────── Zones de livraison ─────────────
export async function saveZoneAction(formData: FormData) {
  await requireAdmin();
  const sql = getSql();
  const id = str(formData, "id");
  const name = str(formData, "name");
  const commune = str(formData, "commune") || null;
  const fee = money(formData, "fee");
  if (!name || name.length > 120 || fee === null) back("/admin/zones", "Nom et tarif valides requis.", false);
  if (isUuid(id)) {
    await sql`update delivery_zones set name = ${name}, commune = ${commune}, fee_minor = ${fee}, active = ${bool(formData, "active")}, is_demo = ${bool(formData, "isDemo")} where id = ${id}`;
  } else {
    await sql`insert into delivery_zones (name, commune, fee_minor, is_demo) values (${name}, ${commune}, ${fee}, ${bool(formData, "isDemo")})`;
  }
  back("/admin/zones", "Zone enregistrée. Les commandes déjà passées gardent leur tarif.");
}

export async function deleteZoneAction(formData: FormData) {
  await requireAdmin();
  const id = str(formData, "id");
  if (isUuid(id)) await getSql()`delete from delivery_zones where id = ${id}`;
  back("/admin/zones", "Zone supprimée.");
}

// ───────────── Moyens de paiement proposés aux clients ─────────────
export async function saveMethodAction(formData: FormData) {
  await requireAdmin();
  const sql = getSql();
  const id = str(formData, "id");
  const label = str(formData, "label");
  const path = "/admin/reglages";
  if (!label || label.length > 80) back(path, "Libellé invalide (80 caractères max).", false);
  const enabled = isUuid(id) ? bool(formData, "enabled") : true;
  try {
    if (isUuid(id)) {
      if (!enabled) {
        const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from payment_methods where enabled and id <> ${id}`;
        if (n === 0) back(path, "Au moins un moyen de paiement doit rester activé.", false);
      }
      await sql`update payment_methods set label = ${label}, enabled = ${enabled}, position = ${int(formData, "position")} where id = ${id}`;
    } else {
      await sql`insert into payment_methods (label, position) values (${label}, ${int(formData, "position", 10)})`;
    }
  } catch (e) {
    if ((e as { code?: string }).code === "23505") back(path, "Ce moyen de paiement existe déjà.", false);
    throw e;
  }
  back(path, "Moyen de paiement enregistré.");
}

export async function deleteMethodAction(formData: FormData) {
  await requireAdmin();
  const sql = getSql();
  const id = str(formData, "id");
  if (isUuid(id)) {
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from payment_methods where enabled and id <> ${id}`;
    if (n === 0) back("/admin/reglages", "Au moins un moyen de paiement doit rester activé.", false);
    await sql`delete from payment_methods where id = ${id}`; // les commandes gardent le libellé choisi
  }
  back("/admin/reglages", "Moyen de paiement supprimé.");
}

// ───────────── Réglages ─────────────
export async function saveSettingsAction(formData: FormData) {
  await requireAdmin();
  const sql = getSql();
  const path = "/admin/reglages";
  const wa = str(formData, "whatsapp").replace(/\D/g, "");
  const phone = str(formData, "phone");
  const currency = str(formData, "currency");
  if (!str(formData, "name") || !str(formData, "address") || !phone) back(path, "Nom, adresse et téléphone sont obligatoires.", false);
  if (!/^\d{8,15}$/.test(wa)) back(path, "Numéro WhatsApp invalide (chiffres avec indicatif, ex. 50946461212).", false);
  if (phone && !normalizePhone(phone)) back(path, "Téléphone invalide.", false);
  if (currency && !(CURRENCIES as readonly string[]).includes(currency)) back(path, "Devise invalide.", false);

  const [cur] = await sql<{ currency: string | null }[]>`select currency from settings where id = 1`;
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from orders`;
  const newCur = currency || null;
  if (cur.currency && newCur !== cur.currency && n > 0 && !bool(formData, "confirmCurrency")) {
    back(path, "Changer la devise alors que des commandes existent exige de cocher la confirmation : les prix du menu ne sont pas convertis.", false);
  }
  await sql`update settings set restaurant_name = ${str(formData, "name")}, address = ${str(formData, "address")}, phone = ${phone},
    whatsapp_number = ${wa}, hours_text = ${str(formData, "hours") || "Ouvert 24 h/24, 7 j/7"}, currency = ${newCur},
    orders_paused = ${bool(formData, "paused")}, pause_message = ${str(formData, "pauseMessage") || null} where id = 1`;
  log("admin.settings_saved");
  back(path, "Réglages enregistrés.");
}

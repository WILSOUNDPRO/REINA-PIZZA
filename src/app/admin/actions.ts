"use server";

import { redirect } from "next/navigation";
import { createHash } from "node:crypto";
import { getSql } from "@/server/db";
import { requireAdmin, passwordLogin, setSessionCookies, clearSession } from "@/server/admin/auth";
import { uploadMenuImage } from "@/server/admin/storage";
import { setDeliveryFee, setManualPaymentStatus, setOrderStatus } from "@/server/orders";
import { deleteProduct, saveProduct } from "@/server/menu";
import { deleteMethod, saveMethod } from "@/server/paymentMethods";
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
  const id = str(formData, "id");
  const editing = isUuid(id);
  const path = editing ? `/admin/menu/${id}` : "/admin/menu/nouveau";

  let imageUrl: string | null | undefined;
  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    const up = await uploadMenuImage(file);
    if (!up.ok) back(path, up.message, false);
    imageUrl = up.url;
  } else if (bool(formData, "removeImage")) {
    imageUrl = null;
  }

  const variants = Array.from({ length: 8 }, (_, k) => ({ label: str(formData, `variant_${k}_label`), price: str(formData, `variant_${k}_price`) }));
  const r = await saveProduct(getSql(), {
    id: editing ? id : undefined,
    name: str(formData, "name"),
    description: str(formData, "description"),
    ingredients: String(formData.get("ingredients") ?? ""),
    categoryId: str(formData, "categoryId"),
    productType: str(formData, "productType") === "other" ? "other" : "pizza",
    position: int(formData, "position"),
    available: bool(formData, "available"),
    visible: formData.has("visibleField") ? bool(formData, "visible") : true,
    isDemo: bool(formData, "isDemo"),
    imageUrl,
    sizes: Object.fromEntries(SIZES.map((s) => [s, bool(formData, `size_${s}_on`) ? str(formData, `size_${s}_price`) : ""])),
    basePrice: str(formData, "basePrice"),
    saleUnit: str(formData, "saleUnit"),
    pieces: str(formData, "pieces"),
    variants,
  });
  if (!r.ok) back(path, r.message, false);
  back(`/admin/menu/${r.data!.id}`, "Produit enregistré.");
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

// ───────────── Moyens de paiement (le paiement reste organisé hors site) ─────────────
export async function saveMethodAction(formData: FormData) {
  await requireAdmin();
  const id = str(formData, "id");
  const r = await saveMethod(getSql(), {
    id: isUuid(id) ? id : undefined,
    label: str(formData, "label"),
    instructions: String(formData.get("instructions") ?? ""),
    recipientAccount: str(formData, "recipientAccount"),
    recipientName: str(formData, "recipientName"),
    position: int(formData, "position", 10),
    enabled: isUuid(id) ? bool(formData, "enabled") : true,
  });
  back("/admin/moyens-paiement", r.ok ? "Moyen de paiement enregistré." : r.message, r.ok);
}

export async function deleteMethodAction(formData: FormData) {
  await requireAdmin();
  const id = str(formData, "id");
  const r = isUuid(id) ? await deleteMethod(getSql(), id) : ({ ok: false, message: "Requête invalide." } as const);
  back("/admin/moyens-paiement", r.ok ? "Moyen de paiement supprimé. Les commandes gardent leur choix." : r.message, r.ok);
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

// Parcours de bout en bout dans un navigateur mobile (Chromium). Prérequis : base migrée, mock Supabase (npm run mock:supabase),
// application lancée (npm run dev) avec .env.local, compte admin@reina.test dans admin_users. Usage : npm run test:e2e
const { chromium } = require("playwright");
const { execFileSync } = require("node:child_process");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DB = process.env.DATABASE_URL ?? "postgres://reina:reina@localhost:5432/reina";
const SHOTS = process.env.SHOTS ?? ".tmp/shots";
const psql = (q) => execFileSync("psql", [DB, "-Atc", q]).toString().trim();
let failures = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "✔" : "✘"} ${name}${ok ? "" : "  " + extra}`); if (!ok) failures++; };
const noScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const norm = (s) => s.replace(/[  ]/g, " ");

async function fillCustomer(page, over = {}) {
  const v = { fullName: "Marie Test", phone: "3412-3456", commune: "Delmas", quarter: "Delmas 33", address: "Rue Charbonnier, impasse Costo, n° 12", landmark: "En face de la pharmacie", ...over };
  for (const [k, val] of Object.entries(v)) await page.fill(`#f-${k}`, val);
}
async function addPizza(page, name = "Pizza pepperoni", qty = 1) {
  await page.goto(BASE + "/menu"); await page.waitForLoadState("networkidle");
  const qtyIn = () => page.evaluate(() => JSON.parse(localStorage.getItem("reina-cart-v1") ?? "[]").reduce((t, i) => t + i.quantity, 0));
  const before = await qtyIn();
  const card = page.locator("article", { hasText: name });
  for (let i = 1; i < qty; i++) await card.getByRole("button", { name: "Ajouter une pizza" }).click();
  await card.getByRole("button", { name: /Ajouter au panier/ }).click();
  await page.getByText("Ajouté", { exact: true }).first().waitFor();
  await page.waitForFunction((n) => JSON.parse(localStorage.getItem("reina-cart-v1") ?? "[]").reduce((t, i) => t + i.quantity, 0) >= n, before + qty, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(150);
}
async function submitOrder(page) {
  await page.getByRole("button", { name: "Enregistrer ma commande" }).dblclick({ noWaitAfter: true });
  await page.waitForURL(/\/commande\/[\w-]{43}$/);
  await page.waitForLoadState("networkidle");
}
async function adminAction(ap, buttonName, urlPart, exact = false) {
  await Promise.all([ap.waitForResponse((r) => r.request().method() === "POST" && r.url().includes(urlPart)), ap.getByRole("button", { name: buttonName, exact }).click()]);
  await ap.waitForLoadState("networkidle");
}

(async () => {
  psql("update settings set orders_paused = false, currency = 'HTG'");
  psql("delete from delivery_zones where name = 'Zone test e2e'");
  // État de départ du catalogue réel (reprise après un test interrompu) : seules les tailles S sont tarifées.
  psql("delete from products where name = 'Test photo e2e'");
  psql("delete from product_sizes where size <> 'S' and product_id in (select id from products where name like 'Pizza %')");
  psql("update products set available = true, archived_at = null, image_url = null where name like 'Pizza %'");
  psql("update payment_methods set enabled = true, instructions = null, recipient_account = null, recipient_name = null, label = 'MonCash' where label like 'MonCash%'");
  psql("delete from payment_methods where label = 'Test e2e'");
  // État de la migration 6 (avant mise à jour des prix) : non configurés, noms d'origine ; la migration 7 est rejouée dans le scénario.
  const resetOther = () => { psql("update products set name = case when default_image = 'wings' then 'Wings' else 'Burger' end, description = '', base_price_minor = null, sale_unit = null, pieces_per_portion = null, available = false, visible = true, image_url = null where product_type = 'other'"); psql("delete from product_variants"); };
  resetOther();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });

  // 1. Catalogue réel
  await page.goto(BASE + "/"); await page.waitForLoadState("networkidle"); await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/01-home.png`, fullPage: true, caret: "initial" });
  check("accueil : pas de défilement horizontal", await noScroll(page));
  check("accueil mobile : visuel principal pepperoni visible, produits accessibles sans long défilement", (await page.locator("section img[alt^='Pizza pepperoni']").first().isVisible()) && (await page.getByRole("heading", { name: "Nos pizzas" }).evaluate((h) => h.getBoundingClientRect().top)) < 1200);
  await page.goto(BASE + "/menu"); await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${SHOTS}/02-menu.png`, fullPage: true, caret: "initial" });
  const menu = norm(await page.locator("main").innerText());
  check("menu : 3 produits réels aux bons prix", menu.includes("Pizza pepperoni") && menu.includes("1 500 HTG") && menu.includes("Pizza jambon") && menu.includes("1 250 HTG") && menu.includes("Pizza hareng saur") && menu.includes("1 800 HTG"));
  check("menu : plus aucune donnée de démonstration", !/démo/i.test(menu));
  const pep = page.locator("article", { hasText: "Pizza pepperoni" });
  check("menu : tailles M à XXL désactivées « Prix à venir »", (await pep.locator("[aria-disabled=true]").count()) === 4 && (await pep.getByRole("radio").count()) === 1);
  for (const [name, slug] of [["Pizza pepperoni", "pepperoni"], ["Pizza jambon", "jambon"], ["Pizza hareng saur", "hareng-saur"]]) {
    const card = page.locator("article", { hasText: name });
    await card.scrollIntoViewIfNeeded();
    await card.locator("img").first().evaluate((i) => i.decode().catch(() => {}));
    const info = await card.locator("img").first().evaluate((i) => ({ src: i.currentSrc, set: i.srcset, w: i.getAttribute("width"), h: i.getAttribute("height"), nat: [i.naturalWidth, i.naturalHeight], box: i.parentElement.getBoundingClientRect().width / i.parentElement.getBoundingClientRect().height, fit: getComputedStyle(i).objectFit, alt: i.alt }));
    check(`menu : ${name} → ${slug}-*.webp, srcset 480/800/1200, 4:3, object-cover, dimensions réservées`, info.src.includes(`/images/pizzas/${slug}-`) && info.src.endsWith(".webp") && /480w.*800w.*1200w/.test(info.set) && Math.abs(info.box - 4 / 3) < 0.02 && info.fit === "cover" && info.w === "1200" && info.h === "900" && info.nat[0] > 0 && info.alt.includes(name), JSON.stringify(info));
    check(`menu : ${name} affiche discrètement « Photo d'illustration »`, (await card.getByText("Photo d'illustration", { exact: true }).count()) === 1);
  }
  check("menu : plus aucun bloc « photo à venir »", (await page.locator("article div[role=img]").count()) === 0);
  check("menu : pas de défilement horizontal", await noScroll(page));

  // 2. Panier
  await addPizza(page, "Pizza pepperoni", 2);
  await page.getByText("2 articles").first().waitFor({ timeout: 8000 });
  check("barre de panier mobile : articles et sous-total serveur", await page.locator("a[href='/panier']", { hasText: "3 000 HTG" }).waitFor({ timeout: 8000 }).then(() => true, () => false));
  check("panier vide : aucun badge « 0 » sur l'icône", await (async () => { const c2 = await browser.newContext({ viewport: { width: 390, height: 844 } }); const p2 = await c2.newPage(); await p2.goto(BASE + "/menu"); await p2.waitForLoadState("networkidle"); const t = (await p2.getByRole("link", { name: /Panier/ }).first().innerText()); const bar = await p2.getByText(/\d+ articles?/).count(); await c2.close(); return !/\b0\b/.test(t) && bar === 0; })());
  await page.goto(BASE + "/panier"); await page.getByText("Sous-total des produits").first().waitFor();
  check("panier : 2 × 1 500 HTG = 3 000 HTG", norm(await page.locator("main").innerText()).includes("3 000 HTG"));
  await page.screenshot({ path: `${SHOTS}/03-cart.png`, fullPage: true, caret: "initial" });
  check("panier : miniature = illustration du pepperoni", (await page.locator("article img").first().getAttribute("src")).includes("/images/pizzas/pepperoni-"));

  // 3. Formulaire sans zone tarifée : frais à confirmer, sous-total non présenté comme total
  await page.getByRole("link", { name: "Renseigner ma livraison" }).click();
  await page.waitForURL("**/commander");
  await page.getByRole("button", { name: "Enregistrer ma commande" }).waitFor();
  const form = norm(await page.locator("main").innerText());
  check("formulaire : message frais à confirmer", form.includes("Frais de livraison à confirmer selon votre adresse."));
  check("formulaire : sous-total sans ligne « Total »", form.includes("Sous-total des produits") && !/^Total\b/m.test(form));
  check("formulaire : « Le paiement sera organisé directement avec Reina Pizza après confirmation de la commande. »", form.includes("Aucun paiement n'est effectué sur le site. Le paiement sera organisé directement avec Reina Pizza après confirmation de la commande."));
  check("formulaire : aucun champ carte/PIN/mot de passe", (await page.locator("input[type=password], input[autocomplete^=cc-], input[name*=card i], input[name*=pin i]").count()) === 0);
  check("formulaire : seuls les moyens activés sont proposés — MonCash disponible, ordre respecté", (await page.locator("#f-paymentMethodId option:not([disabled])").allInnerTexts()).join("|") === "À convenir avec la pizzeria|MonCash");
  await page.getByRole("button", { name: "Enregistrer ma commande" }).click();
  check("validation : champs obligatoires signalés, dont le moyen de paiement souhaité", (await page.getByText("Le nom complet est obligatoire.").isVisible()) && (await page.getByText("L'adresse précise est obligatoire.").isVisible()) && (await page.getByText("Choisissez le moyen de paiement souhaité.").count()) > 0);
  await page.screenshot({ path: `${SHOTS}/04-checkout-errors.png`, fullPage: true, caret: "initial" });
  await fillCustomer(page, { phone: "12" });
  await page.getByRole("button", { name: "Enregistrer ma commande" }).click();
  check("validation : téléphone invalide", await page.getByText(/Le numéro de téléphone invalide/).isVisible());
  await fillCustomer(page);
  await page.selectOption("#f-paymentMethodId", { label: "MonCash" });
  await page.fill("#f-paymentMethodNote", "depuis mon numéro MonCash");
  await page.fill("#f-deliveryInstructions", "Sonner deux fois");
  await page.fill("#f-notes", "Sans olives");
  await page.fill("#f-gps", "18.5392, -72.3350");
  await page.fill("#f-whatsapp", "3700-1122");
  await page.screenshot({ path: `${SHOTS}/05-checkout-filled.png`, fullPage: true, caret: "initial" });

  // Erreur serveur : les champs sont conservés
  psql("update settings set orders_paused = true, pause_message = 'Pause test'");
  await page.getByRole("button", { name: "Enregistrer ma commande" }).click();
  await page.getByText("Pause test").first().waitFor();
  check("erreur serveur : message affiché et champs conservés", (await page.inputValue("#f-fullName")) === "Marie Test" && (await page.inputValue("#f-notes")) === "Sans olives" && (await page.inputValue("#f-paymentMethodNote")) === "depuis mon numéro MonCash");
  psql("update settings set orders_paused = false, pause_message = null");

  // 4. Enregistrement + double clic
  const before = Number(psql("select count(*) from orders"));
  await submitOrder(page);
  const orderUrl = page.url();
  check("double clic : une seule commande créée", Number(psql("select count(*) from orders")) === before + 1);
  const body = norm(await page.locator("main").innerText());
  const ref = body.match(/RP-[A-Z0-9]{6}/)[0];
  check("confirmation : « Commande enregistrée » + référence réelle", body.includes("Commande enregistrée") && !!ref);
  check("confirmation : sous-titre « En attente de confirmation », sans prétendre confirmer paiement ni disponibilité", body.includes("En attente de confirmation") && body.includes("L'enregistrement ne confirme ni la disponibilité ni le paiement"));
  check("confirmation : sous-total, livraison à confirmer, pas de total", body.includes("3 000 HTG") && body.includes("À confirmer") && !/^Total\b/m.test(body));
  check("confirmation : ni « reçu de paiement » ni « payée », aucun bouton payer", !/reçu de paiement/i.test(body.replace("n'est pas un reçu de paiement", "")) && !/Payée|Payé le/.test(body) && (await page.getByRole("button", { name: /Payer/ }).count()) === 0);
  check("confirmation : paiement « À organiser avec la pizzeria »", body.includes("À organiser avec la pizzeria"));
  await page.screenshot({ path: `${SHOTS}/06-order.png`, fullPage: true, caret: "initial" });
  check("confirmation : pas de défilement horizontal", await noScroll(page));

  // 5. Bouton WhatsApp : message complet, encodé, sans jeton
  const waBtn = page.getByRole("link", { name: "Confirmer sur WhatsApp" });
  const wa = await waBtn.getAttribute("href");
  check("WhatsApp : destination wa.me/50946461212", wa.startsWith("https://wa.me/50946461212?text="));
  const msg = decodeURIComponent(wa.split("?text=")[1]);
  const token = orderUrl.split("/").pop();
  for (const part of [
    `Bonjour Reina Pizza 🍕\nJe souhaite confirmer ma commande n° ${ref}.`, "COMMANDE", "• 2 × Pizza pepperoni — taille S — 3 000 HTG",
    "Sous-total : 3 000 HTG", "Livraison : À confirmer selon mon adresse", "LIVRAISON", "Nom : Marie Test", "Téléphone : +509 3412-3456",
    "WhatsApp : +509 3700-1122", "Commune : Delmas", "Quartier : Delmas 33", "Adresse : Rue Charbonnier, impasse Costo, n° 12", "Point de repère : En face de la pharmacie",
    "Localisation : 18.5392, -72.335", "Instructions : Sonner deux fois", "PAIEMENT", "Moyen souhaité : MonCash — depuis mon numéro MonCash",
    "Paiement à organiser directement avec la pizzeria.", "Remarques : Sans olives", "Merci de confirmer la disponibilité, les frais de livraison s'ils restent à définir et le délai estimé."]) {
    check(`WhatsApp message contient « ${part.split("\n")[0].slice(0, 45)} »`, norm(msg).includes(part), norm(msg));
  }
  check("WhatsApp : pas de ligne Total, pas de jeton, pas de lien de commande", !/^Total :/m.test(msg) && !msg.includes(token) && !wa.includes(token) && !msg.includes("/commande/"));
  check("avertissement données personnelles affiché", body.includes("Le message WhatsApp contiendra votre commande et vos coordonnées de livraison pour Reina Pizza."));
  check("lien d'appel tel:", ((await page.getByRole("link", { name: /Appeler Reina Pizza/ }).getAttribute("href")) ?? "").startsWith("tel:+509"));
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  await page.getByRole("button", { name: "Copier le message" }).click();
  await page.getByRole("button", { name: "Message copié" }).waitFor();
  check("« Copier le message » : contenu identique", (await page.evaluate(() => navigator.clipboard.readText())) === msg);
  const popup = await Promise.race([ctx.waitForEvent("page", { timeout: 4000 }).catch(() => null), waBtn.click().then(() => null)]);
  check("le bouton ouvre un brouillon sans rien envoyer (lien externe)", (await waBtn.getAttribute("target")) === "_blank");
  if (popup) await popup.close();

  // 6. Protections
  const anon = await browser.newContext();
  const ap = await anon.newPage();
  check("référence seule : 404", (await ap.goto(`${BASE}/commande/${ref}`)).status() === 404);
  check("jeton inconnu : 404", (await ap.goto(`${BASE}/commande/${"A".repeat(43)}`)).status() === 404);
  const r1 = await ap.goto(orderUrl);
  check("lien secret : 200, no-store, noindex", r1.status() === 200 && /no-store/.test(r1.headers()["cache-control"] ?? "") && /noindex/.test(r1.headers()["x-robots-tag"] ?? ""));
  for (const path of ["/admin", "/admin/commandes", "/admin/menu", "/admin/zones", "/admin/reglages"]) { await ap.goto(BASE + path); check(`admin ${path} protégé`, ap.url().endsWith("/admin/login")); }
  check("API admin sans session : 401", (await fetch(`${BASE}/api/admin/poll`)).status === 401);
  check("paiement en ligne désactivé : webhook et routes de paiement introuvables", (await fetch(`${BASE}/api/webhooks/payments/simulation`, { method: "POST", body: "{}" })).status === 404 && (await fetch(`${BASE}/api/orders/${token}/pay`, { method: "POST" })).status === 404);

  // 7. Connexion admin
  await ap.goto(`${BASE}/admin/login`);
  await ap.fill("#email", "intrus@reina.test"); await ap.fill("#password", "mot-de-passe-test");
  await ap.getByRole("button", { name: "Se connecter" }).click();
  const denied = await ap.getByText("Identifiants invalides").waitFor({ timeout: 15000 }).then(() => true, () => false);
  check("compte valide hors admin_users : refusé", denied && ap.url().includes("/admin/login"));
  await ap.fill("#email", "admin@reina.test"); await ap.fill("#password", "mot-de-passe-test");
  await ap.getByRole("button", { name: "Se connecter" }).click();
  await ap.waitForURL(`${BASE}/admin`);
  check("cookies de session httpOnly", (await anon.cookies()).filter((c) => c.name.startsWith("rp_")).every((c) => c.httpOnly));
  await ap.waitForLoadState("networkidle");
  await ap.screenshot({ path: `${SHOTS}/07-admin-dashboard.png`, fullPage: true, caret: "initial" });

  // 8. La commande est dans l'admin immédiatement
  await ap.goto(`${BASE}/admin/commandes?q=${ref}`);
  check("admin : commande présente, marquée Nouvelle", (await ap.getByText(ref).first().isVisible()) && (await ap.getByText("Nouvelle").first().isVisible()));
  await ap.screenshot({ path: `${SHOTS}/08-admin-list.png`, fullPage: true, caret: "initial" });
  const oid = psql(`select id from orders where ref='${ref}'`);
  await ap.goto(`${BASE}/admin/commandes/${oid}`);
  const det = norm(await ap.locator("main").innerText());
  check("admin : détail (articles, adresse, paiement souhaité, remarques, sous-total, frais à confirmer)", ["Pizza pepperoni", "Rue Charbonnier, impasse Costo", "MonCash — depuis mon numéro MonCash", "Sans olives", "Sonner deux fois", "3 000 HTG", "À confirmer"].every((x) => det.includes(x)));
  check("admin : boutons appeler et WhatsApp client", ((await ap.getByRole("link", { name: /Appeler le client/ }).getAttribute("href")) === "tel:+50934123456") && (await ap.getByRole("link", { name: "Contacter le client sur WhatsApp" }).getAttribute("href")).startsWith("https://wa.me/50937001122"));
  await ap.screenshot({ path: `${SHOTS}/09-admin-order.png`, fullPage: true, caret: "initial" });

  // 9. Frais ajoutés par l'admin ; statut de paiement manuel
  await ap.fill("input[name=fee]", "300");
  await adminAction(ap, "Enregistrer les frais", "/admin/commandes/");
  check("admin : frais 300 HTG → total 3 300 HTG", await ap.getByText("3 300 HTG").first().waitFor({ timeout: 8000 }).then(() => true, () => false));
  await page.goto(orderUrl);
  const c2 = norm(await page.locator("main").innerText());
  check("client : voit les frais et le total", c2.includes("300 HTG") && c2.includes("3 300 HTG"));
  const wa2 = decodeURIComponent((await page.getByRole("link", { name: "Confirmer sur WhatsApp" }).getAttribute("href")).split("?text=")[1]);
  check("WhatsApp après frais : livraison et total affichés", norm(wa2).includes("Livraison : 300 HTG\nTotal : 3 300 HTG"));

  await ap.goto(`${BASE}/admin/commandes/${oid}`);
  await ap.selectOption("select[name=status]", "confirmed");
  await adminAction(ap, "Mettre à jour", "/admin/commandes/", true);
  await ap.selectOption("select[name=status]", "delivered");
  await adminAction(ap, "Mettre à jour", "/admin/commandes/", true);
  check("livrée ≠ payée : paiement toujours « À organiser »", psql(`select payment_status from orders where ref='${ref}'`) === "to_arrange");
  await ap.locator("form:has(select[name=status]) >> nth=-1").locator("select[name=status]").selectOption("confirmed_manually");
  await adminAction(ap, "Mettre à jour le paiement", "/admin/commandes/");
  check("confirmation sans case cochée : refusée", psql(`select payment_status from orders where ref='${ref}'`) === "to_arrange");
  await ap.locator("input[name=confirmReceived]").check();
  await ap.locator("form:has(select[name=status]) >> nth=-1").locator("select[name=status]").selectOption("confirmed_manually");
  await adminAction(ap, "Mettre à jour le paiement", "/admin/commandes/");
  check("confirmation manuelle : statut + auteur + date enregistrés", psql(`select payment_status || '|' || payment_confirmed_by || '|' || (paid_at is not null) from orders where ref='${ref}'`) === "confirmed_manually|admin@reina.test|true");
  await ap.getByText("action manuelle").first().waitFor({ timeout: 8000 });
  const hist = norm(await ap.locator("section[aria-labelledby=historique]").innerText());
  check("historique : frais, statuts, paiement manuel avec auteur", hist.includes("Frais de livraison") && hist.includes("Statut de la commande") && hist.includes("action manuelle") && hist.includes("admin@reina.test"), hist);
  await ap.screenshot({ path: `${SHOTS}/10-admin-order-paid.png`, fullPage: true, caret: "initial" });
  await page.goto(orderUrl);
  const c3 = norm(await page.locator("main").innerText());
  check("client : « Confirmé manuellement par la pizzeria », jamais de reçu de paiement", c3.includes("Confirmé manuellement par la pizzeria") && !/Reçu de paiement/.test(c3));

  // 10. Zone tarifée : frais et total affichés avant l'enregistrement
  psql("insert into delivery_zones (name, commune, fee_minor, is_demo) values ('Zone test e2e', 'Delmas', 25000, true)");
  await addPizza(page, "Pizza pepperoni", 1); await addPizza(page, "Pizza jambon", 1); await addPizza(page, "Pizza hareng saur", 1);
  await page.goto(BASE + "/commander");
  await page.getByRole("radio", { name: /Zone test e2e/ }).check();
  await fillCustomer(page, { fullName: "Paul Zone" });
  await page.selectOption("#f-paymentMethodId", { label: "À convenir avec la pizzeria" });
  await page.locator("aside").getByText("4 800 HTG").first().waitFor({ timeout: 8000 }).catch(() => {});
  const z = norm(await page.locator("aside").innerText());
  check("zone tarifée : 3 articles, livraison 250 HTG, total 4 800 HTG", z.includes("4 550 HTG") && z.includes("250 HTG") && z.includes("4 800 HTG") && /Total/.test(z), z);
  await page.screenshot({ path: `${SHOTS}/11-checkout-zone.png`, fullPage: true, caret: "initial" });
  await submitOrder(page);
  const zr = norm(await page.locator("main").innerText());
  check("confirmation à plusieurs articles : 3 lignes, sous-total, livraison, total", (await page.locator("section[aria-labelledby=detail] li").count()) === 3 && zr.includes("Pizza pepperoni · Taille S") && zr.includes("Pizza jambon · Taille S") && zr.includes("Pizza hareng saur · Taille S") && zr.includes("1 x 1 500 HTG".replace(" x ", " × ")) && zr.includes("4 550 HTG") && zr.includes("250 HTG") && zr.includes("4 800 HTG"));
  check("confirmation : miniatures des articles", (await page.locator("section[aria-labelledby=detail] img").count()) >= 1);
  const wz = decodeURIComponent((await page.getByRole("link", { name: "Confirmer sur WhatsApp" }).getAttribute("href")).split("?text=")[1]);
  check("zone tarifée : message à 3 lignes avec Total", norm(wz).includes("• 1 × Pizza jambon — taille S — 1 250 HTG") && norm(wz).includes("Livraison : 250 HTG\nTotal : 4 800 HTG"));
  await page.screenshot({ path: `${SHOTS}/confirmation-3-articles.png`, fullPage: true, caret: "initial" });
  const zoneToken = page.url().split("/").pop();
  for (const [st, step] of [["to_confirm", "Enregistrée"], ["confirmed", "Confirmée"], ["preparing", "En préparation"], ["out_for_delivery", "En livraison"], ["delivered", "Livrée"]]) {
    psql(`update orders set order_status = '${st}' where access_token = '${zoneToken}'`);
    await page.reload(); await page.waitForLoadState("networkidle");
    const cur = await page.locator("ol[aria-label='Progression de la commande'] li[aria-current=step]").innerText().catch(() => "");
    const doneCount = await page.locator("ol[aria-label='Progression de la commande'] li").evaluateAll((l) => l.filter((x) => x.textContent.includes("terminée")).length);
    check(`progression « ${st} » : étape en cours ${st === "delivered" ? "(toutes terminées)" : step}`, st === "delivered" ? doneCount === 5 : cur.includes(step) && doneCount === ["to_confirm", "confirmed", "preparing", "out_for_delivery"].indexOf(st), cur + "|" + doneCount);
    check(`statut « ${st} » : jamais « Payé » affiché`, !/\bPayée?\b|Payé le/.test(await page.locator("main").innerText()));
  }
  psql(`update orders set order_status = 'cancelled' where access_token = '${zoneToken}'`);
  await page.reload(); await page.waitForLoadState("networkidle");
  check("annulée : bandeau « annulée », aucune étape en cours ni en préparation", (await page.getByText("Cette commande a été annulée").isVisible()) && (await page.locator("li[aria-current=step]").count()) === 0 && (await page.locator("main").innerText()).includes("Commande annulée"));
  await page.screenshot({ path: `${SHOTS}/confirmation-annulee.png`, fullPage: true, caret: "initial" });
  psql("delete from delivery_zones where name = 'Zone test e2e'");

  // 11. Menu admin et réglages
  await ap.goto(`${BASE}/admin/menu`); await ap.waitForLoadState("networkidle");
  check("admin menu : 3 produits réels", (await ap.getByText("Pizza pepperoni").first().isVisible()) && (await ap.getByText("Pizza jambon").first().isVisible()) && (await ap.getByText("Pizza hareng saur").first().isVisible()));
  await ap.screenshot({ path: `${SHOTS}/12-admin-menu.png`, fullPage: true, caret: "initial" });
  await ap.goto(`${BASE}/admin/reglages`); await ap.waitForLoadState("networkidle");
  check("admin réglages : devise HTG et renvoi vers « Moyens de paiement »", (await ap.getByRole("link", { name: "Moyens de paiement" }).first().isVisible()) && (await ap.locator("select[name=currency]").inputValue()) === "HTG");
  await ap.screenshot({ path: `${SHOTS}/13-admin-settings.png`, fullPage: true, caret: "initial" });


  // 10b. Moyens de paiement (hors site) : MonCash, administration, formulaire, confirmation, instantané
  await ap.setViewportSize({ width: 1280, height: 800 });
  await ap.goto(`${BASE}/admin/moyens-paiement`); await ap.waitForLoadState("networkidle");
  const mcForm = ap.locator("form:has(input[name=label][value='MonCash'])").first();
  check("admin moyens de paiement : MonCash activé, coordonnées de réception vides (non supposées), alerte à compléter", (await mcForm.locator("input[name=enabled]").isChecked()) && (await mcForm.locator("input[name=recipientAccount]").inputValue()) === "" && (await mcForm.locator("input[name=recipientName]").inputValue()) === "" && (await ap.getByText("n'est pas supposé identique au numéro de contact de Reina Pizza").isVisible()));
  check("admin moyens de paiement : rappel « aucun paiement n'est effectué sur le site »", await ap.getByText("Aucun paiement n'est effectué sur le site.").first().isVisible());
  await mcForm.locator("textarea[name=instructions]").fill("Instruction test e2e");
  await mcForm.locator("input[name=recipientAccount]").fill("3800-1234");
  await mcForm.locator("input[name=recipientName]").fill("Bénéficiaire e2e");
  await Promise.all([ap.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/admin/moyens-paiement")), mcForm.getByRole("button", { name: "Enregistrer" }).click()]);
  await ap.waitForLoadState("networkidle");
  check("admin : instructions, compte et bénéficiaire enregistrés", psql("select instructions || '|' || recipient_account || '|' || recipient_name from payment_methods where label = 'MonCash'") === "Instruction test e2e|3800-1234|Bénéficiaire e2e");
  await ap.screenshot({ path: `${SHOTS}/admin-moyens-paiement.png`, fullPage: true, caret: "initial" });
  // formulaire client : instructions du moyen choisi
  await addPizza(page, "Pizza pepperoni", 1);
  await page.goto(BASE + "/commander"); await page.getByRole("button", { name: "Enregistrer ma commande" }).waitFor();
  await page.selectOption("#f-paymentMethodId", { label: "MonCash" });
  check("formulaire : instructions de MonCash affichées au choix, sans le numéro de réception", (await page.getByText("Instruction test e2e").isVisible()) && !(await page.locator("main").innerText()).includes("3800-1234"));
  await page.screenshot({ path: `${SHOTS}/checkout-moncash.png`, fullPage: true, caret: "initial" });
  await page.evaluate(() => localStorage.setItem("reina-cart-v1", "[]"));
  // confirmation : instructions visibles seulement après confirmation de la commande
  await page.goto(orderUrl); await page.waitForLoadState("networkidle");
  const pay1 = norm(await page.locator("section[aria-labelledby=paiement]").innerText());
  check("confirmation (commande livrée) : MonCash choisi + instructions et coordonnées de réception renseignées par l'admin", pay1.includes("MonCash") && pay1.includes("Instructions de paiement — MonCash") && pay1.includes("3800-1234") && pay1.includes("Bénéficiaire e2e") && pay1.includes("Le paiement sera organisé directement avec Reina Pizza après confirmation de la commande."));
  psql(`update orders set order_status = 'to_confirm' where ref = '${ref}'`);
  await page.reload(); await page.waitForLoadState("networkidle");
  const pay2 = norm(await page.locator("section[aria-labelledby=paiement]").innerText());
  check("confirmation (en attente) : coordonnées masquées jusqu'à la confirmation de la commande", !pay2.includes("3800-1234") && pay2.includes("s'afficheront ici après confirmation de la commande par Reina Pizza"));
  psql(`update orders set order_status = 'delivered' where ref = '${ref}'`);
  const waMc = decodeURIComponent((await page.getByRole("link", { name: "Confirmer sur WhatsApp" }).getAttribute("href")).split("?text=")[1]);
  check("WhatsApp : moyen choisi inclus, numéro de réception jamais inclus", waMc.includes("Moyen souhaité : MonCash — depuis mon numéro MonCash") && !waMc.includes("3800-1234"));
  // ajout, désactivation, instantané
  await ap.goto(`${BASE}/admin/moyens-paiement`); await ap.waitForLoadState("networkidle");
  const addForm = ap.locator("section[aria-labelledby=ajout] form");
  await addForm.locator("input[name=label]").fill("Test e2e"); await addForm.locator("input[name=position]").fill("5");
  await adminAction(ap, "Ajouter", "/admin/moyens-paiement");
  check("admin : moyen ajouté", psql("select count(*) from payment_methods where label = 'Test e2e' and enabled") === "1");
  await page.goto(BASE + "/commander"); await page.getByRole("button", { name: "Enregistrer ma commande" }).waitFor().catch(() => {});
  psql("update payment_methods set enabled = false where label = 'MonCash'");
  await ap.goto(`${BASE}/admin/moyens-paiement`); await ap.waitForLoadState("networkidle");
  await addPizza(page, "Pizza pepperoni", 1);
  await page.goto(BASE + "/commander"); await page.getByRole("button", { name: "Enregistrer ma commande" }).waitFor();
  check("MonCash désactivé : n'est plus proposé, les autres moyens activés le restent", (await page.locator("#f-paymentMethodId option:not([disabled])").allInnerTexts()).join("|") === "À convenir avec la pizzeria|Test e2e");
  await page.evaluate(() => localStorage.setItem("reina-cart-v1", "[]"));
  check("commande existante : le nom du moyen choisi est conservé après désactivation", psql(`select payment_method from orders where ref = '${ref}'`) === "MonCash");
  await ap.goto(`${BASE}/admin/commandes/${oid}`);
  check("admin : détail de commande avec le moyen choisi (instantané)", norm(await ap.locator("section[aria-labelledby=paiement]").innerText()).includes("MonCash — depuis mon numéro MonCash"));
  psql("update payment_methods set enabled = true where label = 'MonCash'");
  psql("update payment_methods set label = 'MonCash renommé' where label = 'MonCash'");
  await page.goto(orderUrl); await page.waitForLoadState("networkidle");
  check("moyen renommé : la commande affiche toujours le nom choisi, sans instructions d'un autre libellé", (await page.locator("section[aria-labelledby=paiement]").innerText()).includes("MonCash") && !(await page.locator("section[aria-labelledby=paiement]").innerText()).includes("Bénéficiaire e2e"));
  psql("update payment_methods set label = 'MonCash' where label = 'MonCash renommé'");
  psql("delete from payment_methods where label = 'Test e2e'");

  // 11a. Gestion du menu (admin) : synthèse, recherche, filtre, disponibilité, éditeur de tailles, accès
  await ap.setViewportSize({ width: 1280, height: 800 });
  await ap.goto(`${BASE}/admin/menu`); await ap.waitForLoadState("networkidle");
  const mm = norm(await ap.locator("main").innerText());
  check("menu admin : titre, sous-titre, bouton « Nouveau produit »", mm.includes("Gestion du menu") && mm.includes("Produits, tailles et disponibilités") && (await ap.getByRole("link", { name: "Nouveau produit" }).isVisible()));
  const sumText = norm(await ap.locator("[aria-label='Synthèse du menu']").innerText());
  check("menu admin : synthèse réelle 5 produits · 3 disponibles · 3 tailles tarifées", /5\s+produits/.test(sumText) && /3\s+disponibles/.test(sumText) && /3\s+tailles tarifées/.test(sumText), sumText);
  check("menu admin : onglets Produits et Catégories réels, pas d'onglet fictif", (await ap.locator("nav[aria-label='Sections du catalogue'] a").allInnerTexts()).join("|") === "Produits|Catégories|Suppléments");
  check("menu admin : sidebar (Vue d'ensemble, Commandes, Menu, Livraison, Réglages), Menu actif, fil d'Ariane, compte réel", (await ap.locator("aside nav a").allInnerTexts()).map((t) => t.replace(/\d+$/, "").trim()).join("|") === "Vue d'ensemble|Commandes|Menu|Livraison|Moyens de paiement|Réglages" && (await ap.locator("aside a[aria-current=page]").innerText()).includes("Menu") && (await ap.getByLabel("Fil d'Ariane").innerText()).includes("Catalogue") && (await ap.locator("header").innerText()).includes("admin@reina.test"));
  const rows = ap.locator("tbody tr");
  check("menu admin : 5 lignes, tailles et prix affichés, tarifs à renseigner signalés", (await rows.count()) === 5 && norm(await rows.first().innerText()).includes("S · 1 500 HTG") && norm(await rows.first().innerText()).includes("M, L, XL, XXL : tarifs à renseigner"));
  // recherche + filtre
  await ap.fill("#q", "jambon"); await Promise.all([ap.waitForURL(/q=jambon/), ap.getByRole("button", { name: "Filtrer" }).click()]); await ap.waitForLoadState("networkidle");
  check("recherche « jambon » : une seule ligne", (await ap.locator("tbody tr").count()) === 1 && (await ap.locator("tbody tr").innerText()).includes("Pizza jambon"));
  await ap.selectOption("#dispo", "unavailable"); await Promise.all([ap.waitForURL(/dispo=unavailable/), ap.getByRole("button", { name: "Filtrer" }).click()]); await ap.waitForLoadState("networkidle");
  check("filtre « Indisponibles » + recherche : état vide utile avec réinitialisation", (await ap.getByText("Aucun produit ne correspond à cette recherche.").isVisible()) && (await ap.getByRole("link", { name: "Réinitialiser les filtres" }).isVisible()));
  await ap.goto(`${BASE}/admin/menu`); await ap.waitForLoadState("networkidle");
  // disponibilité
  const hareng = ap.locator("tbody tr", { hasText: "Pizza hareng saur" });
  const sw = hareng.getByRole("switch", { name: "Disponibilité de Pizza hareng saur" });
  await sw.click();
  await ap.getByText("Pizza hareng saur est maintenant indisponible.").waitFor();
  check("disponibilité : interrupteur → sauvegarde serveur (base) et synthèse mise à jour", (await sw.getAttribute("aria-checked")) === "false" && psql("select available from products where name = 'Pizza hareng saur'") === "f" && await ap.waitForFunction(() => /2\s+disponibles/.test(document.querySelector("[aria-label='Synthèse du menu']").innerText), null, { timeout: 6000 }).then(() => true, () => false));
  await page.goto(BASE + "/menu"); await page.waitForLoadState("networkidle");
  { const hc = page.locator("article", { hasText: "Pizza hareng saur" }); check("produit indisponible : visible « Indisponible », non commandable", (await hc.count()) === 1 && (await hc.innerText()).includes("Indisponible") && (await hc.getByRole("button", { name: "Indisponible" }).isDisabled())); }
  await ap.goto(`${BASE}/admin/menu`); await ap.waitForLoadState("networkidle");
  await ap.locator("tbody tr", { hasText: "Pizza hareng saur" }).getByRole("switch").click();
  await ap.getByText("Pizza hareng saur est maintenant disponible.").waitFor();
  // échec serveur : retour à la valeur précédente + erreur
  await ap.route("**/api/admin/products/*", (r) => r.request().method() === "PATCH" ? r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Panne simulée du serveur" }) }) : r.continue());
  const swj = ap.locator("tbody tr", { hasText: "Pizza jambon" }).getByRole("switch");
  await swj.click();
  await ap.getByText("Panne simulée du serveur").waitFor();
  check("échec de sauvegarde : valeur précédente rétablie, erreur affichée", (await swj.getAttribute("aria-checked")) === "true" && psql("select available from products where name = 'Pizza jambon'") === "t");
  await ap.unroute("**/api/admin/products/*");
  // éditeur de tailles et prix
  const jambonRow = ap.locator("tbody tr", { hasText: "Pizza jambon" });
  const opener = jambonRow.getByRole("button", { name: "Modifier les tailles et prix de Pizza jambon" });
  await opener.click();
  const dlg = ap.getByRole("dialog", { name: /Tailles et prix — Pizza jambon/ });
  await dlg.waitFor(); await ap.waitForTimeout(350);
  check("éditeur : nom du produit, 5 champs S–XXL, HTG visible, aide, M vide (jamais 0)", (await dlg.locator("input").count()) === 5 && (await dlg.getByText("HTG").count()) === 5 && (await dlg.getByText("Une taille sans prix n'est pas proposée à la commande").isVisible()) && (await dlg.locator("#size-M").inputValue()) === "" && (await dlg.locator("#size-S").inputValue()) === "1250");
  await ap.screenshot({ path: `${SHOTS}/admin-menu-editeur-desktop.png`, fullPage: false, caret: "initial" });
  await dlg.locator("#size-M").fill("1 400"); await dlg.locator("#size-L").fill("abc");
  await dlg.getByRole("button", { name: "Enregistrer" }).click();
  await dlg.getByText("Montant invalide").first().waitFor();
  check("saisie invalide : erreur sous le champ, saisies conservées, rien d'enregistré", (await dlg.locator("#size-M").inputValue()) === "1 400" && (await dlg.locator("#size-L").inputValue()) === "abc" && psql("select count(*) from product_sizes where product_id = (select id from products where name='Pizza jambon')") === "1");
  await dlg.locator("#size-L").fill("");
  await dlg.getByRole("button", { name: "Enregistrer" }).click();
  await dlg.getByText("Tarifs enregistrés.").waitFor();
  check("enregistrement : M = 1 400 HTG en base (centimes exacts), retour de succès accessible", psql("select price_minor from product_sizes where size='M' and product_id = (select id from products where name='Pizza jambon')") === "140000" && (await dlg.locator("[role=status]").innerText()).includes("Tarifs enregistrés"));
  await dlg.locator("#size-XL").fill("0");
  await dlg.getByRole("button", { name: "Enregistrer" }).click();
  check("prix 0 refusé (strictement positif)", await dlg.getByText("Le prix doit être supérieur à 0.").waitFor({ timeout: 5000 }).then(() => true, () => false));
  // modifications non enregistrées : Échap demande confirmation
  await ap.keyboard.press("Escape");
  check("Échap avec modifications : confirmation avant fermeture", await ap.getByText("Modifications non enregistrées. Quitter sans enregistrer ?").isVisible());
  await ap.getByRole("button", { name: "Continuer la saisie" }).click();
  await dlg.locator("#size-XL").fill("");
  await ap.keyboard.press("Escape");
  await dlg.waitFor({ state: "detached" });
  check("Échap sans modification : fermeture et focus rendu au bouton d'origine", await opener.evaluate((e) => e === document.activeElement));
  await ap.reload(); await ap.waitForLoadState("networkidle");
  check("après sauvegarde : prix et compteur actualisés (4 tailles tarifées), taille M affichée", norm(await ap.locator("tbody tr", { hasText: "Pizza jambon" }).innerText()).includes("M · 1 400 HTG") && /4\s+tailles tarifées/.test(norm(await ap.locator("[aria-label='Synthèse du menu']").innerText())), norm(await ap.locator("main").innerText()).slice(0, 700));
  await page.goto(BASE + "/menu"); await page.waitForLoadState("networkidle");
  const jc = page.locator("article", { hasText: "Pizza jambon" });
  check("côté client : la taille M du jambon devient commandable à 1 400 HTG, L reste indisponible", (await jc.getByRole("radio").count()) === 2 && norm(await jc.innerText()).includes("1 400 HTG") && (await jc.locator("[aria-disabled=true]").count()) === 3);
  // retour à l'état initial (donnée réelle du restaurant : seul S est tarifé)
  psql("delete from product_sizes where size = 'M' and product_id = (select id from products where name = 'Pizza jambon')");
  // droits : mutations sans session administrateur
  const pid = psql("select id from products where name = 'Pizza jambon'");
  const un = [await fetch(`${BASE}/api/admin/products/${pid}`, { method: "PATCH", body: JSON.stringify({ available: false }), headers: { "Content-Type": "application/json" } }), await fetch(`${BASE}/api/admin/products/${pid}/sizes`, { method: "PUT", body: JSON.stringify({ prices: { S: "1" } }), headers: { "Content-Type": "application/json" } }), await fetch(`${BASE}/api/admin/products/${pid}`, { method: "DELETE" })];
  check("mutations du menu sans session admin : 401 et rien modifié", un.every((r) => r.status === 401) && psql(`select s.price_minor::text || p.available::text from product_sizes s join products p on p.id = s.product_id where p.id = '${pid}' and s.size = 'S'`) === "125000true");

  // 11b. La photo ajoutée par l'administrateur prime sur l'illustration par défaut
  psql("update products set image_url = 'http://localhost:54321/storage/v1/object/public/menu-images/test-admin.webp' where name = 'Pizza pepperoni'");
  await page.goto(BASE + "/menu"); await page.waitForLoadState("networkidle");
  const pc = page.locator("article", { hasText: "Pizza pepperoni" });
  check("photo admin : remplace l'illustration (pas de badge, source Supabase)", (await pc.locator("img").first().getAttribute("src")).includes("menu-images") && (await pc.getByText("Photo d'illustration").count()) === 0);
  psql("update products set image_url = null where name = 'Pizza pepperoni'");

  // 12. Photo réelle : téléversement admin, cadrage 4:3 uniforme, hero
  const sharp = require("sharp");
  const big = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 200, g: 120, b: 60 } } }).composite([{ input: Buffer.from('<svg width="1200" height="1200"><circle cx="600" cy="600" r="560" fill="#c0392b"/></svg>'), gravity: "centre" }]).jpeg().toBuffer();
  await ap.goto(`${BASE}/admin/menu/nouveau`);
  await ap.fill("input[name=name]", "Test photo e2e");
  await ap.check("input[name=size_S_on]"); await ap.fill("input[name=size_S_price]", "100");
  await ap.setInputFiles("input[name=image]", { name: "photo.jpg", mimeType: "image/jpeg", buffer: big });
  await adminAction(ap, "Enregistrer", "/admin/menu", true);
  check("admin : produit avec photo enregistré", /\/admin\/menu\/[0-9a-f-]{36}/.test(ap.url()), ap.url() + " " + norm(await ap.locator("main").innerText()).slice(0, 300));
  await page.goto(BASE + "/menu"); await page.waitForLoadState("networkidle");
  const dims = await page.locator("article", { hasText: "Test photo e2e" }).locator("img").first().evaluate((i) => ({ w: i.naturalWidth, h: i.naturalHeight, box: i.parentElement.getBoundingClientRect().width / i.parentElement.getBoundingClientRect().height }));
  check("photo : recadrée 1200×900 (4:3), conteneur 4:3, sans déformation", dims.w === 1200 && dims.h === 900 && Math.abs(dims.box - 4 / 3) < 0.02, JSON.stringify(dims));
  check("photo : chargement différé sous la ligne de flottaison", (await page.locator("article", { hasText: "Test photo e2e" }).locator("img").first().getAttribute("loading")) === "lazy");
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const dp = await dctx.newPage();
  await dp.goto(BASE + "/"); await dp.waitForLoadState("networkidle");
  check("accueil desktop : visuel principal = pepperoni (1200 px, prioritaire), badge illustration", (await dp.locator("section img[alt^='Pizza pepperoni']").first().evaluate((i) => i.currentSrc.includes("pepperoni-1200") || i.currentSrc.includes("pepperoni-800")) ) && (await dp.locator("section img[alt^='Pizza pepperoni']").first().getAttribute("fetchpriority")) === "high" && (await dp.getByText("Photo d'illustration", { exact: true }).count()) >= 4);
  await dctx.close();
  await ap.goto(`${BASE}/admin/menu`);
  ap.once("dialog", (d) => d.accept());
  await Promise.all([ap.waitForResponse((r) => r.request().method() === "DELETE"), (async () => { await ap.locator("tr", { hasText: "Test photo e2e" }).getByRole("button", { name: /Plus d'actions/ }).click(); await ap.getByRole("menuitem", { name: "Supprimer définitivement" }).click(); })()]);
  await ap.waitForLoadState("networkidle");
  check("produit de test supprimé", psql("select count(*) from products where name = 'Test photo e2e'") === "0");

  // 13. Accessibilité : clavier, mouvement réduit, contraste, impression
  const kb = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  const kp = await kb.newPage();
  await kp.goto(BASE + "/menu"); await kp.waitForLoadState("networkidle");
  await kp.keyboard.press("Tab");
  check("clavier : premier Tab = lien d'évitement visible", await kp.evaluate(() => { const a = document.activeElement; return a?.textContent?.includes("Aller au contenu") && getComputedStyle(a).position === "absolute"; }));
  let focusOk = true;
  for (let i = 0; i < 8; i++) { await kp.keyboard.press("Tab"); focusOk &&= await kp.evaluate(() => { const c = getComputedStyle(document.activeElement); return parseFloat(c.outlineWidth) >= 2 || parseFloat(c.boxShadow === "none" ? 0 : 1) > 0; }); }
  check("clavier : focus visible sur les 8 premiers éléments", focusOk);
  check("mouvement réduit : animations désactivées", await kp.evaluate(() => { const d = document.querySelector(".fade-up"); return !d || getComputedStyle(d).animationName === "none"; }));
  await kb.close();
  const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  for (const [fg, bg, name] of [["#202020", "#FAF7F2", "texte principal / ivoire"], ["#5c5853", "#FAF7F2", "texte secondaire / ivoire"], ["#FFFFFF", "#921F24", "blanc / rouge profond"], ["#921F24", "#FAF7F2", "rouge / ivoire"], ["#FFFFFF", "#1F7A4C", "blanc / vert WhatsApp"], ["#1F7A4C", "#FAF7F2", "vert / ivoire"]]) {
    const r = ratio(fg, bg); check(`contraste ${name} : ${r.toFixed(1)}:1 (≥ 4,5)`, r >= 4.5);
  }
  const pr = await ctx.newPage();
  await pr.goto(orderUrl); await pr.emulateMedia({ media: "print" });
  check("impression : logo visible, boutons masqués, mention « pas un reçu de paiement »", ((await pr.locator("img[alt='Reina Pizza']:visible").count()) >= 1) && !(await pr.getByRole("link", { name: "Confirmer sur WhatsApp" }).isVisible()) && (await pr.getByText("ce document n'est pas un reçu de paiement").isVisible()));
  await pr.close();

  // 14. Responsive : pas de défilement horizontal de 360 px à 1440 px, captures comparables
  const orderPath = new URL(orderUrl).pathname;
  const vps = [[360, 780, "mobile360"], [390, 844, "mobile390"], [768, 1024, "tablette"], [1280, 800, "desktop1280"], [1440, 900, "desktop1440"]];
  await addPizza(page, "Pizza pepperoni", 1); // panier non vide pour la capture du panier
  const cartState = await page.evaluate(() => localStorage.getItem("reina-cart-v1"));
  for (const [w, h, name] of vps) {
    const vc = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 700, hasTouch: w < 700 });
    await vc.addInitScript((c) => localStorage.setItem("reina-cart-v1", c), cartState);
    const vp = await vc.newPage();
    for (const [path, label] of [["/", "accueil"], ["/menu", "menu"], ["/panier", "panier"], ["/commander", "livraison"], [orderPath, "confirmation"]]) {
      await vp.goto(BASE + path); await vp.waitForLoadState("networkidle"); await vp.waitForTimeout(300);
      check(`${name} ${label} : pas de défilement horizontal`, await noScroll(vp));
      await vp.screenshot({ path: `${SHOTS}/${name}-${label}.png`, fullPage: true, caret: "initial" });
    }
    await vc.close();
  }
  // Menu admin sur téléphone : cartes, éditeur de tailles accessible, aucun débordement
  for (const w of [360, 390]) {
    await ap.setViewportSize({ width: w, height: 800 });
    await ap.goto(`${BASE}/admin/menu`); await ap.waitForLoadState("networkidle");
    check(`menu admin ${w} px : cartes produit (tableau masqué), pas de défilement horizontal`, (await ap.locator("ul.md\\:hidden > li").count()) === 5 && !(await ap.locator("tbody").isVisible()) && await noScroll(ap));
    await ap.locator("ul.md\\:hidden > li", { hasText: "Pizza pepperoni" }).getByRole("button", { name: /Modifier les tailles et prix/ }).click();
    const md = ap.getByRole("dialog");
    await md.waitFor(); await ap.waitForTimeout(350); // fin de l'animation d'ouverture
    const box = await md.evaluate((d) => { const r = d.getBoundingClientRect(); const b = d.querySelector("button[type=submit]").getBoundingClientRect(); return { bottom: r.bottom, vh: innerHeight, w: r.width, vw: innerWidth, btnVisible: b.top >= 0 && b.bottom <= innerHeight + 1 || d.scrollHeight > d.clientHeight }; });
    check(`éditeur ${w} px : panneau dans l'écran, défilable, bouton Enregistrer atteignable, pas de débordement`, box.w <= box.vw && box.bottom <= box.vh + 1 && box.btnVisible && await noScroll(ap));
    if (w === 390) await ap.screenshot({ path: `${SHOTS}/admin-menu-editeur-mobile.png`, caret: "initial" });
    await ap.keyboard.press("Escape"); await md.waitFor({ state: "detached" });
    if (w === 390) await ap.screenshot({ path: `${SHOTS}/admin-menu-mobile.png`, fullPage: true, caret: "initial" });
  }
  for (const [w, h, name] of [[390, 844, "mobile390"], [1280, 800, "desktop1280"]]) {
    await ap.setViewportSize({ width: w, height: h });
    for (const [path, label] of [["/admin", "admin-tableau"], ["/admin/commandes", "admin-commandes"], [`/admin/commandes/${oid}`, "admin-detail"], ["/admin/menu", "admin-menu"]]) {
      await ap.goto(BASE + path); await ap.waitForLoadState("networkidle");
      check(`${name} ${label} : pas de défilement horizontal`, await noScroll(ap));
      await ap.screenshot({ path: `${SHOTS}/${name}-${label}.png`, fullPage: true, caret: "initial" });
    }
  }

  // 15. Burger et Wings, état initial : « Bientôt disponible », contrôle serveur, configuration depuis l'administration
  const burgerId = psql("select id from products where product_type = 'other' and default_image = 'burger-frites'"), wingsId = psql("select id from products where product_type = 'other' and default_image = 'wings'");
  const cardOf = (pg, name) => pg.locator("article").filter({ has: pg.getByRole("heading", { name, exact: true }) }).first();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + "/menu"); await page.waitForLoadState("networkidle");
  check("catalogue : navigation compacte « Tout · Pizzas · Burgers · Wings »", (await page.locator("nav[aria-label='Catégories'] a").allInnerTexts()).join("|") === "Tout|Pizzas|Burgers|Wings" && await noScroll(page));
  for (const [name, slug] of [["Burger", "burger-frites"], ["Wings", "wings"]]) {
    const card = cardOf(page, name);
    await card.scrollIntoViewIfNeeded();
    await card.locator("img").first().evaluate((i) => i.decode().catch(() => {}));
    const info = await card.locator("img").first().evaluate((i) => ({ src: i.currentSrc, set: i.srcset, w: i.getAttribute("width"), h: i.getAttribute("height"), nat: i.naturalWidth, box: i.parentElement.getBoundingClientRect().width / i.parentElement.getBoundingClientRect().height, fit: getComputedStyle(i).objectFit }));
    check(`catalogue : ${name} → /images/products/${slug}*.webp, srcset 480/800/1200, 4:3, dimensions réservées`, info.src.includes(`/images/products/${slug}`) && info.src.endsWith(".webp") && /480w.*800w.*1200w/.test(info.set) && Math.abs(info.box - 4 / 3) < 0.02 && info.fit === "cover" && info.w === "1200" && info.h === "900" && info.nat > 0, JSON.stringify(info));
    const txt = norm(await card.innerText());
    check(`catalogue : ${name} « Bientôt disponible », bouton désactivé, aucun prix ni portion inventé, « Photo d'illustration »`, txt.includes("Bientôt disponible") && (await card.getByRole("button", { name: "Bientôt disponible" }).isDisabled()) && !/\d\s?HTG|\d+ pièces|portion|taille/i.test(txt.replace("Photo d'illustration", "")) && txt.includes("Photo d'illustration"), txt);
  }
  await page.goto(BASE + "/menu?categorie=burgers"); await page.waitForLoadState("networkidle");
  check("catalogue : filtre « Burgers » (une seule catégorie affichée)", (await page.locator("article").count()) === 1 && (await page.locator("nav[aria-label='Catégories'] a[aria-current=page]").innerText()) === "Burgers");
  // contrôle serveur : commande forcée d'un produit non configuré
  const pmId = psql("select id from payment_methods where enabled order by position limit 1");
  const payload = (items) => JSON.stringify({ items, deliveryMode: "quote", idempotencyKey: "e2e" + Math.random().toString(36).slice(2, 12) + "abcdef", paymentMethodId: pmId, customer: { fullName: "Test Serveur", phone: "34123456", commune: "Delmas", quarter: "Delmas 33", address: "Rue test 1", landmark: "Près de l'école" } });
  let fr = await fetch(`${BASE}/api/orders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload([{ productId: burgerId, quantity: 1, extraIds: [] }]) });
  let fj = await fr.json();
  check("serveur : commande d'un burger non configuré refusée (409 cart_problems)", fr.status === 409 && fj.code === "cart_problems" && fj.problems[0].reason === "not_configured");
  fr = await fetch(`${BASE}/api/cart/price`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: [{ productId: wingsId, quantity: 1, extraIds: [] }] }) });
  fj = await fr.json();
  check("serveur : le prix du panier signale « non configuré » et ne chiffre rien", fj.lines.length === 0 && fj.subtotalMinor === 0 && fj.problems[0].reason === "not_configured");
  await ap.setViewportSize({ width: 1280, height: 900 });
  await ap.goto(`${BASE}/admin/menu`); await ap.waitForLoadState("networkidle");
  const rowB = ap.locator("tbody tr", { hasText: "Burger" });
  check("admin : Burger/Wings listés « Non configuré », sans éditeur de tailles de pizza", (await ap.locator("tbody").getByText("Non configuré : prix et unité à renseigner").count()) === 2 && (await rowB.getByRole("button", { name: /tailles et prix/ }).count()) === 0);
  await rowB.getByRole("switch").click();
  check("admin : activation refusée tant que prix et unité manquent", await ap.getByText("Renseignez le prix et l'unité de vente avant d'activer ce produit.").waitFor({ timeout: 6000 }).then(() => true, () => false) && psql("select available from products where id = '" + burgerId + "'") === "f");
  // administration : Wings avec deux variantes de portion et sans prix de base
  await ap.goto(`${BASE}/admin/menu/${wingsId}`); await ap.waitForLoadState("networkidle");
  check("admin : fiche Wings — pas de tailles S–XXL ; prix, unité, variantes avec pièces, ingrédients, visibilité", (await ap.locator("input[name=size_S_on]").count()) === 0 && (await ap.locator("input[name=basePrice]").count()) === 1 && (await ap.locator("select[name=saleUnit]").count()) === 1 && (await ap.locator("input[name=variant_0_pieces]").count()) === 1 && (await ap.locator("textarea[name=ingredients]").count()) === 1 && (await ap.locator("input[name=visible]").count()) === 1);
  await ap.selectOption("select[name=saleUnit]", "portion");
  await ap.fill("input[name=variant_0_label]", "6 pièces"); await ap.fill("input[name=variant_0_pieces]", "6"); await ap.fill("input[name=variant_0_price]", "600");
  await ap.fill("input[name=variant_1_label]", "12 pièces"); await ap.fill("input[name=variant_1_pieces]", "12"); await ap.fill("input[name=variant_1_price]", "1200");
  await ap.check("input[name=available]");
  await Promise.all([ap.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/admin/menu/")), ap.getByRole("button", { name: "Enregistrer" }).click()]);
  await ap.getByText("Produit enregistré.").waitFor();
  check("admin : Wings activé avec variantes seules (sans prix de base)", psql("select coalesce(base_price_minor::text,'-') || '|' || sale_unit || '|' || available from products where id = '" + wingsId + "'") === "-|portion|true" && psql("select string_agg(label || ':' || price_minor || ':' || pieces, ',' order by position) from product_variants where product_id = '" + wingsId + "'") === "6 pièces:60000:6,12 pièces:120000:12", psql("select coalesce(base_price_minor::text,'-') || '|' || sale_unit || '|' || available from products where id = '" + wingsId + "'") + " / " + psql("select string_agg(label || ':' || price_minor || ':' || pieces, ',' order by position) from product_variants where product_id = '" + wingsId + "'") + " / " + norm(await ap.locator("main").innerText()).slice(0, 300));
  await ap.fill("input[name=pieces]", "6");
  await ap.selectOption("select[name=saleUnit]", "unit");
  await Promise.all([ap.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/admin/menu/")), ap.getByRole("button", { name: "Enregistrer" }).click()]);
  check("admin : pièces refusées pour une vente à l'unité", await ap.getByText("ne s'applique qu'à une vente par portion").waitFor({ timeout: 6000 }).then(() => true, () => false));
  resetOther();

  // 16. Migration de mise à jour (base existante, idempotente) : Burger + frites 1 250 HTG, Wings BBQ 6 / 12 pièces
  const fs = require("node:fs");
  const mig7 = "supabase/migrations/20260107000000_burger_frites_wings_bbq.sql";
  execFileSync("psql", [DB, "-q", "-v", "ON_ERROR_STOP=1", "-f", mig7]); execFileSync("psql", [DB, "-q", "-v", "ON_ERROR_STOP=1", "-f", mig7]);
  check("migration : appliquée deux fois sans doublon, prix et variantes en base", psql("select count(*) from products where product_type = 'other'") === "2" && psql("select count(*) from product_variants") === "2" && psql("select name || '|' || base_price_minor || '|' || available from products where id = '" + burgerId + "'") === "Burger + frites|125000|true" && psql("select name || '|' || available from products where id = '" + wingsId + "'") === "Wings BBQ|true", psql("select name || '|' || coalesce(base_price_minor::text,'-') || '|' || available from products where product_type='other'") + " / " + psql("select count(*) from product_variants"));
  await page.goto(BASE + "/menu"); await page.waitForLoadState("networkidle");
  const bc = cardOf(page, "Burger + frites"), wc = cardOf(page, "Wings BBQ");
  await bc.scrollIntoViewIfNeeded(); await bc.locator("img").first().evaluate((i) => i.decode().catch(() => {}));
  const bt = norm(await bc.innerText()), wt = norm(await wc.innerText());
  const bimg = await bc.locator("img").first().evaluate((i) => ({ src: i.currentSrc, box: i.parentElement.getBoundingClientRect().width / i.parentElement.getBoundingClientRect().height, nat: i.naturalWidth }));
  check("catalogue : Burger + frites 1 250 HTG, frites incluses, boisson non incluse, nouvelle image 4:3, « Photo d'illustration »", bt.includes("1 250 HTG") && /frites/i.test(bt) && /Boisson non incluse/.test(bt) && !/Taille|XXL/.test(bt) && bt.includes("Photo d'illustration") && bimg.src.includes("/images/products/burger-frites") && Math.abs(bimg.box - 4 / 3) < 0.02 && bimg.nat > 0 && (await bc.getByRole("button", { name: /Ajouter au panier/ }).isEnabled()), bt + JSON.stringify(bimg));
  check("catalogue : Wings BBQ « À partir de 600 HTG », portions 6 / 12 pièces, bouton désactivé sans sélection, sans frites ni boisson ni taille", wt.includes("À partir de 600 HTG") && wt.includes("6 pièces") && wt.includes("12 pièces") && wt.includes("1 200 HTG") && (await wc.getByRole("button", { name: "Choisissez une portion" }).isDisabled()) && !/frites|boisson|Taille/i.test(wt), wt);
  await wc.getByText("12 pièces", { exact: true }).click();
  let wsel = norm(await wc.innerText());
  check("sélecteur de portion : 12 pièces → 1 200 HTG · Portion de 12 pièces", wsel.includes("1 200 HTG · Portion de 12 pièces") && !wsel.includes("À partir de") && (await wc.getByRole("button", { name: /Ajouter au panier · 1 200 HTG/ }).isEnabled()), wsel);
  await wc.getByText("6 pièces", { exact: true }).click();
  wsel = norm(await wc.innerText());
  check("sélecteur de portion : 6 pièces → 600 HTG · Portion de 6 pièces", wsel.includes("600 HTG · Portion de 6 pièces") && (await wc.getByRole("button", { name: /Ajouter au panier · 600 HTG/ }).isEnabled()), wsel);
  await wc.screenshot({ path: `${SHOTS}/selecteur-portions-mobile.png`, caret: "initial" });
  await bc.screenshot({ path: `${SHOTS}/carte-burger-frites-mobile.png`, caret: "initial" });
  // panier mixte
  await page.evaluate(() => localStorage.setItem("reina-cart-v1", "[]")); await page.reload(); await page.waitForLoadState("networkidle");
  const addTo = async (name, qty = 1, portion) => { const c = cardOf(page, name); if (portion) await c.getByText(portion, { exact: true }).click(); for (let i = 1; i < qty; i++) await c.getByRole("button", { name: /^Ajouter un/ }).click(); await c.getByRole("button", { name: /Ajouter au panier/ }).click(); await page.getByText("Ajouté", { exact: true }).first().waitFor(); await page.waitForTimeout(2000); };
  await addTo("Pizza pepperoni");
  await addTo("Burger + frites", 2);
  await addTo("Wings BBQ", 2, "6 pièces");
  await addTo("Wings BBQ", 1, "12 pièces");
  await page.goto(BASE + "/panier"); await page.getByText("Sous-total des produits").first().waitFor();
  const ct = norm(await page.locator("main").innerText());
  check("panier mixte : Taille S (pizza), 2 × Burger + frites, lignes distinctes 6 et 12 pièces, total 6 400 HTG", ct.includes("Taille S") && ct.includes("Burger + frites") && ct.includes("Portion de 6 pièces") && ct.includes("Portion de 12 pièces") && ct.includes("2 500 HTG") && ct.includes("6 400 HTG") && !/Taille (—|undefined|null)/.test(ct) && (await page.locator("main select").count()) === 0, ct);
  await page.screenshot({ path: `${SHOTS}/panier-mixte-mobile.png`, fullPage: true, caret: "initial" });
  await page.getByRole("link", { name: "Renseigner ma livraison" }).click(); await page.waitForURL("**/commander");
  await page.getByRole("button", { name: "Enregistrer ma commande" }).waitFor();
  await fillCustomer(page, { fullName: "Client Mixte" });
  await page.selectOption("#f-paymentMethodId", { label: "MonCash" });
  await submitOrder(page);
  const mixToken = page.url().split("/").pop();
  const mt = norm(await page.locator("section[aria-labelledby=detail]").innerText());
  check("confirmation mixte : 4 lignes, libellés et montants conservés, sous-total 6 400 HTG, frais à confirmer", (await page.locator("section[aria-labelledby=detail] li").count()) === 4 && mt.includes("Pizza pepperoni · Taille S") && mt.includes("Burger + frites") && mt.includes("Wings BBQ · Portion de 6 pièces") && mt.includes("Wings BBQ · Portion de 12 pièces") && mt.includes("6 400 HTG") && mt.includes("À confirmer"), mt);
  const wm = norm(decodeURIComponent((await page.getByRole("link", { name: "Confirmer sur WhatsApp" }).getAttribute("href")).split("?text=")[1]));
  check("WhatsApp mixte : lignes de chaque produit, aucune taille fictive, MonCash, sous-total", wm.includes("• 1 × Pizza pepperoni — taille S — 1 500 HTG") && wm.includes("• 2 × Burger + frites — 2 500 HTG") && wm.includes("• 2 × Wings BBQ — portion de 6 pièces — 1 200 HTG") && wm.includes("• 1 × Wings BBQ — portion de 12 pièces — 1 200 HTG") && wm.includes("Sous-total : 6 400 HTG") && wm.includes("Moyen souhaité : MonCash") && !/Burger[^\n]*taille|Wings[^\n]*taille|taille undefined|taille null/.test(wm), wm);
  check("commande mixte : enregistrée, paiement « à organiser » (MonCash ≠ payé)", psql(`select payment_status || '|' || coalesce(payment_method,'') || '|' || (select count(*) from order_items where order_id = o.id) from orders o where access_token = '${mixToken}'`) === "to_arrange|MonCash|4" && psql(`select size is null from order_items where product_name = 'Burger + frites' and order_id = (select id from orders where access_token = '${mixToken}')`) === "t");
  await page.screenshot({ path: `${SHOTS}/confirmation-mixte-mobile.png`, fullPage: true, caret: "initial" });
  const mixId = psql(`select id from orders where access_token = '${mixToken}'`);
  await ap.goto(`${BASE}/admin/commandes/${mixId}`); await ap.waitForLoadState("networkidle");
  const at = norm(await ap.locator("section[aria-labelledby=articles]").innerText());
  check("admin : commande mixte lisible (taille pour la pizza, portions pour les wings)", at.includes("Taille S") && at.includes("Burger + frites") && at.includes("Portion de 6 pièces") && at.includes("Portion de 12 pièces"), at);
  // l'administrateur modifie ensuite prix et portions : les anciennes commandes ne changent pas
  await ap.goto(`${BASE}/admin/menu/${wingsId}`); await ap.waitForLoadState("networkidle");
  await ap.fill("input[name=variant_1_price]", "1300");
  await Promise.all([ap.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/admin/menu/")), ap.getByRole("button", { name: "Enregistrer" }).click()]);
  await ap.getByText("Produit enregistré.").waitFor();
  await page.goto(`${BASE}/commande/${mixToken}`); await page.waitForLoadState("networkidle");
  check("modification admin d'une portion : l'ancienne commande garde ses prix", norm(await page.locator("section[aria-labelledby=detail]").innerText()).includes("6 400 HTG"));
  await page.goto(BASE + "/menu"); await page.waitForLoadState("networkidle");
  check("modification admin d'une portion : le catalogue affiche 1 300 HTG pour 12 pièces", norm(await cardOf(page, "Wings BBQ").innerText()).includes("1 300 HTG"));
  // visibilité
  psql("update products set visible = false where product_type = 'other' and default_image = 'wings'");
  await page.goto(BASE + "/menu"); await page.waitForLoadState("networkidle");
  check("visibilité : Wings masqué disparaît du catalogue et de la navigation", (await page.locator("article").filter({ has: page.getByRole("heading", { name: "Wings BBQ", exact: true }) }).count()) === 0 && (await page.locator("nav[aria-label='Catégories'] a").allInnerTexts()).join("|") === "Tout|Pizzas|Burgers");
  psql("update products set visible = true where product_type = 'other'");
  for (const [w, h] of [[360, 780], [1280, 800], [1440, 900]]) {
    const vc = await browser.newContext({ viewport: { width: w, height: h } }); const vp = await vc.newPage();
    await vp.goto(BASE + "/menu"); await vp.waitForLoadState("networkidle");
    check(`catalogue ${w} px : pas de défilement horizontal avec les catégories`, await noScroll(vp));
    if (w === 1280) await vp.screenshot({ path: `${SHOTS}/catalogue-desktop.png`, fullPage: true, caret: "initial" });
    await vc.close();
  }
  await ap.goto(`${BASE}/admin/menu`); await ap.waitForLoadState("networkidle");
  await ap.screenshot({ path: `${SHOTS}/admin-menu-burger-wings.png`, fullPage: true, caret: "initial" });
  await ap.goto(`${BASE}/admin/menu/${wingsId}`); await ap.waitForLoadState("networkidle");
  await ap.screenshot({ path: `${SHOTS}/admin-fiche-wings.png`, fullPage: true, caret: "initial" });
  resetOther(); // état de départ (migration 6) : produits non configurés

  check("aucune erreur JS console côté client", errors.length === 0, errors.join(" | "));
  await browser.close();
  console.log(failures ? `\n${failures} échec(s)` : "\nTous les contrôles sont passés");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

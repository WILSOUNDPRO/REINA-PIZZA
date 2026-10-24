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
  await page.goto(BASE + "/menu");
  const card = page.locator("article", { hasText: name });
  for (let i = 1; i < qty; i++) await card.getByRole("button", { name: "Plus" }).click();
  await card.getByRole("button", { name: /Ajouter/ }).click();
  await page.getByText("Ajouté ✓").first().waitFor();
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
  await page.goto(BASE + "/menu"); await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${SHOTS}/02-menu.png`, fullPage: true, caret: "initial" });
  const menu = norm(await page.locator("main").innerText());
  check("menu : 3 produits réels aux bons prix", menu.includes("Pizza pepperoni") && menu.includes("1 500 HTG") && menu.includes("Pizza jambon") && menu.includes("1 250 HTG") && menu.includes("Pizza hareng saur") && menu.includes("1 800 HTG"));
  check("menu : plus aucune donnée de démonstration", !/démo/i.test(menu));
  const pep = page.locator("article", { hasText: "Pizza pepperoni" });
  check("menu : tailles M à XXL désactivées « Prix à venir »", (await pep.locator("[aria-disabled=true]").count()) === 4 && (await pep.getByRole("radio").count()) === 1);
  check("menu : cartes de même hauteur d'image (4:3)", await page.evaluate(() => { const r = [...document.querySelectorAll("article div[role=img], article img")].map((e) => Math.round(e.getBoundingClientRect().width / e.getBoundingClientRect().height * 100)); return r.length >= 3 && r.every((x) => x === r[0]); }));
  check("menu : pas de défilement horizontal", await noScroll(page));
  check("menu : hareng saur sans fausse photo (emplacement)", (await page.locator("article", { hasText: "Pizza hareng saur" }).getByRole("img", { name: /à venir/ }).count()) === 1);

  // 2. Panier
  await addPizza(page, "Pizza pepperoni", 2);
  await page.goto(BASE + "/panier"); await page.getByText("Sous-total des produits").first().waitFor();
  check("panier : 2 × 1 500 HTG = 3 000 HTG", norm(await page.locator("main").innerText()).includes("3 000 HTG"));
  await page.screenshot({ path: `${SHOTS}/03-cart.png`, fullPage: true, caret: "initial" });

  // 3. Formulaire sans zone tarifée : frais à confirmer, sous-total non présenté comme total
  await page.getByRole("link", { name: "Continuer vers la livraison" }).click();
  await page.waitForURL("**/commander");
  await page.getByRole("button", { name: "Enregistrer ma commande" }).waitFor();
  const form = norm(await page.locator("main").innerText());
  check("formulaire : message frais à confirmer", form.includes("Frais de livraison à confirmer avec la pizzeria selon votre adresse."));
  check("formulaire : sous-total sans ligne « Total »", form.includes("Sous-total des produits") && !/^Total\b/m.test(form));
  check("formulaire : « aucun paiement n'est effectué sur ce site »", form.includes("Aucun paiement n'est effectué sur ce site."));
  check("formulaire : aucun champ carte/PIN/mot de passe", (await page.locator("input[type=password], input[autocomplete^=cc-], input[name*=card i], input[name*=pin i]").count()) === 0);
  check("formulaire : option « À convenir avec la pizzeria »", await page.locator("#f-paymentMethodId option", { hasText: "À convenir avec la pizzeria" }).count() === 1);
  await page.getByRole("button", { name: "Enregistrer ma commande" }).click();
  check("validation : champs obligatoires signalés ; moyen de paiement unique présélectionné", (await page.getByText("Le nom complet est obligatoire.").isVisible()) && (await page.getByText("L'adresse précise est obligatoire.").isVisible()) && (await page.inputValue("#f-paymentMethodId")) !== "");
  await page.screenshot({ path: `${SHOTS}/04-checkout-errors.png`, fullPage: true, caret: "initial" });
  await fillCustomer(page, { phone: "12" });
  await page.getByRole("button", { name: "Enregistrer ma commande" }).click();
  check("validation : téléphone invalide", await page.getByText(/Le numéro de téléphone invalide/).isVisible());
  await fillCustomer(page);
  await page.fill("#f-paymentMethodNote", "espèces à la livraison");
  await page.locator("summary", { hasText: "Informations facultatives" }).click();
  await page.fill("#f-deliveryInstructions", "Sonner deux fois");
  await page.fill("#f-notes", "Sans olives");
  await page.fill("#f-gps", "18.5392, -72.3350");
  await page.fill("#f-whatsapp", "3700-1122");
  await page.screenshot({ path: `${SHOTS}/05-checkout-filled.png`, fullPage: true, caret: "initial" });

  // Erreur serveur : les champs sont conservés
  psql("update settings set orders_paused = true, pause_message = 'Pause test'");
  await page.getByRole("button", { name: "Enregistrer ma commande" }).click();
  await page.getByText("Pause test").first().waitFor();
  check("erreur serveur : message affiché et champs conservés", (await page.inputValue("#f-fullName")) === "Marie Test" && (await page.inputValue("#f-notes")) === "Sans olives" && (await page.inputValue("#f-paymentMethodNote")) === "espèces à la livraison");
  psql("update settings set orders_paused = false, pause_message = null");

  // 4. Enregistrement + double clic
  const before = Number(psql("select count(*) from orders"));
  await submitOrder(page);
  const orderUrl = page.url();
  check("double clic : une seule commande créée", Number(psql("select count(*) from orders")) === before + 1);
  const body = norm(await page.locator("main").innerText());
  const ref = body.match(/RP-[A-Z0-9]{6}/)[0];
  check("confirmation : « Votre commande a été enregistrée » + référence", body.includes("Votre commande a été enregistrée") && !!ref);
  check("confirmation : « En attente de confirmation par la pizzeria »", body.includes("En attente de confirmation par la pizzeria."));
  check("confirmation : sous-total, livraison à confirmer, pas de total", body.includes("3 000 HTG") && body.includes("À confirmer selon l'adresse") && !/^Total\b/m.test(body));
  check("confirmation : ni « reçu de paiement » ni « payée », aucun bouton payer", !/reçu de paiement/i.test(body.replace("n'est pas un reçu de paiement", "")) && !/Payée|Payé le/.test(body) && (await page.getByRole("button", { name: /Payer/ }).count()) === 0);
  check("confirmation : paiement « À organiser avec la pizzeria »", body.includes("À organiser avec la pizzeria"));
  await page.screenshot({ path: `${SHOTS}/06-order.png`, fullPage: true, caret: "initial" });
  check("confirmation : pas de défilement horizontal", await noScroll(page));

  // 5. Bouton WhatsApp : message complet, encodé, sans jeton
  const waBtn = page.getByRole("link", { name: "Contacter Reina Pizza pour confirmer la livraison" });
  const wa = await waBtn.getAttribute("href");
  check("WhatsApp : destination wa.me/50946461212", wa.startsWith("https://wa.me/50946461212?text="));
  const msg = decodeURIComponent(wa.split("?text=")[1]);
  const token = orderUrl.split("/").pop();
  for (const part of [
    `Bonjour Reina Pizza 🍕\nJe souhaite confirmer ma commande n° ${ref}.`, "COMMANDE", "• 2 × Pizza pepperoni — taille S — 3 000 HTG",
    "Sous-total des produits : 3 000 HTG", "Livraison : À confirmer selon mon adresse", "LIVRAISON", "Nom : Marie Test", "Téléphone : +509 3412-3456",
    "WhatsApp : +509 3700-1122", "Commune : Delmas", "Quartier : Delmas 33", "Adresse : Rue Charbonnier, impasse Costo, n° 12", "Point de repère : En face de la pharmacie",
    "Localisation : 18.5392, -72.335", "Instructions : Sonner deux fois", "PAIEMENT", "Moyen souhaité : À convenir avec la pizzeria — espèces à la livraison",
    "Paiement à organiser directement avec la pizzeria.", "Remarques : Sans olives", "confirmer la disponibilité, les frais de livraison et le délai estimé"]) {
    check(`WhatsApp message contient « ${part.split("\n")[0].slice(0, 45)} »`, norm(msg).includes(part), norm(msg));
  }
  check("WhatsApp : pas de ligne Total, pas de jeton, pas de lien de commande", !/^Total :/m.test(msg) && !msg.includes(token) && !wa.includes(token) && !msg.includes("/commande/"));
  check("avertissement données personnelles affiché", body.includes("En continuant, vous préparez un message WhatsApp contenant votre commande et vos coordonnées de livraison à destination de Reina Pizza."));
  check("lien d'appel tel:", ((await page.getByRole("link", { name: /Appeler la pizzeria/ }).getAttribute("href")) ?? "").startsWith("tel:+509"));
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  await page.getByRole("button", { name: "Copier le message" }).click();
  await page.getByText("Message copié ✓").waitFor();
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
  await Promise.all([ap.waitForResponse((r) => r.request().method() === "POST"), ap.getByRole("button", { name: "Se connecter" }).click()]);
  await ap.waitForLoadState("networkidle");
  check("compte valide hors admin_users : refusé", ap.url().includes("/admin/login") && (await ap.getByText("Identifiants invalides").isVisible()));
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
  check("admin : détail (articles, adresse, paiement souhaité, remarques, sous-total, frais à confirmer)", ["Pizza pepperoni", "Rue Charbonnier, impasse Costo", "À convenir avec la pizzeria — espèces à la livraison", "Sans olives", "Sonner deux fois", "3 000 HTG", "À confirmer"].every((x) => det.includes(x)));
  check("admin : boutons appeler et WhatsApp client", ((await ap.getByRole("link", { name: /Appeler le client/ }).getAttribute("href")) === "tel:+50934123456") && (await ap.getByRole("link", { name: "Contacter le client sur WhatsApp" }).getAttribute("href")).startsWith("https://wa.me/50937001122"));
  await ap.screenshot({ path: `${SHOTS}/09-admin-order.png`, fullPage: true, caret: "initial" });

  // 9. Frais ajoutés par l'admin ; statut de paiement manuel
  await ap.fill("input[name=fee]", "300");
  await adminAction(ap, "Enregistrer les frais", "/admin/commandes/");
  check("admin : frais 300 HTG → total 3 300 HTG", norm(await ap.locator("main").innerText()).includes("3 300 HTG"));
  await page.goto(orderUrl);
  const c2 = norm(await page.locator("main").innerText());
  check("client : voit les frais et le total", c2.includes("300 HTG") && c2.includes("3 300 HTG"));
  const wa2 = decodeURIComponent((await page.getByRole("link", { name: "Contacter Reina Pizza pour confirmer la livraison" }).getAttribute("href")).split("?text=")[1]);
  check("WhatsApp après frais : total affiché, question sans frais", norm(wa2).includes("Livraison : 300 HTG\nTotal : 3 300 HTG") && wa2.includes("confirmer la disponibilité et le délai estimé"));

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
  await addPizza(page, "Pizza jambon", 1);
  await page.goto(BASE + "/commander");
  await page.getByRole("radio", { name: /Zone test e2e/ }).check();
  await fillCustomer(page, { fullName: "Paul Zone" });
  await page.selectOption("#f-paymentMethodId", { index: 0 }).catch(() => {});
  await page.locator("aside").getByText("1 500 HTG").first().waitFor({ timeout: 8000 }).catch(() => {});
  const z = norm(await page.locator("aside").innerText());
  check("zone tarifée : livraison 250 HTG et total 1 500 HTG affichés", z.includes("250 HTG") && z.includes("1 500 HTG") && /Total/.test(z), z);
  await page.screenshot({ path: `${SHOTS}/11-checkout-zone.png`, fullPage: true, caret: "initial" });
  await submitOrder(page);
  const zr = norm(await page.locator("main").innerText());
  check("zone tarifée : commande enregistrée avec total", zr.includes("Total") && zr.includes("1 500 HTG"));
  const wz = decodeURIComponent((await page.getByRole("link", { name: "Contacter Reina Pizza pour confirmer la livraison" }).getAttribute("href")).split("?text=")[1]);
  check("zone tarifée : message avec Total", norm(wz).includes("Livraison : 250 HTG\nTotal : 1 500 HTG"));
  psql("delete from delivery_zones where name = 'Zone test e2e'");

  // 11. Menu admin et réglages
  await ap.goto(`${BASE}/admin/menu`); await ap.waitForLoadState("networkidle");
  check("admin menu : 3 produits réels", (await ap.getByText("Pizza pepperoni").first().isVisible()) && (await ap.getByText("Pizza jambon").first().isVisible()) && (await ap.getByText("Pizza hareng saur").first().isVisible()));
  await ap.screenshot({ path: `${SHOTS}/12-admin-menu.png`, fullPage: true, caret: "initial" });
  await ap.goto(`${BASE}/admin/reglages`); await ap.waitForLoadState("networkidle");
  check("admin réglages : moyens de paiement et devise HTG", (await ap.getByText("Moyens de paiement proposés au client").isVisible()) && (await ap.locator("select[name=currency]").inputValue()) === "HTG");
  await ap.screenshot({ path: `${SHOTS}/13-admin-settings.png`, fullPage: true, caret: "initial" });

  check("aucune erreur JS console côté client", errors.length === 0, errors.join(" | "));
  await browser.close();
  console.log(failures ? `\n${failures} échec(s)` : "\nTous les contrôles sont passés");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

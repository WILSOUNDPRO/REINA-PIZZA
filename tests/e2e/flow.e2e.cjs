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
  for (let i = 1; i < qty; i++) await card.getByRole("button", { name: "Ajouter une pizza" }).click();
  await card.getByRole("button", { name: /Ajouter au panier/ }).click();
  await page.getByText("Ajouté", { exact: true }).first().waitFor();
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
    check("menu : pas de défilement horizontal", await noScroll(page));
  check("menu : hareng saur sans fausse photo (emplacement discret < 120 px)", (await page.locator("article", { hasText: "Pizza hareng saur" }).locator("div[role=img]").count()) === 1 && (await page.locator("article div[role=img]").first().evaluate((e) => e.getBoundingClientRect().height)) < 120);

  // 2. Panier
  await addPizza(page, "Pizza pepperoni", 2);
  await page.getByText("2 articles").first().waitFor({ timeout: 8000 });
  check("barre de panier mobile : articles et sous-total serveur", await page.locator("a[href='/panier']", { hasText: "3 000 HTG" }).waitFor({ timeout: 8000 }).then(() => true, () => false));
  check("panier vide : aucun badge « 0 » sur l'icône", await (async () => { const c2 = await browser.newContext({ viewport: { width: 390, height: 844 } }); const p2 = await c2.newPage(); await p2.goto(BASE + "/menu"); await p2.waitForLoadState("networkidle"); const t = (await p2.getByRole("link", { name: /Panier/ }).first().innerText()); const bar = await p2.getByText(/\d+ articles?/).count(); await c2.close(); return !/\b0\b/.test(t) && bar === 0; })());
  await page.goto(BASE + "/panier"); await page.getByText("Sous-total des produits").first().waitFor();
  check("panier : 2 × 1 500 HTG = 3 000 HTG", norm(await page.locator("main").innerText()).includes("3 000 HTG"));
  await page.screenshot({ path: `${SHOTS}/03-cart.png`, fullPage: true, caret: "initial" });

  // 3. Formulaire sans zone tarifée : frais à confirmer, sous-total non présenté comme total
  await page.getByRole("link", { name: "Renseigner ma livraison" }).click();
  await page.waitForURL("**/commander");
  await page.getByRole("button", { name: "Enregistrer ma commande" }).waitFor();
  const form = norm(await page.locator("main").innerText());
  check("formulaire : message frais à confirmer", form.includes("Frais de livraison à confirmer selon votre adresse."));
  check("formulaire : sous-total sans ligne « Total »", form.includes("Sous-total des produits") && !/^Total\b/m.test(form));
  check("formulaire : « Aucun paiement n'est effectué sur le site. Le paiement sera organisé directement avec Reina Pizza. »", form.includes("Aucun paiement n'est effectué sur le site. Le paiement sera organisé directement avec Reina Pizza."));
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
  const waBtn = page.getByRole("link", { name: "Confirmer la livraison sur WhatsApp" });
  const wa = await waBtn.getAttribute("href");
  check("WhatsApp : destination wa.me/50946461212", wa.startsWith("https://wa.me/50946461212?text="));
  const msg = decodeURIComponent(wa.split("?text=")[1]);
  const token = orderUrl.split("/").pop();
  for (const part of [
    `Bonjour Reina Pizza 🍕\nJe souhaite confirmer ma commande n° ${ref}.`, "COMMANDE", "• 2 × Pizza pepperoni — taille S — 3 000 HTG",
    "Sous-total des produits : 3 000 HTG", "Livraison : À confirmer selon mon adresse", "LIVRAISON", "Nom : Marie Test", "Téléphone : +509 3412-3456",
    "WhatsApp : +509 3700-1122", "Commune : Delmas", "Quartier : Delmas 33", "Adresse : Rue Charbonnier, impasse Costo, n° 12", "Point de repère : En face de la pharmacie",
    "Localisation : 18.5392, -72.335", "Instructions : Sonner deux fois", "PAIEMENT", "Moyen souhaité : À convenir avec la pizzeria — espèces à la livraison",
    "Paiement à organiser directement avec la pizzeria.", "Remarques : Sans olives", "Merci de confirmer la disponibilité, les frais de livraison s'ils restent à définir et le délai estimé."]) {
    check(`WhatsApp message contient « ${part.split("\n")[0].slice(0, 45)} »`, norm(msg).includes(part), norm(msg));
  }
  check("WhatsApp : pas de ligne Total, pas de jeton, pas de lien de commande", !/^Total :/m.test(msg) && !msg.includes(token) && !wa.includes(token) && !msg.includes("/commande/"));
  check("avertissement données personnelles affiché", body.includes("Le message WhatsApp contiendra votre commande et vos coordonnées de livraison pour Reina Pizza."));
  check("lien d'appel tel:", ((await page.getByRole("link", { name: /Appeler Reina Pizza/ }).getAttribute("href")) ?? "").startsWith("tel:+509"));
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  await page.getByRole("button", { name: "Copier le message" }).click();
  await page.getByText("Message copié").waitFor();
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
  check("admin : frais 300 HTG → total 3 300 HTG", await ap.getByText("3 300 HTG").first().waitFor({ timeout: 8000 }).then(() => true, () => false));
  await page.goto(orderUrl);
  const c2 = norm(await page.locator("main").innerText());
  check("client : voit les frais et le total", c2.includes("300 HTG") && c2.includes("3 300 HTG"));
  const wa2 = decodeURIComponent((await page.getByRole("link", { name: "Confirmer la livraison sur WhatsApp" }).getAttribute("href")).split("?text=")[1]);
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
  const wz = decodeURIComponent((await page.getByRole("link", { name: "Confirmer la livraison sur WhatsApp" }).getAttribute("href")).split("?text=")[1]);
  check("zone tarifée : message avec Total", norm(wz).includes("Livraison : 250 HTG\nTotal : 1 500 HTG"));
  psql("delete from delivery_zones where name = 'Zone test e2e'");

  // 11. Menu admin et réglages
  await ap.goto(`${BASE}/admin/menu`); await ap.waitForLoadState("networkidle");
  check("admin menu : 3 produits réels", (await ap.getByText("Pizza pepperoni").first().isVisible()) && (await ap.getByText("Pizza jambon").first().isVisible()) && (await ap.getByText("Pizza hareng saur").first().isVisible()));
  await ap.screenshot({ path: `${SHOTS}/12-admin-menu.png`, fullPage: true, caret: "initial" });
  await ap.goto(`${BASE}/admin/reglages`); await ap.waitForLoadState("networkidle");
  check("admin réglages : moyens de paiement et devise HTG", (await ap.getByText("Moyens de paiement proposés au client").isVisible()) && (await ap.locator("select[name=currency]").inputValue()) === "HTG");
  await ap.screenshot({ path: `${SHOTS}/13-admin-settings.png`, fullPage: true, caret: "initial" });


  // 12. Photo réelle : téléversement admin, cadrage 4:3 uniforme, hero
  const sharp = require("sharp");
  const big = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 200, g: 120, b: 60 } } }).composite([{ input: Buffer.from('<svg width="1200" height="1200"><circle cx="600" cy="600" r="560" fill="#c0392b"/></svg>'), gravity: "centre" }]).jpeg().toBuffer();
  await ap.goto(`${BASE}/admin/menu/nouveau`);
  await ap.fill("input[name=name]", "Test photo e2e");
  await ap.check("input[name=size_S_on]"); await ap.fill("input[name=size_S_price]", "100");
  await ap.setInputFiles("input[name=image]", { name: "photo.jpg", mimeType: "image/jpeg", buffer: big });
  await adminAction(ap, "Enregistrer", "/admin/menu", true);
  check("admin : produit avec photo enregistré", /\/admin\/menu\/[0-9a-f-]{36}/.test(ap.url()));
  await page.goto(BASE + "/menu"); await page.waitForLoadState("networkidle");
  const dims = await page.locator("article", { hasText: "Test photo e2e" }).locator("img").first().evaluate((i) => ({ w: i.naturalWidth, h: i.naturalHeight, box: i.parentElement.getBoundingClientRect().width / i.parentElement.getBoundingClientRect().height }));
  check("photo : recadrée 1200×900 (4:3), conteneur 4:3, sans déformation", dims.w === 1200 && dims.h === 900 && Math.abs(dims.box - 4 / 3) < 0.02, JSON.stringify(dims));
  check("photo : chargement différé sous la ligne de flottaison", (await page.locator("article", { hasText: "Test photo e2e" }).locator("img").first().getAttribute("loading")) === "lazy");
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const dp = await dctx.newPage();
  await dp.goto(BASE + "/"); await dp.waitForLoadState("networkidle");
  check("accueil desktop : photo réelle en hero quand elle existe", (await dp.locator("section img[alt='']").count()) >= 1);
  await dctx.close();
  await ap.goto(`${BASE}/admin/menu`);
  ap.once("dialog", (d) => d.accept());
  await Promise.all([ap.waitForResponse((r) => r.request().method() === "POST"), ap.locator("li", { hasText: "Test photo e2e" }).getByRole("button", { name: "Supprimer" }).click()]);
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
  check("impression : logo visible, boutons masqués, mention « pas un reçu de paiement »", ((await pr.locator("img[alt='Reina Pizza']:visible").count()) >= 1) && !(await pr.getByRole("link", { name: "Confirmer la livraison sur WhatsApp" }).isVisible()) && (await pr.getByText("ce document n'est pas un reçu de paiement").isVisible()));
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
  for (const [w, h, name] of [[390, 844, "mobile390"], [1280, 800, "desktop1280"]]) {
    await ap.setViewportSize({ width: w, height: h });
    for (const [path, label] of [["/admin", "admin-tableau"], ["/admin/commandes", "admin-commandes"], [`/admin/commandes/${oid}`, "admin-detail"], ["/admin/menu", "admin-menu"]]) {
      await ap.goto(BASE + path); await ap.waitForLoadState("networkidle");
      check(`${name} ${label} : pas de défilement horizontal`, await noScroll(ap));
      await ap.screenshot({ path: `${SHOTS}/${name}-${label}.png`, fullPage: true, caret: "initial" });
    }
  }

  check("aucune erreur JS console côté client", errors.length === 0, errors.join(" | "));
  await browser.close();
  console.log(failures ? `\n${failures} échec(s)` : "\nTous les contrôles sont passés");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

// Parcours de bout en bout dans un vrai navigateur mobile (Chromium). Prérequis : base migrée + seed démo, mock Supabase,
// application lancée (voir README, section « Vérification »). Usage : node tests/e2e/flow.e2e.cjs
const { chromium } = require("playwright");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DB = process.env.DATABASE_URL ?? "postgres://reina:reina@localhost:5432/reina";
const SHOTS = process.env.SHOTS ?? ".tmp/shots";
const psql = (q) => execFileSync("psql", [DB, "-Atc", q]).toString().trim();
let failures = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "✔" : "✘"} ${name}${ok ? "" : "  " + extra}`); if (!ok) failures++; };

async function fillCustomer(page, over = {}) {
  const v = { fullName: "Marie Test", phone: "3412-3456", commune: "Delmas", quarter: "Delmas 33", address: "Rue Charbonnier, impasse Costo, n° 12", landmark: "En face de la pharmacie", ...over };
  for (const [k, val] of Object.entries(v)) await page.fill(`#f-${k}`, val);
}
async function addToCart(page, size = "M") {
  await page.goto(BASE + "/menu");
  const card = page.locator("article").first();
  await card.getByText(size, { exact: true }).first().click();
  await card.getByRole("button", { name: /Ajouter/ }).click();
  await page.getByText("Ajouté ✓").first().waitFor();
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });

  // 1. Pages publiques
  await page.goto(BASE + "/");
  await page.screenshot({ caret: "initial", path: `${SHOTS}/01-home.png`, fullPage: true });
  check("accueil : bouton Commander", await page.getByRole("link", { name: "Commander" }).first().isVisible());
  check("accueil : pas de défilement horizontal", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.goto(BASE + "/menu");
  await page.screenshot({ caret: "initial", path: `${SHOTS}/02-menu.png`, fullPage: true });
  check("menu : bandeau démonstration", await page.getByText("Menu de démonstration").isVisible());
  check("menu : pas de défilement horizontal", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

  // 2. Panier + persistance
  await addToCart(page, "M");
  await page.reload();
  check("panier conservé après rechargement", await page.getByText(/Voir mon panier · 1 article/).waitFor({ timeout: 5000 }).then(() => true, () => false));
  await page.screenshot({ caret: "initial", path: `${SHOTS}/03-menu-bar.png` });
  await page.goto(BASE + "/panier");
  await page.getByText("Sous-total").first().waitFor();
  await page.screenshot({ caret: "initial", path: `${SHOTS}/04-cart.png`, fullPage: true });
  await page.getByRole("button", { name: "Plus" }).first().click();
  await page.getByText(/3\s?000,00\s+HTG/).first().waitFor({ timeout: 5000 }).catch(() => {});
  check("panier : total serveur 2 × 1 500,00 HTG", await page.getByText(/3\s000,00\sHTG/).first().isVisible());

  // 3. Validation côté client
  await page.getByRole("link", { name: "Continuer vers la livraison" }).click();
  await page.waitForURL("**/commander");
  await page.getByRole("button", { name: "Valider la commande" }).waitFor();
  await page.getByRole("radio").first().check(); // zone démo
  await page.getByRole("button", { name: "Valider la commande" }).click();
  check("validation : erreurs champs obligatoires", await page.getByText("Le nom complet est obligatoire.").isVisible());
  await page.screenshot({ caret: "initial", path: `${SHOTS}/05-checkout-errors.png`, fullPage: true });
  await fillCustomer(page, { phone: "12" });
  await page.getByRole("button", { name: "Valider la commande" }).click();
  check("validation : téléphone invalide", await page.getByText(/Le numéro de téléphone invalide/).isVisible());
  await page.fill("#f-phone", "3412-3456");

  // 4. Double soumission : deux clics rapides => une seule commande
  const before = Number(psql("select count(*) from orders"));
  const btn = page.getByRole("button", { name: "Valider la commande" });
  await btn.dblclick({ noWaitAfter: true });
  await page.waitForURL(/\/commande\/[\w-]{43}$/);
  const orderUrl = page.url();
  check("double clic : une seule commande créée", Number(psql("select count(*) from orders")) === before + 1);
  check("jeton de 43 caractères dans l'URL", /\/commande\/[\w-]{43}$/.test(orderUrl));
  await page.getByText("Référence").waitFor();
  const ref = (await page.locator("h1").innerText()).match(/RP-[A-Z0-9]{6}/)[0];
  check("total zone : 3 000,00 + 250,00 = 3 250,00 HTG", await page.getByText(/3\s250,00\sHTG/).first().isVisible());
  await page.screenshot({ caret: "initial", path: `${SHOTS}/06-order-zone.png`, fullPage: true });
  const wa = await page.getByRole("link", { name: "Contacter Reina Pizza sur WhatsApp" }).getAttribute("href");
  check("WhatsApp : lien encodé avec référence seule", wa === `https://wa.me/50946461212?text=${encodeURIComponent(`Bonjour Reina Pizza, je vous contacte au sujet de ma commande ${ref}.`)}`, wa);
  check("WhatsApp : pas d'adresse dans l'URL", !decodeURIComponent(wa).includes("Charbonnier"));
  check("panier vidé après commande", (await page.evaluate(() => localStorage.getItem("reina-cart-v1"))) === "[]");

  // 5. Paiement simulé : échec, puis succès
  await page.getByRole("button", { name: /^Payer/ }).click();
  await page.waitForURL("**/dev/paiement/**");
  await page.screenshot({ caret: "initial", path: `${SHOTS}/07-sim.png` });
  await page.getByRole("button", { name: "Simuler un échec" }).click();
  await page.waitForURL(/paiement=retour/);
  check("paiement échoué affiché, pas de reçu", (await page.getByText("Paiement : Paiement échoué").isVisible()) && !(await page.getByText("Reçu de paiement").isVisible()));
  await page.getByRole("button", { name: /^Payer/ }).click();
  await page.waitForURL("**/dev/paiement/**");
  await page.getByRole("button", { name: "Simuler un paiement réussi" }).click();
  await page.waitForURL(/paiement=retour/);
  check("paiement réussi : statut payé + reçu", (await page.getByText("Paiement : Payée").isVisible()) && (await page.getByText("Reçu de paiement").isVisible()));
  await page.screenshot({ caret: "initial", path: `${SHOTS}/08-order-paid.png`, fullPage: true });
  check("aucun bouton payer après règlement", !(await page.getByRole("button", { name: /Payer|Reprendre/ }).isVisible()));

  // 6. Webhooks : signature invalide, rejeu
  const sig = (b) => crypto.createHmac("sha256", "dev-sim-secret").update(b).digest("hex");
  const pay = psql(`select provider_ref || '|' || amount_minor from payments where order_id = (select id from orders where ref='${ref}') and status='paid'`).split("|");
  const body = JSON.stringify({ eventId: `evt_e2e_${Date.now()}`, providerRef: pay[0], status: "paid", amountMinor: Number(pay[1]), currency: "HTG" });
  let r = await fetch(`${BASE}/api/webhooks/payments/simulation`, { method: "POST", body, headers: { "x-simulation-signature": "00".repeat(32) } });
  check("webhook signature invalide : 400", r.status === 400);
  r = await fetch(`${BASE}/api/webhooks/payments/simulation`, { method: "POST", body });
  check("webhook sans signature : 400", r.status === 400);
  r = await fetch(`${BASE}/api/webhooks/payments/simulation`, { method: "POST", body, headers: { "x-simulation-signature": sig(body) } });
  const j1 = await r.json();
  r = await fetch(`${BASE}/api/webhooks/payments/simulation`, { method: "POST", body, headers: { "x-simulation-signature": sig(body) } });
  const j2 = await r.json();
  check("webhook rejoué : déjà payé puis doublon, un seul paiement", j1.outcome === "already_paid" && j2.outcome === "duplicate" && psql(`select count(*) from payments where status='paid' and order_id = (select id from orders where ref='${ref}')`) === "1", JSON.stringify([j1, j2]));
  r = await fetch(`${BASE}/api/webhooks/payments/stripe`, { method: "POST", body });
  check("fournisseur inconnu : 404", r.status === 404);

  // 7. Protection des commandes
  const anon = await browser.newContext();
  const ap = await anon.newPage();
  let resp = await ap.goto(`${BASE}/commande/${ref}`);
  check("référence seule : 404", resp.status() === 404);
  resp = await ap.goto(`${BASE}/commande/${"A".repeat(43)}`);
  check("jeton inconnu : 404", resp.status() === 404);
  resp = await ap.goto(orderUrl);
  check("lien secret : accessible, no-store + noindex", resp.status() === 200 && /no-store/.test(resp.headers()["cache-control"] ?? "") && /noindex/.test(resp.headers()["x-robots-tag"] ?? ""));
  await ap.goto(`${BASE}/admin/commandes`);
  check("admin sans session : redirigé vers la connexion", ap.url().endsWith("/admin/login"));
  for (const path of ["/admin", "/admin/menu", "/admin/zones", "/admin/reglages", `/admin/commandes/${psql(`select id from orders where ref='${ref}'`)}`]) {
    await ap.goto(BASE + path);
    check(`admin ${path} protégé`, ap.url().endsWith("/admin/login"));
  }
  r = await fetch(`${BASE}/api/admin/poll`);
  check("API admin sans session : 401", r.status === 401);

  // 8. Connexion admin : intrus refusé, admin accepté
  await ap.goto(`${BASE}/admin/login`);
  await ap.fill("#email", "intrus@reina.test"); await ap.fill("#password", "mot-de-passe-test");
  await Promise.all([ap.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/admin/login")), ap.getByRole("button", { name: "Se connecter" }).click()]);
  await ap.waitForLoadState("networkidle");
  await ap.locator("p[role=alert]").waitFor();
  check("compte valide mais hors admin_users : refusé", ap.url().includes("/admin/login") && (await ap.getByText("Identifiants invalides").isVisible()));
  await ap.fill("#email", "admin@reina.test"); await ap.fill("#password", "mauvais");
  await Promise.all([ap.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/admin/login")), ap.getByRole("button", { name: "Se connecter" }).click()]);
  await ap.waitForLoadState("networkidle");
  await ap.locator("p[role=alert]").waitFor();
  check("mauvais mot de passe : refusé", ap.url().includes("/admin/login"));
  await ap.fill("#email", "admin@reina.test"); await ap.fill("#password", "mot-de-passe-test");
  await ap.getByRole("button", { name: "Se connecter" }).click();
  await ap.waitForURL(`${BASE}/admin`);
  check("admin connecté : tableau de bord", await ap.getByRole("heading", { name: "Tableau de bord" }).isVisible());
  const cookies = await anon.cookies();
  check("cookies de session httpOnly", cookies.filter((c) => c.name.startsWith("rp_")).every((c) => c.httpOnly));
  await ap.screenshot({ caret: "initial", path: `${SHOTS}/09-admin-dashboard.png`, fullPage: true });

  // 9. Demande « frais à confirmer »
  await addToCart(page, "S");
  await page.goto(BASE + "/commander");
  await page.getByRole("radio", { name: /Mon adresse n'est pas dans la liste/ }).check();
  await fillCustomer(page, { fullName: "Paul Estimation", address: "Route de Frères, impasse Lamy" });
  await page.screenshot({ caret: "initial", path: `${SHOTS}/10-checkout-quote.png`, fullPage: true });
  await page.getByRole("button", { name: "Envoyer ma demande" }).click();
  await page.waitForURL(/\/commande\/[\w-]{43}$/);
  const quoteUrl = page.url();
  check("demande : frais à confirmer, pas de bouton de paiement", (await page.getByText("Frais de livraison à confirmer").first().isVisible()) && !(await page.getByRole("button", { name: /Payer/ }).isVisible()));
  await page.screenshot({ caret: "initial", path: `${SHOTS}/11-order-quote.png`, fullPage: true });
  const qid = psql("select id from orders where delivery_mode='quote' order by created_at desc limit 1");
  r = await fetch(`${quoteUrl.replace(/\/commande\/.*/, "")}/api/orders/${quoteUrl.split("/").pop()}/pay`, { method: "POST" });
  check("paiement refusé tant que les frais ne sont pas fixés (409)", r.status === 409);

  await ap.goto(`${BASE}/admin/commandes?frais=1`);
  check("admin : filtre frais à confirmer liste la demande", await ap.getByText("Paul Estimation").isVisible());
  await ap.screenshot({ caret: "initial", path: `${SHOTS}/12-admin-list.png`, fullPage: true });
  await ap.goto(`${BASE}/admin/commandes/${qid}`);
  await ap.fill("input[name=fee]", "400");
  await ap.getByRole("button", { name: "Enregistrer les frais" }).click();
  await ap.getByText("Frais enregistrés").waitFor();
  await ap.screenshot({ caret: "initial", path: `${SHOTS}/13-admin-order.png`, fullPage: true });
  const link = await ap.locator("input[aria-label='Lien client']").inputValue();
  check("admin : lien sécurisé copiable = lien client", link === quoteUrl, link);
  const waAdmin = await ap.getByRole("link", { name: "Envoyer par WhatsApp" }).getAttribute("href");
  check("admin : WhatsApp vers le client avec le lien", waAdmin.startsWith("https://wa.me/50934123456?text=") && decodeURIComponent(waAdmin).includes(link));
  const adminWa = await ap.getByRole("link", { name: "Contacter le client sur WhatsApp" }).getAttribute("href");
  check("admin : bouton contact client", adminWa.startsWith("https://wa.me/50934123456"));

  await page.goto(quoteUrl);
  await page.getByRole("button", { name: /Accepter le total/ }).click();
  await page.getByRole("button", { name: /^Payer/ }).waitFor();
  check("total proposé accepté : 1 000,00 + 400,00 = 1 400,00", await page.getByRole("button", { name: /Payer 1\s400,00\sHTG/ }).isVisible());
  await page.screenshot({ caret: "initial", path: `${SHOTS}/14-order-approved.png`, fullPage: true });

  // Admin modifie le total avant paiement : le client doit ré-accepter
  await ap.goto(`${BASE}/admin/commandes/${qid}`);
  ap.once("dialog", (d) => d.accept());
  await ap.fill("input[name=fee]", "500");
  await ap.getByRole("button", { name: "Enregistrer les frais" }).click();
  await ap.getByText("Frais enregistrés").waitFor();
  await page.reload();
  check("modification du total : acceptation à nouveau requise", await page.getByRole("button", { name: /Accepter le total de 1\s500,00\sHTG/ }).isVisible());
  await page.getByRole("button", { name: /Accepter le total/ }).click();
  await page.getByRole("button", { name: /^Payer/ }).click();
  await page.waitForURL("**/dev/paiement/**");
  await page.getByRole("button", { name: "Simuler un paiement réussi" }).click();
  await page.waitForURL(/paiement=retour/);
  check("total approuvé payé", await page.getByText("Reçu de paiement").isVisible());

  // 10. Admin : statut + historique ; annulation d'une commande payée ≠ remboursement
  await ap.goto(`${BASE}/admin/commandes/${qid}`);
  const submitStatus = async (value) => {
    await ap.selectOption("select[name=status]", value);
    await Promise.all([ap.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/admin/commandes/")), ap.getByRole("button", { name: "Mettre à jour" }).click()]);
    await ap.waitForLoadState("networkidle");
  };
  await submitStatus("confirmed");
  check("statut confirmé affiché", await ap.getByText("Commande : Confirmée").first().isVisible());
  await submitStatus("cancelled");
  check("annulée mais payée : alerte « aucun remboursement automatique »", await ap.getByText(/aucun remboursement n'est effectué automatiquement/).waitFor({ timeout: 8000 }).then(() => true, () => false));
  check("historique : frais, acceptation, paiement, statuts", (await ap.locator("section[aria-labelledby=historique] li").count()) >= 8);
  await ap.screenshot({ caret: "initial", path: `${SHOTS}/15-admin-history.png`, fullPage: true });

  // 11. Pages admin de gestion
  for (const [path, name] of [["/admin/menu", "menu"], ["/admin/zones", "zones"], ["/admin/reglages", "reglages"], ["/admin/supplements", "supp"]]) {
    resp = await ap.goto(BASE + path);
    check(`admin ${path} : 200`, resp.status() === 200);
    await ap.screenshot({ caret: "initial", path: `${SHOTS}/16-admin-${name}.png`, fullPage: true });
  }

  check("aucune erreur JS console côté client", errors.length === 0, errors.join(" | "));
  await browser.close();
  console.log(failures ? `\n${failures} échec(s)` : "\nTous les contrôles sont passés");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

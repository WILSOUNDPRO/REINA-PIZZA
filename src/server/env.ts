// Accès centralisé à l'environnement. Les secrets ne sont lus que côté serveur (ce dossier n'est jamais importé par du code client).
export const isProd = () => process.env.NODE_ENV === "production";

export function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variable d'environnement manquante : ${name}`);
  return v;
}

export const env = {
  databaseUrl: () => required("DATABASE_URL"),
  siteUrl: () => (process.env.SITE_URL ?? "").replace(/\/$/, ""),
  supabaseUrl: () => (process.env.SUPABASE_URL ?? "").replace(/\/$/, ""),
  supabaseAnonKey: () => process.env.SUPABASE_ANON_KEY ?? "",
  supabaseServiceKey: () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  rateLimitSalt: () => process.env.RATE_LIMIT_SALT ?? "dev-only-salt",
  // Version 1 : aucun paiement en ligne. L'architecture est conservée mais désactivée tant que ce drapeau n'est pas "true".
  onlinePaymentsEnabled: () => process.env.ONLINE_PAYMENTS_ENABLED === "true",
  paymentProvider: () => (process.env.PAYMENT_PROVIDER ?? "none").toLowerCase(),
  // Les commandes contenant des produits de démonstration ne sont acceptées qu'en développement,
  // sauf demande explicite.
  allowDemoOrders: () => (process.env.ALLOW_DEMO_ORDERS ?? (isProd() ? "false" : "true")) === "true",
  emailEnabled: () => Boolean(process.env.EMAIL_PROVIDER),
};

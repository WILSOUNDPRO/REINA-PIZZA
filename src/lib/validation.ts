import { z } from "zod";
import { MAX_CART_LINES, MAX_LINE_QUANTITY, SIZES } from "./constants";
import { normalizePhone } from "./phone";
import { normalizeLocation } from "./location";

// Retire les caractères de contrôle et normalise les espaces.
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();

const text = (label: string, min: number, max: number) =>
  z
    .string({ error: `${label} : champ requis.` })
    .transform(clean)
    .pipe(
      z
        .string()
        .min(1, `${label} est obligatoire.`)
        .min(min, `${label} : au moins ${min} caractères.`)
        .max(max, `${label} : ${max} caractères maximum.`),
    );

const optionalText = (label: string, max: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? clean(v) : ""))
    .pipe(z.string().max(max, `${label} : ${max} caractères maximum.`))
    .transform((v) => v || undefined);

const phoneField = (label: string) =>
  z
    .string({ error: `${label} est obligatoire.` })
    .transform((v, ctx) => {
      const n = normalizePhone(v);
      if (!n) {
        ctx.issues.push({ code: "custom", message: `${label} invalide. Exemple : 4646-1212 ou +509 4646-1212.`, input: v });
        return z.NEVER;
      }
      return n;
    });

const optionalPhone = (label: string) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v || !v.trim()) return undefined;
      const n = normalizePhone(v);
      if (!n) {
        ctx.issues.push({ code: "custom", message: `${label} invalide. Exemple : 4646-1212 ou +509 4646-1212.`, input: v });
        return z.NEVER;
      }
      return n;
    });

export const cartItemSchema = z.object({
  productId: z.guid(),
  size: z.enum(SIZES).optional(),
  variantId: z.guid().optional(),
  quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY),
  extraIds: z.array(z.guid()).max(10).default([]),
});
export type CartItemInput = z.infer<typeof cartItemSchema>;

export const cartSchema = z.object({ items: z.array(cartItemSchema).min(1).max(MAX_CART_LINES) });

export const customerSchema = z.object({
  fullName: text("Le nom complet", 2, 100),
  phone: phoneField("Le numéro de téléphone"),
  whatsapp: optionalPhone("Le numéro WhatsApp"),
  email: z
    .string()
    .optional()
    .transform((v) => (v ? clean(v) : ""))
    .pipe(z.union([z.literal(""), z.string().max(150).pipe(z.email("Adresse e-mail invalide."))]))
    .transform((v) => v || undefined),
  commune: text("La commune", 2, 80),
  quarter: text("Le quartier ou la zone", 2, 100),
  address: text("L'adresse précise", 5, 250),
  landmark: text("Le point de repère", 3, 250),
  gps: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v || !v.trim()) return undefined;
      const n = normalizeLocation(v);
      if (!n) {
        ctx.issues.push({
          code: "custom",
          message: "Position invalide : saisissez « latitude, longitude » ou un lien Google Maps / OpenStreetMap / Waze.",
          input: v,
        });
        return z.NEVER;
      }
      return n;
    }),
  deliveryInstructions: optionalText("Les instructions", 500),
  notes: optionalText("Les remarques", 500),
});

export const checkoutSchema = z
  .object({
    items: cartSchema.shape.items,
    deliveryMode: z.enum(["zone", "quote"], { error: "Choisissez un mode de livraison." }),
    zoneId: z.guid().optional(),
    // Total (zone tarifée) affiché au client : refusé si les prix ont changé entre-temps.
    expectedTotalMinor: z.number().int().min(0).optional(),
    idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,100}$/),
    website: z.string().optional(), // honeypot : doit rester vide
    paymentMethodId: z.guid({ error: "Choisissez le moyen de paiement souhaité." }),
    paymentMethodNote: optionalText("La précision sur le moyen de paiement", 200),
    customer: customerSchema,
  })
  .superRefine((v, ctx) => {
    if (v.deliveryMode === "zone" && !v.zoneId) {
      ctx.addIssue({ code: "custom", path: ["zoneId"], message: "Choisissez votre zone de livraison." });
    }
  });
export type CheckoutInput = z.infer<typeof checkoutSchema>;

/** Aplatit les erreurs zod en { "customer.phone": "message" }. */
export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) {
    const key = i.path.join(".");
    if (!(key in out)) out[key] = i.message;
  }
  return out;
}

import type { Sql } from "./db";

export type PaymentMethod = {
  id: string;
  label: string;
  enabled: boolean;
  position: number;
  instructions: string | null;
  recipient_account: string | null;
  recipient_name: string | null;
};

export type MethodInput = { id?: string; label: string; instructions?: string; recipientAccount?: string; recipientName?: string; position: number; enabled?: boolean };
export type MethodResult = { ok: true } | { ok: false; message: string };

// `select *` : reste compatible avec une base dont la migration des détails n'a pas encore été appliquée.
export async function listPaymentMethods(sql: Sql): Promise<PaymentMethod[]> {
  const rows = await sql<Record<string, unknown>[]>`select * from payment_methods order by position, label`;
  return rows.map(normalize);
}

export async function listEnabledPaymentMethods(sql: Sql): Promise<PaymentMethod[]> {
  const rows = await sql<Record<string, unknown>[]>`select * from payment_methods where enabled order by position, label`;
  return rows.map(normalize);
}

const normalize = (r: Record<string, unknown>): PaymentMethod => ({
  id: r.id as string,
  label: r.label as string,
  enabled: r.enabled as boolean,
  position: r.position as number,
  instructions: (r.instructions as string | null) ?? null,
  recipient_account: (r.recipient_account as string | null) ?? null,
  recipient_name: (r.recipient_name as string | null) ?? null,
});

const clean = (s: string | undefined, max: number) => (s ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max) || null;

/** Ajoute ou modifie un moyen de paiement. Les commandes existantes gardent le nom choisi au moment de la commande. */
export async function saveMethod(sql: Sql, i: MethodInput): Promise<MethodResult> {
  const label = (i.label ?? "").trim();
  if (!label || label.length > 80) return { ok: false, message: "Le nom est obligatoire (80 caractères maximum)." };
  if ((i.instructions ?? "").trim().length > 500) return { ok: false, message: "Instructions trop longues (500 caractères maximum)." };
  if ((i.recipientAccount ?? "").trim().length > 60) return { ok: false, message: "Numéro ou compte destinataire trop long (60 caractères maximum)." };
  if ((i.recipientName ?? "").trim().length > 100) return { ok: false, message: "Nom du bénéficiaire trop long (100 caractères maximum)." };
  const position = Number.isFinite(i.position) ? Math.max(-1000, Math.min(1000, Math.trunc(i.position))) : 0;
  const instructions = clean(i.instructions, 500), account = clean(i.recipientAccount, 60), name = clean(i.recipientName, 100);
  try {
    if (i.id) {
      return await sql.begin(async (tx) => {
        const enabled = i.enabled ?? true;
        if (!enabled) {
          const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from payment_methods where enabled and id <> ${i.id!}`;
          if (n === 0) return { ok: false, message: "Au moins un moyen de paiement doit rester activé." } as const;
        }
        const r = await tx`update payment_methods set label = ${label}, instructions = ${instructions}, recipient_account = ${account}, recipient_name = ${name},
          position = ${position}, enabled = ${enabled} where id = ${i.id!} returning id`;
        return r.length ? ({ ok: true } as const) : ({ ok: false, message: "Moyen de paiement introuvable." } as const);
      });
    }
    await sql`insert into payment_methods (label, instructions, recipient_account, recipient_name, position, enabled)
      values (${label}, ${instructions}, ${account}, ${name}, ${position}, ${i.enabled ?? true})`;
    return { ok: true };
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return { ok: false, message: "Un moyen de paiement porte déjà ce nom." };
    throw e;
  }
}

export async function deleteMethod(sql: Sql, id: string): Promise<MethodResult> {
  return sql.begin(async (tx) => {
    const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from payment_methods where enabled and id <> ${id}`;
    if (n === 0) return { ok: false, message: "Au moins un moyen de paiement doit rester activé." } as const;
    await tx`delete from payment_methods where id = ${id}`; // les commandes gardent le nom enregistré
    return { ok: true } as const;
  });
}

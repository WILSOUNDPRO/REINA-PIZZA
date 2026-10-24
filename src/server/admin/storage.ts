import { randomUUID } from "node:crypto";
import { env } from "../env";

const BUCKET = "menu-images";
const MAX_BYTES = 5 * 1024 * 1024;

export function storageConfigured() {
  return Boolean(env.supabaseUrl() && env.supabaseServiceKey());
}

// Le type est déterminé par les premiers octets, jamais par l'extension ou l'en-tête déclarés par le navigateur.
function sniff(b: Uint8Array): { mime: string; ext: string } | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { mime: "image/png", ext: "png" };
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)
    return { mime: "image/webp", ext: "webp" };
  return null;
}

export async function uploadMenuImage(file: File): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  if (!storageConfigured()) return { ok: false, message: "Le stockage des photos n'est pas configuré (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)." };
  if (file.size === 0) return { ok: false, message: "Fichier vide." };
  if (file.size > MAX_BYTES) return { ok: false, message: "Image trop lourde (5 Mo maximum)." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(bytes);
  if (!kind) return { ok: false, message: "Format non pris en charge : utilisez JPEG, PNG ou WebP." };
  const name = `${randomUUID()}.${kind.ext}`;
  const r = await fetch(`${env.supabaseUrl()}/storage/v1/object/${BUCKET}/${name}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.supabaseServiceKey()}`, apikey: env.supabaseServiceKey(), "Content-Type": kind.mime, "x-upsert": "false" },
    body: bytes,
  });
  if (!r.ok) return { ok: false, message: "Échec du téléversement de l'image." };
  return { ok: true, url: `${env.supabaseUrl()}/storage/v1/object/public/${BUCKET}/${name}` };
}

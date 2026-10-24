import { parseMajorToMinor } from "@/lib/money";

export const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
export const bool = (f: FormData, k: string) => f.get(k) === "on";
export function int(f: FormData, k: string, def = 0) {
  const n = parseInt(str(f, k), 10);
  return Number.isFinite(n) ? n : def;
}
export function money(f: FormData, k: string): number | null {
  return parseMajorToMinor(str(f, k));
}

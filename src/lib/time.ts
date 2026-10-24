import { TIMEZONE } from "./constants";

const fmt = new Intl.DateTimeFormat("fr-FR", {
  timeZone: TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Date et heure affichées à l'heure de Port-au-Prince. */
export function formatDateTime(d: Date | string): string {
  return fmt.format(typeof d === "string" ? new Date(d) : d);
}

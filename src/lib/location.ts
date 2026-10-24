// Position GPS facultative : « lat, lng » ou lien https vers un service de cartes connu.
const ALLOWED_HOSTS = [
  "google.com",
  "maps.google.com",
  "goo.gl",
  "maps.app.goo.gl",
  "openstreetmap.org",
  "waze.com",
  "apple.com",
];

export function normalizeLocation(input: string): string | null {
  const s = input.trim();
  const pair = /^(-?\d{1,2}(?:\.\d+)?)\s*[,;]\s*(-?\d{1,3}(?:\.\d+)?)$/.exec(s);
  if (pair) {
    const lat = parseFloat(pair[1]);
    const lng = parseFloat(pair[2]);
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return `${lat}, ${lng}`;
  }
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" || u.username || u.password) return null;
    const host = u.hostname.toLowerCase();
    if (!ALLOWED_HOSTS.some((h) => host === h || host.endsWith("." + h))) return null;
    return u.toString().slice(0, 500);
  } catch {
    return null;
  }
}

export function locationHref(value: string): string {
  if (/^https:\/\//.test(value)) return value;
  return `https://www.google.com/maps?q=${encodeURIComponent(value.replace(/\s/g, ""))}`;
}

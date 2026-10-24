// Journal minimal : uniquement des codes d'événement et des identifiants techniques.
// Jamais de nom, téléphone, adresse, e-mail, jeton d'accès, secret ni corps de requête.
export function log(event: string, data: Record<string, string | number | boolean | null | undefined> = {}) {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (/token|secret|phone|email|name|address|password|key/i.test(k)) continue;
    safe[k] = v;
  }
  console.log(JSON.stringify({ t: new Date().toISOString(), event, ...safe }));
}

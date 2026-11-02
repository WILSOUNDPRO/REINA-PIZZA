// Pages de la boutique (accueil, menu, panier, livraison) : retour immédiat pendant le chargement d'une page (connexion lente) : la navigation ne paraît jamais bloquée.
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-10" role="status" aria-live="polite">
      <span className="sr-only">Chargement en cours…</span>
      <div className="h-9 w-2/3 max-w-md animate-pulse rounded-xl bg-white/10" />
      <div className="mt-4 h-5 w-full max-w-xl animate-pulse rounded-lg bg-white/10" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="card h-72 animate-pulse" />)}
      </div>
    </div>
  );
}

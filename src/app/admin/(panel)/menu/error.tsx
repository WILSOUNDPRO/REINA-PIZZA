"use client";

export default function MenuError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="card space-y-3 p-8 text-center">
      <p className="text-lg font-extrabold">Impossible de charger le menu.</p>
      <p className="text-sm text-ink-soft">Vérifiez votre connexion puis réessayez. Vos données ne sont pas affectées.</p>
      <button type="button" className="btn btn-primary" onClick={reset}>Réessayer</button>
    </div>
  );
}

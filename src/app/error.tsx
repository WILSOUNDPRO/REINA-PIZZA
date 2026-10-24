"use client";

import Link from "next/link";

// Page d'erreur conviviale (jamais de détail technique côté visiteur). Le diagnostic complet est sur /api/health.
export default function RootError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-3xl font-extrabold">Le site est momentanément indisponible</h1>
      <p className="mt-3 text-ink-soft">Nous n'avons pas pu charger cette page. Réessayez dans un instant, ou contactez directement Reina Pizza.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" className="btn btn-primary" onClick={reset}>Réessayer</button>
        <a className="btn btn-ghost" href="https://wa.me/50946461212" target="_blank" rel="noopener noreferrer">WhatsApp</a>
        <Link className="btn btn-ghost" href="/api/health">État du système</Link>
      </div>
    </div>
  );
}

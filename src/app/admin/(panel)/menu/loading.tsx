export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Chargement du menu">
      <div className="h-9 w-64 animate-pulse rounded-lg bg-cream-2" />
      <div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-cream-2" />)}</div>
      <div className="h-12 animate-pulse rounded-xl bg-cream-2" />
      {[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-cream-2" />)}
    </div>
  );
}

export function Flash({ sp }: { sp: { ok?: string; err?: string } }) {
  if (sp.err) return <p role="alert" className="mb-4 rounded-xl bg-tomato p-3 font-bold text-white">{sp.err}</p>;
  if (sp.ok) return <p role="status" className="mb-4 rounded-xl bg-basil p-3 font-bold text-white">{sp.ok}</p>;
  return null;
}

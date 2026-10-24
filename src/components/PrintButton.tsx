"use client";

export function PrintButton({ label = "Imprimer cette page" }: { label?: string }) {
  return <button type="button" className="btn btn-ghost no-print" onClick={() => window.print()}>🖨 {label}</button>;
}

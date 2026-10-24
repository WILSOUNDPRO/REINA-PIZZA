"use client";

import { Printer } from "lucide-react";

export function PrintButton({ label = "Imprimer cette page" }: { label?: string }) {
  return <button type="button" className="btn btn-ghost no-print" onClick={() => window.print()}><Printer size={18} aria-hidden="true" />{label}</button>;
}

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Tag } from "lucide-react";
import { ProductImage } from "../ProductCard";
import { RowMenu } from "./RowMenu";
import { SizesPanel } from "./SizesPanel";
import { formatMoney } from "@/lib/money";
import { SIZES, type Currency } from "@/lib/constants";
import { isPriced, isProductConfigured, type AdminProduct, type AdminSize } from "@/server/menu";
import { unitLabel } from "@/lib/productSale";

type Notice = { kind: "ok" | "error"; text: string } | null;

async function call(method: string, url: string, body?: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true } : { ok: false, error: j.error ?? "L'opération a échoué." };
  } catch {
    return { ok: false, error: "Connexion impossible. Réessayez." };
  }
}

function Switch({ checked, busy, label, onChange }: { checked: boolean; busy: boolean; label: string; onChange: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} aria-busy={busy} disabled={busy} onClick={onChange}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg pr-1 disabled:cursor-wait">
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-150 ${checked ? "bg-basil" : "bg-[#b9b2a7]"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-150 ${checked ? "left-[22px]" : "left-0.5"}`} />
      </span>
      <span className={`text-sm font-semibold ${checked ? "text-basil" : "text-ink-soft"}`}>{busy ? <Loader2 size={14} className="inline animate-spin" aria-hidden="true" /> : checked ? "Disponible" : "Indisponible"}</span>
    </button>
  );
}

function Sizes({ p, currency }: { p: AdminProduct; currency: Currency | null }) {
  if (p.product_type === "other") {
    const unit = unitLabel(p.sale_unit, p.pieces_per_portion);
    if (!isProductConfigured(p)) return <span className="rounded-lg bg-amber-100 px-2 py-1 text-sm font-semibold text-amber-950">Non configuré : prix et unité à renseigner</span>;
    return (
      <div className="space-y-1">
        <span className="rounded-lg bg-cream-2 px-2 py-1 text-sm font-semibold">{formatMoney(p.base_price_minor!, currency)} · {unit}</span>
        {p.variants.filter((v) => v.available).length > 0 && <p className="text-xs text-ink-soft">{p.variants.filter((v) => v.available).map((v) => `${v.label} ${formatMoney(v.price_minor, currency)}`).join(" · ")}</p>}
      </div>
    );
  }
  const priced = p.sizes.filter(isPriced);
  const missing = SIZES.filter((s) => !priced.some((x) => x.size === s));
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1.5">
        {priced.map((s) => <span key={s.size} className="rounded-lg bg-cream-2 px-2 py-1 text-sm font-semibold">{s.size} · {formatMoney(s.price_minor, currency)}</span>)}
        {priced.length === 0 && <span className="text-sm font-semibold text-tomato">Aucune taille tarifée</span>}
      </div>
      {missing.length > 0 && priced.length > 0 && <p className="text-xs text-ink-soft">{missing.join(", ")} : tarifs à renseigner</p>}
    </div>
  );
}

function Name({ p }: { p: AdminProduct }) {
  return (
    <div className="flex items-center gap-3">
      <ProductImage url={p.image_url} defaultImage={p.default_image} name={p.name} className="h-[42px] w-14 shrink-0 rounded-lg" sizes="56px" showBadge={false} />
      <div className="min-w-0">
        <p className="font-extrabold leading-tight">{p.name}</p>
        <p className="text-xs text-ink-soft">{p.category_name ?? "Sans catégorie"}{!p.visible ? " · masqué" : ""}{!p.image_url && p.default_image ? " · illustration par défaut" : ""}{p.is_demo ? " · démo" : ""}{p.archived ? " · archivé" : ""}</p>
      </div>
    </div>
  );
}

function Actions({ p, disabled, onSizes, onArchive, onRemove }: { p: AdminProduct; disabled: boolean; onSizes: (e: React.SyntheticEvent) => void; onArchive: (archived: boolean) => void; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <Link href={`/admin/menu/${p.id}`} className="stepper-btn" aria-label={`Modifier ${p.name}`} title="Modifier le produit"><Pencil size={17} aria-hidden="true" /></Link>
      {p.product_type === "pizza" && <button type="button" className="stepper-btn" aria-label={`Modifier les tailles et prix de ${p.name}`} title="Tailles et prix" onClick={onSizes}><Tag size={17} aria-hidden="true" /></button>}
      <RowMenu label={`Plus d'actions pour ${p.name}`} items={[
        p.archived ? { label: "Restaurer le produit", onSelect: () => onArchive(false), disabled } : { label: "Archiver le produit", onSelect: () => onArchive(true), disabled, hint: "Masqué du site, conservé dans les commandes" },
        { label: "Supprimer définitivement", onSelect: onRemove, danger: true, disabled: disabled || p.orders_count > 0, hint: p.orders_count > 0 ? "Lié à des commandes : archivage uniquement" : undefined },
      ]} />
    </div>
  );
}

export function MenuManager({ products, currency, archivedView, filtered }: { products: AdminProduct[]; currency: Currency | null; archivedView: boolean; filtered: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState(products);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<Notice>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => setItems(products), [products]);

  const setBusyId = (id: string, on: boolean) => setBusy((b) => { const n = new Set(b); if (on) n.add(id); else n.delete(id); return n; });

  async function toggle(p: AdminProduct) {
    if (busy.has(p.id)) return; // pas d'action répétée pendant la sauvegarde
    const next = !p.available;
    setBusyId(p.id, true); setNotice(null);
    setItems((l) => l.map((x) => (x.id === p.id ? { ...x, available: next } : x))); // optimiste
    const r = await call("PATCH", `/api/admin/products/${p.id}`, { available: next });
    if (!r.ok) {
      setItems((l) => l.map((x) => (x.id === p.id ? { ...x, available: p.available } : x))); // rétablit la valeur précédente
      setNotice({ kind: "error", text: `${p.name} : ${r.error}` });
    } else {
      setNotice({ kind: "ok", text: `${p.name} est maintenant ${next ? "disponible" : "indisponible"}.` });
      router.refresh();
    }
    setBusyId(p.id, false);
  }

  async function archive(p: AdminProduct, archived: boolean) {
    if (busy.has(p.id)) return;
    setBusyId(p.id, true); setNotice(null);
    const r = await call("PATCH", `/api/admin/products/${p.id}`, { archived });
    setNotice(r.ok ? { kind: "ok", text: `${p.name} ${archived ? "archivé : il n'apparaît plus sur le site" : "restauré (indisponible tant que vous ne l'activez pas)"}.` } : { kind: "error", text: `${p.name} : ${r.error}` });
    if (r.ok) router.refresh();
    setBusyId(p.id, false);
  }

  async function remove(p: AdminProduct) {
    if (busy.has(p.id) || !window.confirm(`Supprimer définitivement « ${p.name} » ? Cette action est irréversible.`)) return;
    setBusyId(p.id, true); setNotice(null);
    const r = await call("DELETE", `/api/admin/products/${p.id}`);
    setNotice(r.ok ? { kind: "ok", text: `${p.name} supprimé.` } : { kind: "error", text: `${p.name} : ${r.error}` });
    if (r.ok) router.refresh();
    setBusyId(p.id, false);
  }

  const openEditor = (p: AdminProduct, e?: React.SyntheticEvent) => { opener.current = (e?.currentTarget as HTMLElement) ?? null; setEditing(p.id); };
  const closeEditor = () => { setEditing(null); setTimeout(() => opener.current?.focus(), 0); };
  const editingProduct = items.find((p) => p.id === editing) ?? null;

  if (items.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-lg font-extrabold">{filtered ? "Aucun produit ne correspond à cette recherche." : archivedView ? "Aucun produit archivé." : "Aucun produit pour le moment."}</p>
        <p className="mt-1 text-sm text-ink-soft">{filtered ? "Modifiez la recherche ou le filtre de disponibilité." : archivedView ? "Les produits archivés apparaissent ici." : "Ajoutez votre premier produit pour l'afficher sur le site."}</p>
        {filtered ? <Link href="/admin/menu" className="btn btn-ghost mt-4">Réinitialiser les filtres</Link> : !archivedView && <Link href="/admin/menu/nouveau" className="btn btn-primary mt-4">Nouveau produit</Link>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div aria-live="polite" role={notice?.kind === "error" ? "alert" : "status"} className={notice ? `rounded-xl p-3 text-sm font-semibold ${notice.kind === "ok" ? "bg-[#e8f4ed] text-basil-dark" : "bg-tomato text-white"}` : "sr-only"}>{notice?.text}</div>

      {/* Ordinateur : tableau */}
      <div className="card hidden overflow-hidden md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-cream text-xs uppercase tracking-wide text-ink-soft">
            <tr><th scope="col" className="px-4 py-3">Produit</th><th scope="col" className="px-4 py-3">Tailles et prix</th><th scope="col" className="px-4 py-3">Disponibilité</th><th scope="col" className="px-4 py-3">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((p) => (
              <tr key={p.id} className="align-middle">
                <td className="px-4 py-3"><Name p={p} /></td>
                <td className="px-4 py-3"><Sizes p={p} currency={currency} /></td>
                <td className="px-4 py-3"><Switch checked={p.available} busy={busy.has(p.id)} label={`Disponibilité de ${p.name}`} onChange={() => toggle(p)} /></td>
                <td className="px-4 py-3"><Actions p={p} disabled={busy.has(p.id)} onSizes={(e) => openEditor(p, e)} onArchive={(a) => archive(p, a)} onRemove={() => remove(p)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Téléphone : cartes */}
      <ul className="space-y-3 md:hidden">
        {items.map((p) => (
          <li key={p.id} className="card space-y-3 p-4">
            <Name p={p} />
            <Sizes p={p} currency={currency} />
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
              <Switch checked={p.available} busy={busy.has(p.id)} label={`Disponibilité de ${p.name}`} onChange={() => toggle(p)} />
              <Actions p={p} disabled={busy.has(p.id)} onSizes={(e) => openEditor(p, e)} onArchive={(a) => archive(p, a)} onRemove={() => remove(p)} />
            </div>
          </li>
        ))}
      </ul>
      {items.some((p) => p.product_type === "pizza" && p.sizes.filter(isPriced).length < SIZES.length) && <p className="flex items-start gap-2 text-sm text-ink-soft"><span aria-hidden="true">ⓘ</span>Les tailles sans tarif ne sont pas proposées à la commande tant que leur prix n'est pas renseigné.</p>}

      {editingProduct && <SizesPanel key={editingProduct.id} product={editingProduct} currency={currency} onClose={closeEditor}
        onSaved={(sizes: AdminSize[]) => { setItems((l) => l.map((x) => (x.id === editingProduct.id ? { ...x, sizes } : x))); router.refresh(); }} />}
    </div>
  );
}

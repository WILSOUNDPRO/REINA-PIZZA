"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Poll = { unacknowledged: number; feesToConfirm: number };

// Alerte visuelle (bandeau + titre de l'onglet) et sonore (activable : les navigateurs exigent un clic préalable).
export function NewOrderWatcher() {
  const router = useRouter();
  const [poll, setPoll] = useState<Poll | null>(null);
  const [sound, setSound] = useState(false);
  const [flash, setFlash] = useState(false);
  const prev = useRef<number | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const soundRef = useRef(false);
  const baseTitle = useRef("");

  const beep = useCallback(() => {
    const ctx = audio.current;
    if (!ctx) return;
    [0, 0.25].forEach((delay, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = i ? 1046 : 784;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
      g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + delay + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.22);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + delay);
      o.stop(ctx.currentTime + delay + 0.25);
    });
  }, []);

  useEffect(() => {
    baseTitle.current = document.title;
  }, []);

  useEffect(() => {
    let stop = false;
    async function tick() {
      try {
        const r = await fetch("/api/admin/poll", { cache: "no-store" });
        if (r.status === 401) { window.location.href = "/admin/login"; return; }
        const d: Poll = await r.json();
        if (stop) return;
        setPoll(d);
        if (prev.current !== null && d.unacknowledged > prev.current) {
          setFlash(true);
          setTimeout(() => setFlash(false), 6000);
          if (soundRef.current) beep();
          router.refresh();
        }
        prev.current = d.unacknowledged;
        document.title = d.unacknowledged > 0 ? `(${d.unacknowledged}) ${baseTitle.current}` : baseTitle.current;
      } catch { /* réseau : on réessaie */ }
    }
    tick();
    const t = setInterval(tick, 15000);
    return () => { stop = true; clearInterval(t); };
  }, [beep, router]);

  function toggleSound() {
    if (!sound) {
      audio.current ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      void audio.current.resume();
      soundRef.current = true;
      setSound(true);
      beep(); // aperçu
    } else {
      soundRef.current = false;
      setSound(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" role="status" aria-live="polite">
      {poll && poll.unacknowledged > 0 && (
        <Link href="/admin/commandes?vue=nouvelles" className={`badge !px-3 !py-1.5 text-sm ${flash ? "animate-pulse bg-tomato text-white" : "bg-tomato text-white"}`}>
          🔔 {poll.unacknowledged} nouvelle{poll.unacknowledged > 1 ? "s" : ""} commande{poll.unacknowledged > 1 ? "s" : ""}
        </Link>
      )}
      {poll && poll.feesToConfirm > 0 && (
        <Link href="/admin/commandes?frais=1" className="badge !px-3 !py-1.5 bg-amber-200 text-sm text-amber-950">
          {poll.feesToConfirm} frais à confirmer
        </Link>
      )}
      <button type="button" onClick={toggleSound} className="btn btn-ghost !min-h-9 !px-3 text-xs" aria-pressed={sound}>
        {sound ? "🔊 Son activé" : "🔇 Activer le son"}
      </button>
    </div>
  );
}

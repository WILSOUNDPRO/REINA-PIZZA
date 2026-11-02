"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// Animation de fond pilotée par le défilement : 238 images (public/animation/f001.webp … f238.webp) dessinées sur un canvas fixe.
// Chargement progressif et discret : après le chargement de la page (les photos du menu passent d'abord), deux requêtes à la fois, priorité basse.
// Téléphone, économie de données ou connexion lente : peu d'images (1/16 puis 1/8) ; ordinateur : 1/16, 1/4, puis toutes si la connexion le permet ; mouvement réduit : une seule image.
export const TOTAL_FRAMES = 238;
const LERP = 0.12;
const src = (i: number) => `/animation/f${String(i).padStart(3, "0")}.webp`;

type Conn = { saveData?: boolean; effectiveType?: string; downlink?: number };

export function ScrollBackground() {
  const ref = useRef<HTMLCanvasElement>(null);
  const home = usePathname() === "/"; // voile léger sur l'accueil (image mise en avant), plus marqué ailleurs pour la lisibilité des formulaires et du menu

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d", { alpha: false });
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const conn = (navigator as Navigator & { connection?: Conn }).connection;
    const light = !!conn?.saveData || ["slow-2g", "2g", "3g"].includes(conn?.effectiveType ?? "") || (conn?.downlink !== undefined && conn.downlink < 2);
    const phone = window.innerWidth < 768 || window.matchMedia("(pointer: coarse)").matches;
    const fast = !phone && !light && (conn?.downlink === undefined || conn.downlink >= 5);

    const frames: (HTMLImageElement | undefined)[] = new Array(TOTAL_FRAMES + 1);
    let current = 1, target = 1, lastDrawn = -1, dirty = true, raf = 0, stopped = false;

    const resize = () => {
      canvas.width = Math.round(window.innerWidth);
      canvas.height = Math.round(window.innerHeight);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      dirty = true;
      kick();
    };

    const nearest = (i: number) => {
      for (let d = 0; d < TOTAL_FRAMES; d++) {
        const a = frames[i - d], b = frames[i + d];
        if (a) return a;
        if (b) return b;
      }
      return undefined;
    };

    const draw = (i: number) => {
      const img = nearest(i);
      if (!img) return;
      const cw = canvas.width, ch = canvas.height;
      const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
      const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
      ctx.fillStyle = "#080808";
      ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
    };

    const progress = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      return max <= 0 ? 0 : Math.min(1, Math.max(0, window.scrollY / max));
    };

    const tick = () => {
      raf = 0;
      if (stopped) return;
      target = reduced ? 1 : 1 + progress() * (TOTAL_FRAMES - 1);
      const delta = target - current;
      current = Math.abs(delta) > 0.005 ? current + delta * LERP : target;
      const f = Math.min(TOTAL_FRAMES, Math.max(1, Math.round(current)));
      if (f !== lastDrawn || dirty) {
        draw(f);
        lastDrawn = f;
        dirty = false;
        canvas.dataset.frame = String(f);
      }
      if (current !== target) kick(); // la boucle ne tourne que pendant un défilement ou un rattrapage
    };
    function kick() { if (!raf && !stopped && !document.hidden) raf = requestAnimationFrame(tick); }

    let loaded = 0, inflight = 0;
    const queue: number[] = [];
    const queued = new Set<number>();
    const pump = () => {
      while (!stopped && inflight < 2 && queue.length && !document.hidden) {
        const i = queue.shift()!;
        const img = new Image();
        img.decoding = "async";
        (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = "low";
        inflight++;
        const done = () => { inflight--; pump(); };
        img.onload = () => { frames[i] = img; loaded++; canvas.dataset.loaded = String(loaded); dirty = true; kick(); done(); };
        img.onerror = done;
        img.src = src(i);
      }
    };
    const load = (i: number) => { if (i >= 1 && i <= TOTAL_FRAMES && !queued.has(i)) { queued.add(i); queue.push(i); } };
    const stage = (step: number) => { for (let i = 1; i <= TOTAL_FRAMES; i += step) load(i); load(TOTAL_FRAMES); pump(); };

    resize();
    load(1);
    pump();
    const timers: number[] = [];
    const start = () => {
      if (reduced) return;
      timers.push(window.setTimeout(() => stage(16), 1500));
      timers.push(window.setTimeout(() => stage(phone || light ? 8 : 4), 4000));
      if (fast) timers.push(window.setTimeout(() => stage(1), 9000));
    };
    if (document.readyState === "complete") start(); else window.addEventListener("load", start, { once: true });

    window.addEventListener("scroll", kick, { passive: true });
    window.addEventListener("resize", resize);
    const resume = () => { pump(); kick(); };
    document.addEventListener("visibilitychange", resume);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      window.removeEventListener("scroll", kick);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("load", start);
    };
  }, []);

  return (
    <>
      <canvas ref={ref} id="animation-canvas" aria-hidden="true" className="no-print pointer-events-none fixed inset-0 z-0 h-dvh w-full bg-[#080808]" />
      {/* voile sombre : garantit la lisibilité du texte quelle que soit l'image affichée */}
      <div aria-hidden="true" className="no-print pointer-events-none fixed inset-0 z-0 " style={{ background: home ? "radial-gradient(ellipse at center, rgb(8 8 8 / .22), rgb(8 8 8 / .6))" : "radial-gradient(ellipse at center, rgb(8 8 8 / .62), rgb(8 8 8 / .84))" }} />
    </>
  );
}

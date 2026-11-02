"use client";

import { useEffect, useRef } from "react";

// Animation de fond pilotée par le défilement : 238 images (public/animation/f001.webp … f238.webp) dessinées sur un canvas fixe.
// Chargement progressif (1re image, puis 1/16, 1/4, enfin toutes), allégé en mode économie de données, connexion lente ou mouvement réduit.
export const TOTAL_FRAMES = 238;
const LERP = 0.12;
const src = (i: number) => `/animation/f${String(i).padStart(3, "0")}.webp`;

type Conn = { saveData?: boolean; effectiveType?: string };

export function ScrollBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d", { alpha: false });
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const conn = (navigator as Navigator & { connection?: Conn }).connection;
    const light = !!conn?.saveData || ["slow-2g", "2g", "3g"].includes(conn?.effectiveType ?? "");

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

    let loaded = 0;
    const load = (i: number) => {
      if (frames[i] || i < 1 || i > TOTAL_FRAMES) return;
      const img = new Image();
      img.decoding = "async";
      img.onload = () => { frames[i] = img; loaded++; canvas.dataset.loaded = String(loaded); dirty = true; kick(); };
      img.src = src(i);
    };
    const stage = (step: number) => { for (let i = 1; i <= TOTAL_FRAMES; i += step) load(i); load(TOTAL_FRAMES); };

    resize();
    load(1);
    const timers: number[] = [];
    if (!reduced) {
      timers.push(window.setTimeout(() => stage(16), 300));
      timers.push(window.setTimeout(() => stage(4), 1500));
      if (!light) timers.push(window.setTimeout(() => stage(1), 4000));
    }

    window.addEventListener("scroll", kick, { passive: true });
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", kick);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      window.removeEventListener("scroll", kick);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", kick);
    };
  }, []);

  return (
    <>
      <canvas ref={ref} id="animation-canvas" aria-hidden="true" className="no-print pointer-events-none fixed inset-0 z-0 h-dvh w-full bg-[#080808]" />
      {/* voile sombre : garantit la lisibilité du texte quelle que soit l'image affichée */}
      <div aria-hidden="true" className="no-print pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_center,rgb(8_8_8/.22),rgb(8_8_8/.6))]" />
    </>
  );
}

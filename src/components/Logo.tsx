import Image from "next/image";

// Identité visuelle du nouveau site : toque dorée dans un cartouche + « Reina Pizza » et la signature « Pizza • Burger • Wings ».
// Entièrement vectoriel (aucune image) ; tone="or" sur le fond noir du site public, tone="rouge" pour l'administration (fond clair).
const TONES = {
  or: { box: "border-[#dfa51a]/45 bg-[#f5b51b]/10 text-[#f5b51b]", title: "text-white", tag: "text-[#f5b51b]" },
  rouge: { box: "border-tomato/40 bg-tomato/10 text-tomato", title: "text-ink", tag: "text-tomato" },
} as const;
const SIZES = { sm: ["h-9 w-9 rounded-xl", 20, "text-lg", "text-[9px]"], md: ["h-11 w-11 rounded-xl", 26, "text-xl", "text-[10px]"], lg: ["h-14 w-14 rounded-2xl", 32, "text-3xl", "text-xs"] } as const;

export function LogoMark({ size = "md", tone = "or", className = "" }: { size?: keyof typeof SIZES; tone?: keyof typeof TONES; className?: string }) {
  const [box, icon] = SIZES[size];
  return (
    <span className={`inline-flex shrink-0 items-center justify-center border ${box} ${TONES[tone].box} ${className}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" width={icon} height={icon} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z" />
        <line x1="6" y1="17" x2="18" y2="17" />
      </svg>
    </span>
  );
}

export function Logo({ size = "md", tone = "or", tagline = true, className = "" }: { size?: keyof typeof SIZES; tone?: keyof typeof TONES; tagline?: boolean; className?: string }) {
  const [, , title, tag] = SIZES[size];
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} tone={tone} />
      <span className="flex flex-col leading-none">
        <span className={`font-extrabold tracking-tight ${title} ${TONES[tone].title}`}>Reina Pizza</span>
        {tagline && <span className={`mt-1 font-bold uppercase tracking-[0.18em] ${tag} ${TONES[tone].tag}`}>Pizza • Burger • Wings</span>}
      </span>
    </span>
  );
}

/** Logo officiel (fond transparent, dessiné pour fond sombre) : en-tête et pied de page du site public. Source : design-originals/logo-reina-pizza.webp. */
export function LogoImage({ className = "h-12 w-auto", priority = false, large = false }: { className?: string; priority?: boolean; large?: boolean }) {
  return <Image src={large ? "/brand/logo-reina-pizza-600.webp" : "/brand/logo-reina-pizza-300.webp"} alt="Reina Pizza" width={large ? 600 : 300} height={large ? 321 : 161} priority={priority} className={className} />;
}

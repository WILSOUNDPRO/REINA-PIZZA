import Image from "next/image";

// Logo officiel (PNG transparent, ratio 1000 × 414 conservé) et symbole seul (part de pizza couronnée).
// tone="or" : même logo recoloré en or pour le fond noir du site public (l'original rouge reste utilisé ailleurs).
export function Logo({ className = "h-10 w-auto", priority = false, tone = "rouge" }: { className?: string; priority?: boolean; tone?: "rouge" | "or" }) {
  return <Image src={tone === "or" ? "/brand/logo-or.png" : "/brand/logo.png"} alt="Reina Pizza" width={1000} height={414} priority={priority} className={className} />;
}

export function LogoSymbol({ className = "h-8 w-auto", alt = "", tone = "rouge" }: { className?: string; alt?: string; tone?: "rouge" | "or" }) {
  return <Image src={tone === "or" ? "/brand/symbol-or.png" : "/brand/symbol.png"} alt={alt} width={345} height={440} className={className} />;
}

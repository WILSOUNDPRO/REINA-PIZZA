import Image from "next/image";

// Logo officiel (PNG transparent, ratio 1000 × 414 conservé) et symbole seul (part de pizza couronnée).
export function Logo({ className = "h-10 w-auto", priority = false }: { className?: string; priority?: boolean }) {
  return <Image src="/brand/logo.png" alt="Reina Pizza" width={1000} height={414} priority={priority} className={className} />;
}

export function LogoSymbol({ className = "h-8 w-auto", alt = "" }: { className?: string; alt?: string }) {
  return <Image src="/brand/symbol.png" alt={alt} width={345} height={440} className={className} />;
}

// Logo WhatsApp du nouveau site (tracé d'origine, rempli). Les icônes Lucide n'ont pas de logos de marque : un simple « message » ne représente pas WhatsApp.
export function WhatsAppIcon({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" className={`shrink-0 ${className}`} aria-hidden="true" focusable="false">
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm5.78 14.28c-.24.68-1.4 1.25-1.92 1.31-.5.06-1.12.08-3.6-0.95-3.17-1.31-5.21-4.52-5.37-4.73-.16-.21-1.28-1.7-1.28-3.24 0-1.54.81-2.3 1.1-2.61.29-.31.63-.39.84-.39.21 0 .42 0 .61.01.2.01.46-.07.72.55.26.63.89 2.18.97 2.34.08.16.13.35.03.56-.1.21-.15.35-.3.53-.15.18-.32.4-.46.54-.16.16-.33.34-.14.67.19.33.84 1.39 1.8 2.25 1.24 1.1 2.29 1.44 2.62 1.6.33.16.53.14.73-.09.2-.23.85-.99 1.08-1.33.23-.34.46-.28.77-.16.31.12 1.98.93 2.32 1.1.34.17.57.26.65.4.08.14.08.82-.16 1.5z" />
    </svg>
  );
}

/** Cœur du titre d'accueil (tracé d'origine du nouveau site). */
export function HandHeart({ size = 34, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" className={className} aria-hidden="true" focusable="false">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

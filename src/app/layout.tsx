import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/caveat";
import "./globals.css";

const base = (() => { try { return process.env.SITE_URL ? new URL(process.env.SITE_URL) : undefined; } catch { return undefined; } })();

export const metadata: Metadata = {
  metadataBase: base, // URL absolue de l'image de partage (SITE_URL) ; sans elle Next résout par rapport à la requête
  title: { default: "Reina Pizza — Commande et livraison", template: "%s · Reina Pizza" },
  description: "Commandez vos pizzas chez Reina Pizza, Delmas 33, Haïti. Ouvert 24 h/24, 7 j/7. Livraison selon votre destination.",
  openGraph: { title: "Reina Pizza — Pizza, Burger & Wings", description: "Commandez en ligne ou sur WhatsApp. Ouvert 24 h/24, 7 j/7 à Delmas 33.", images: [{ url: "/brand/og-logo.jpg", width: 1200, height: 675, alt: "Reina Pizza" }], locale: "fr_HT", type: "website" },
};
export const viewport: Viewport = { themeColor: "#080808", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}

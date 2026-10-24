import type { Metadata, Viewport } from "next";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/dm-sans";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Reina Pizza — Commande et livraison", template: "%s · Reina Pizza" },
  description: "Commandez vos pizzas chez Reina Pizza, Delmas 33, Haïti. Ouvert 24 h/24, 7 j/7. Livraison selon votre destination.",
};
export const viewport: Viewport = { themeColor: "#fbf3e4", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}

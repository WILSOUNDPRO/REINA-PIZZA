import { CartProvider } from "@/components/CartProvider";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { MobileCartBar } from "@/components/MobileCartBar";
import { getSql } from "@/server/db";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings(getSql());
  return (
    <CartProvider>
      <a href="#contenu" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-paper focus:p-3">Aller au contenu</a>
      <SiteHeader />
      <main id="contenu">{children}</main>
      <SiteFooter s={settings} />
      <MobileCartBar currency={settings.currency} />
    </CartProvider>
  );
}

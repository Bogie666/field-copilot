import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/archivo/wdth.css";
import "./globals.css";
import { brand } from "./config/brand";
import BottomNav from "./components/BottomNav";

export const metadata: Metadata = {
  title: { default: brand.productName, template: `%s | ${brand.productName}` },
  description: "Job-based field tools for HVAC technicians: record findings, then turn them into a clear customer estimate note.",
  applicationName: brand.productName,
  icons: { apple: "/icon-180.png" },
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: brand.shortName, statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#161826" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body><div className="shell">{children}<BottomNav /></div></body></html>;
}

import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import "@fontsource-variable/archivo/wdth.css";
import "./globals.css";
import { accentInk, brand } from "./config/brand";
import { GaugeMark } from "./components/Icons";
import SaveIndicator from "./components/SaveIndicator";
import ThemeToggle from "./components/ThemeToggle";

export const metadata: Metadata = {
  title: { default: brand.productName, template: `%s | ${brand.productName}` },
  description: "Job-based field tools for HVAC technicians: record findings, then turn them into a clear customer estimate note.",
  applicationName: brand.productName,
  icons: { apple: "/icon-180.png" },
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: brand.shortName, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: brand.accent || "#0b6e7f",
};

// Applies a stored light or dark choice before first paint so there is no flash.
const THEME_BOOT = "try{var t=localStorage.getItem('fc.theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}";

export default function RootLayout({ children }: { children: ReactNode }) {
  const themeStyle = (brand.accent
    ? { "--accent": brand.accent, "--accent-ink": accentInk(brand.accent), "--focus": brand.accent }
    : undefined) as CSSProperties | undefined;
  return (
    <html lang="en" style={themeStyle} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>
        <div className="shell">
          <header className="appbar">
            <div className="appbarInner">
              <Link className="brandLink" href="/" aria-label={`${brand.productName} home`}>
                {brand.logoUrl ? <img className="brandLogo" src={brand.logoUrl} alt="" /> : <GaugeMark className="brandMark" />}
                <span className="brandName">
                  {brand.productName}
                  {brand.organization && <span className="brandOrg">{brand.organization}</span>}
                </span>
              </Link>
              <span className="appbarSpacer" />
              <SaveIndicator />
              <ThemeToggle />
            </div>
          </header>
          {children}
          <footer className="footer noPrint">
            <span>Findings are screening results for technician review.</span>
            {brand.supportUrl && <a href={brand.supportUrl}>Get help</a>}
          </footer>
        </div>
      </body>
    </html>
  );
}

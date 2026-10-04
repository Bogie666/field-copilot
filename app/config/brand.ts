// Brand configuration. Everything a brand might change lives here or in env vars,
// so rolling the app out to another brand never requires touching components.
export type BrandConfig = {
  /** Product name shown in the app bar and install name. */
  productName: string;
  /** Optional organization name, shown quietly in the app bar and footer. */
  organization: string;
  /** Short name for the home screen icon. */
  shortName: string;
  /** Accent color as a 6-digit hex value. Used for primary actions and focus. */
  accent: string;
  /** Optional absolute or root-relative URL of a logo image. Falls back to the built-in mark. */
  logoUrl: string;
  /** Link shown in the footer for technician support. Empty hides it. */
  supportUrl: string;
};

const HEX = /^#[0-9a-fA-F]{6}$/;

function clean(value: string | undefined, max: number): string {
  return (value ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, max);
}

export function resolveBrand(env: Record<string, string | undefined>): BrandConfig {
  const productName = clean(env.NEXT_PUBLIC_BRAND_PRODUCT_NAME, 40) || "Field Copilot";
  const accent = clean(env.NEXT_PUBLIC_BRAND_ACCENT, 7);
  const logoUrl = clean(env.NEXT_PUBLIC_BRAND_LOGO_URL, 300);
  const supportUrl = clean(env.NEXT_PUBLIC_BRAND_SUPPORT_URL, 300);
  return {
    productName,
    organization: clean(env.NEXT_PUBLIC_BRAND_ORGANIZATION, 60),
    shortName: clean(env.NEXT_PUBLIC_BRAND_SHORT_NAME, 12) || productName.slice(0, 12),
    accent: HEX.test(accent) ? accent : "",
    logoUrl: /^(https:\/\/|\/)/.test(logoUrl) ? logoUrl : "",
    supportUrl: /^(https:\/\/|mailto:)/.test(supportUrl) ? supportUrl : "",
  };
}

// NEXT_PUBLIC_ variables are inlined at build time, so each reference must be literal.
export const brand: BrandConfig = resolveBrand({
  NEXT_PUBLIC_BRAND_PRODUCT_NAME: process.env.NEXT_PUBLIC_BRAND_PRODUCT_NAME,
  NEXT_PUBLIC_BRAND_ORGANIZATION: process.env.NEXT_PUBLIC_BRAND_ORGANIZATION,
  NEXT_PUBLIC_BRAND_SHORT_NAME: process.env.NEXT_PUBLIC_BRAND_SHORT_NAME,
  NEXT_PUBLIC_BRAND_ACCENT: process.env.NEXT_PUBLIC_BRAND_ACCENT,
  NEXT_PUBLIC_BRAND_LOGO_URL: process.env.NEXT_PUBLIC_BRAND_LOGO_URL,
  NEXT_PUBLIC_BRAND_SUPPORT_URL: process.env.NEXT_PUBLIC_BRAND_SUPPORT_URL,
});

/** Picks black or white text for a given accent so primary buttons stay readable. */
export function accentInk(hex: string): string {
  if (!HEX.test(hex)) return "";
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const dark = [16, 32, 42].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const darkLuminance = 0.2126 * dark[0] + 0.7152 * dark[1] + 0.0722 * dark[2];
  const darkContrast = (Math.max(luminance, darkLuminance) + 0.05) / (Math.min(luminance, darkLuminance) + 0.05);
  const whiteContrast = 1.05 / (luminance + 0.05);
  return darkContrast >= whiteContrast ? "#10202a" : "#ffffff";
}

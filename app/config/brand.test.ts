import { describe, expect, it } from "vitest";
import { accentInk, resolveBrand } from "./brand";

describe("resolveBrand", () => {
  it("defaults to a neutral product name", () => {
    const brand = resolveBrand({});
    expect(brand.productName).toBe("Field Copilot");
    expect(brand.organization).toBe("");
    expect(brand.accent).toBe("");
  });
  it("accepts a valid accent and ignores a malformed one", () => {
    expect(resolveBrand({ NEXT_PUBLIC_BRAND_ACCENT: "#AA3300" }).accent).toBe("#AA3300");
    expect(resolveBrand({ NEXT_PUBLIC_BRAND_ACCENT: "red; background:url(x)" }).accent).toBe("");
  });
  it("only allows https or root-relative logo urls", () => {
    expect(resolveBrand({ NEXT_PUBLIC_BRAND_LOGO_URL: "javascript:alert(1)" }).logoUrl).toBe("");
    expect(resolveBrand({ NEXT_PUBLIC_BRAND_LOGO_URL: "/logo.svg" }).logoUrl).toBe("/logo.svg");
  });
  it("strips control characters and caps length", () => {
    expect(resolveBrand({ NEXT_PUBLIC_BRAND_PRODUCT_NAME: "A\nB" }).productName).toBe("AB");
    expect(resolveBrand({ NEXT_PUBLIC_BRAND_PRODUCT_NAME: "x".repeat(100) }).productName).toHaveLength(40);
  });
});

describe("accentInk", () => {
  it("returns dark ink on light accents and white on dark accents", () => {
    expect(accentInk("#ffd400")).toBe("#10202a");
    expect(accentInk("#0b6e7f")).toBe("#ffffff");
    expect(accentInk("nope")).toBe("");
  });
});

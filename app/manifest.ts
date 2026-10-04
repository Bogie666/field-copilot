import type { MetadataRoute } from "next";
import { brand } from "./config/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.productName,
    short_name: brand.shortName,
    description: "Job-based field tools for HVAC technicians.",
    start_url: "/",
    display: "standalone",
    background_color: "#e9eeee",
    theme_color: brand.accent || "#0b6e7f",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}

"use client";

import { usePathname } from "next/navigation";

/**
 * Route params read from the browser path rather than the server payload. Offline, the
 * service worker serves one cached template per screen type for any job or note, so the
 * payload's params belong to the template; the path is always the real one.
 */
export function pathSegments(pathname: string): string[] {
  return pathname.split("/").filter(Boolean).map((part) => {
    try { return decodeURIComponent(part); } catch { return part; }
  });
}

export function useRouteSegment(index: number): string {
  return pathSegments(usePathname() ?? "")[index] ?? "";
}

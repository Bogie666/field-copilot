"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BriefcaseIcon, CameraIcon, NotebookIcon, WrenchIcon } from "./Icons";

const TABS = [
  { href: "/", label: "Jobs", Icon: BriefcaseIcon, active: (p: string) => p === "/" || p.startsWith("/job/") },
  { href: "/tools", label: "Tools", Icon: WrenchIcon, active: (p: string) => p.startsWith("/tools") },
  { href: "/notes", label: "Notes", Icon: NotebookIcon, active: (p: string) => p === "/notes" },
  { href: "/photos", label: "Photos", Icon: CameraIcon, active: (p: string) => p.startsWith("/photos") },
] as const;

export default function BottomNav() {
  const pathname = usePathname();
  if (/^\/notes\/(new|[^/]+)$/.test(pathname)) return null;
  return <nav className="bottomNav noPrint" aria-label="Primary navigation">
    {TABS.map(({ href, label, Icon, active }) => {
      const selected = active(pathname);
      return <Link key={href} href={href} className="bottomNavLink" aria-current={selected ? "page" : undefined}>
        <span className="bottomNavIcon"><Icon /></span><span>{label}</span>
      </Link>;
    })}
  </nav>;
}

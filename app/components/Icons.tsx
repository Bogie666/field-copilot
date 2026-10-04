import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Svg(props: IconProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    />
  );
}

/** Built-in brand mark: a pressure gauge dial. Replaced by NEXT_PUBLIC_BRAND_LOGO_URL when set. */
export function GaugeMark(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="24" cy="24" r="19" />
      <path d="M9 30a15 15 0 0 1 30 0" strokeOpacity=".35" />
      <path d="M24 26 33 15" strokeWidth={3.2} />
      <circle cx="24" cy="26" r="2.6" fill="currentColor" stroke="none" />
      <path d="M14 36h20" />
    </Svg>
  );
}

export function CondenserIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="6" y="8" width="36" height="32" rx="4" />
      <circle cx="24" cy="24" r="10" />
      <path d="M24 24 24 15M24 24l8 4.5M24 24l-8 4.5" />
      <path d="M10 12h.01M38 12h.01M10 36h.01M38 36h.01" strokeWidth={3.4} />
    </Svg>
  );
}

export function FurnaceIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="9" y="5" width="30" height="38" rx="3" />
      <path d="M14 13h20M14 18h20M14 23h20" />
      <path d="M24 38c-3-2-4-4-3-7 1 1 2 1.500 3 .5.500-2 2-3 3-4 1 3 3 5 1 8-.800 1.500-2.500 2-4 2.500Z" />
    </Svg>
  );
}

export function AtticIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 24 24 7l20 17" />
      <path d="M10 21v19h28V21" />
      <path d="M16 30h16M16 35h16" strokeOpacity=".6" />
      <path d="M20 25h8" />
    </Svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 22 24 7l18 15" />
      <path d="M11 19v22h26V19" />
      <path d="M20 41V29h8v12" />
    </Svg>
  );
}

export function ChevronRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m18 10 14 14-14 14" />
    </Svg>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="24" cy="24" r="8" />
      <path d="M24 5v5M24 38v5M5 24h5M38 24h5M10.500 10.500l3.500 3.500M34 34l3.500 3.500M10.500 37.500 14 34M34 14l3.500-3.500" />
    </Svg>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M38 29A15 15 0 0 1 19 10a15 15 0 1 0 19 19Z" />
    </Svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M24 9v30M9 24h30" />
    </Svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m10 25 9 9 19-20" />
    </Svg>
  );
}

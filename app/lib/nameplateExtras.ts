/** Plate values the base nameplate parser does not cover. Only returned when the text states them. */
export type NameplateExtras = { tempRiseRange: string; maxExternalStatic: string };

export function parseNameplateExtras(text: string): NameplateExtras {
  const out: NameplateExtras = { tempRiseRange: "", maxExternalStatic: "" };
  const rise = /temp(?:erature)?\.?\s*rise[^0-9\n]{0,20}(\d{1,3}(?:\.\d+)?)\s*(?:-|–|to)\s*(\d{1,3}(?:\.\d+)?)/i.exec(text);
  if (rise) {
    const [a, b] = [Number(rise[1]), Number(rise[2])];
    if (a > 0 && b > 0 && a <= 200 && b <= 200) out.tempRiseRange = `${Math.min(a, b)}-${Math.max(a, b)}`;
  }
  const stat = /max(?:imum)?\.?\s*(?:ext(?:ernal)?\.?\s*)?static[^0-9.\n]{0,20}(\d?\.\d{1,2}|\d{1,2})/i.exec(text);
  if (stat) {
    const v = Number(stat[1]);
    if (Number.isFinite(v) && v > 0 && v <= 3) out.maxExternalStatic = String(v);
  }
  return out;
}

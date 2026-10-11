/** Reviewed equipment choices. Unknown legacy text remains owned by the caller. */
export const EQUIPMENT_TYPES = [
  "Unknown",
  "Condenser / air conditioner",
  "Heat pump",
  "Gas furnace",
  "Electric furnace",
  "Air handler",
  "Packaged unit",
  "Evaporator coil",
  "Boiler",
  "Other",
] as const;

export type EquipmentType = (typeof EQUIPMENT_TYPES)[number];

const TYPE_SYNONYMS: Record<EquipmentType, readonly string[]> = {
  Unknown: ["unknown"],
  "Condenser / air conditioner": ["condenser / air conditioner", "condenser", "air conditioner", "air conditioning", "condensing unit", "ac", "a/c"],
  "Heat pump": ["heat pump", "heatpump"],
  "Gas furnace": ["gas furnace", "natural gas furnace", "propane furnace", "lp gas furnace"],
  "Electric furnace": ["electric furnace", "electrical furnace"],
  "Air handler": ["air handler", "air handling unit", "airhandler", "fan coil", "fan coil unit"],
  "Packaged unit": ["packaged unit", "package unit", "packaged system"],
  "Evaporator coil": ["evaporator coil", "evaporator"],
  Boiler: ["boiler", "gas boiler", "electric boiler", "hot water boiler", "steam boiler"],
  Other: ["other"],
};

/**
 * Match only an explicit type field, never a substring in OCR/model/serial text.
 * Do not infer fuel from "Furnace", or heat-pump capability from "Mini-split".
 * Undefined lets the UI retain legacy values instead of coercing them to Unknown.
 */
export function matchEquipmentType(raw: string | undefined): EquipmentType | undefined {
  const normalized = (raw ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/\s*\/\s*/g, "/");
  return EQUIPMENT_TYPES.find((type) => TYPE_SYNONYMS[type].some((value) => value.replace(/\s*\/\s*/g, "/") === normalized));
}

export type ManufacturedAge = {
  years: number;
  precision: "day" | "month" | "year";
  /** Explains approximate month/year input; this is a suggestion for review. */
  label: string;
};

type PrintedDate = { year: number; month?: number; day?: number };

/** Only explicit, unambiguous printed formats; no serial/model decoding. */
function parsePrintedDate(raw: string): PrintedDate | null {
  const value = raw.trim();
  let match: RegExpExecArray | null;
  if ((match = /^(\d{4})$/.exec(value))) return { year: Number(match[1]) };
  if ((match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value))) {
    return { year: Number(match[1]), month: Number(match[2]), ...(match[3] ? { day: Number(match[3]) } : {}) };
  }
  if ((match = /^(\d{1,2})[/-](\d{4})$/.exec(value))) return { year: Number(match[2]), month: Number(match[1]) };
  return null;
}

/**
 * Suggest completed years from a printed manufacture date and an explicit clock.
 * Supported: YYYY, YYYY-MM, M/YYYY or M-YYYY, and YYYY-MM-DD. Full slash dates
 * are locale-ambiguous and deliberately unsupported. UTC calendar fields keep
 * the result independent of the server/browser timezone used to run the helper.
 * Month-only/year-only suggestions are approximate, never exact anniversaries.
 */
export function ageFromManufacturedDate(date: string | undefined, now: Date | string): ManufacturedAge | null {
  const current = typeof now === "string" ? new Date(now) : now;
  if (!(current instanceof Date) || !Number.isFinite(current.getTime())) return null;
  const printed = parsePrintedDate(date ?? "");
  if (!printed || printed.year < 1) return null;

  const year = current.getUTCFullYear();
  const month = current.getUTCMonth() + 1;
  const day = current.getUTCDate();
  if (printed.year > year) return null;
  if (printed.month === undefined) {
    const years = year - printed.year;
    return { years, precision: "year", label: `About ${years} ${years === 1 ? "year" : "years"} old; only the manufacture year is printed.` };
  }
  if (printed.month < 1 || printed.month > 12) return null;
  const elapsedMonths = (year - printed.year) * 12 + month - printed.month;
  if (elapsedMonths < 0) return null;
  if (printed.day === undefined) {
    const years = Math.floor(elapsedMonths / 12);
    return { years, precision: "month", label: `About ${years} ${years === 1 ? "year" : "years"} old; only the manufacture month and year are printed.` };
  }

  const leapYear = printed.year % 4 === 0 && (printed.year % 100 !== 0 || printed.year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][printed.month - 1];
  if (printed.day < 1 || printed.day > daysInMonth || (elapsedMonths === 0 && printed.day > day)) return null;
  const beforeAnniversary = month < printed.month || (month === printed.month && day < printed.day);
  const years = year - printed.year - Number(beforeAnniversary);
  return { years, precision: "day", label: `${years} completed ${years === 1 ? "year" : "years"} from the printed manufacture date.` };
}

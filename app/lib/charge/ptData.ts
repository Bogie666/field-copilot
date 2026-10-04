import { PT_GENERATED_SOURCE, PT_GENERATED_TABLES } from "./ptData.generated";

/** Published manufacturer/supplier chart imports remain pending technical approval. */
export const PT_DATA_APPROVED = false;
export const PT_DATA_SOURCE = PT_GENERATED_SOURCE;

export type PtSource = {
  publisher: string;
  title: string;
  url: string;
  documentDate: string | null;
  pressureUnit: string;
  temperatureUnit: string;
  gaugeBasis: string;
  pdfSha256: string;
  dataSha256: string;
  extractionNotes: string;
};

export type PtTable = {
  source?: PtSource;
  id: string;
  safetyClass: string;
  startPsig?: number;
  stepPsig?: number;
  pressurePsig?: readonly number[];
  bubblePressurePsig?: readonly number[];
  dewPressurePsig?: readonly number[];
  /** Bubble point (saturated liquid) temperature in F at each pressure step. */
  bubbleF: readonly number[];
  /** Dew point (saturated vapor) temperature in F at each pressure step. */
  dewF: readonly number[];
};

export const PT_TABLES: readonly PtTable[] = PT_GENERATED_TABLES;

export type SatResult = { ok: true; tempF: number } | { ok: false; error: string };

export function ptRefrigerants(tables: readonly PtTable[] = PT_TABLES) {
  return tables.map((t) => ({ id: t.id, safetyClass: t.safetyClass }));
}

export function maxPsig(table: PtTable, kind: "dew" | "bubble" = "dew"): number {
  return (kind === "dew" ? table.dewPressurePsig : table.bubblePressurePsig)?.at(-1) ?? table.pressurePsig?.at(-1) ?? (table.startPsig! + ((kind === "dew" ? table.dewF : table.bubbleF).length - 1) * table.stepPsig!);
}

/**
 * Linear interpolation. Pressures outside the table are an error, never extrapolated.
 * Superheat uses the dew point column and subcooling uses the bubble point column.
 */
export function saturationTempF(refrigerantId: string, psig: number, kind: "dew" | "bubble", tables: readonly PtTable[] = PT_TABLES): SatResult {
  const table = tables.find((t) => t.id === refrigerantId);
  if (!table) return { ok: false, error: `No pressure-temperature data for ${refrigerantId}.` };
  if (!Number.isFinite(psig)) return { ok: false, error: "Pressure must be a number." };
  if (!table.dewPressurePsig && !table.bubblePressurePsig && table.dewF.length !== table.bubbleF.length) {
    return { ok: false, error: `Invalid pressure-temperature table for ${refrigerantId}.` };
  }
  const column = kind === "dew" ? table.dewF : table.bubbleF;
  const pressures = (kind === "dew" ? table.dewPressurePsig : table.bubblePressurePsig) ?? table.pressurePsig ?? column.map((_, i) => table.startPsig! + i * table.stepPsig!);
  for (const phase of ["dew", "bubble"] as const) {
    const values = phase === "dew" ? table.dewF : table.bubbleF;
    const axis = (phase === "dew" ? table.dewPressurePsig : table.bubblePressurePsig) ?? table.pressurePsig ?? values.map((_, i) => table.startPsig! + i * table.stepPsig!);
    if (axis.length < 2 || axis.length !== values.length ||
        axis.some((pressure, i) => !Number.isFinite(pressure) || (i > 0 && pressure <= axis[i - 1])) ||
        values.some((temp) => !Number.isFinite(temp))) {
      return { ok: false, error: `Invalid pressure-temperature table for ${refrigerantId}.` };
    }
  }
  const start = pressures[0];
  const top = maxPsig(table, kind);
  if (psig < start || psig > top) {
    return { ok: false, error: `${psig} psig is outside the ${refrigerantId} table (${start} to ${top} psig). Check the gauge reading.` };
  }
  const upper = pressures.findIndex((pressure) => pressure >= psig);
  if (pressures[upper] === psig) return { ok: true, tempF: column[upper] };
  const lower = upper - 1;
  const fraction = (psig - pressures[lower]) / (pressures[upper] - pressures[lower]);
  return { ok: true, tempF: column[lower] + (column[upper] - column[lower]) * fraction };
}



export function ptSourceReference(refrigerantId: string, tables: readonly PtTable[] = PT_TABLES): string {
  const table = tables.find((t) => t.id === refrigerantId);
  const source = table?.source;
  if (!source) return table ? "Custom PT table (source not supplied)" : PT_DATA_SOURCE;
  return `${PT_DATA_SOURCE}: ${source.publisher}, ${source.title}; ${source.url}; document date ${source.documentDate ?? "not stated"}; ${source.pressureUnit} / ${source.temperatureUnit}; ${source.gaugeBasis}; bubble range ${table.bubblePressurePsig?.[0] ?? table.pressurePsig?.[0] ?? table.startPsig} to ${maxPsig(table, "bubble")} psig; dew range ${table.dewPressurePsig?.[0] ?? table.pressurePsig?.[0] ?? table.startPsig} to ${maxPsig(table, "dew")} psig; data SHA-256: ${source.dataSha256}; ${source.extractionNotes}`;
}

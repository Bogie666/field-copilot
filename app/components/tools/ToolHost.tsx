"use client";

import type { ComponentType } from "react";
import type { ToolId } from "../../lib/job/registry";
import type { ToolContext } from "./context";
import VoiceEntry from "../VoiceEntry";
import AirflowTool from "./AirflowTool";
import DuctTool from "./DuctTool";
import InsulationTool from "./InsulationTool";
import LoadScreeningTool from "./LoadScreeningTool";
import ExplainTool from "./ExplainTool";
import NameplateTool from "./NameplateTool";
import NotesTool from "./NotesTool";
import PhotosTool from "./PhotosTool";
import ChargeTool from "./ChargeTool";
import ElectricalTool from "./ElectricalTool";
import FurnaceTool from "./FurnaceTool";
import StaticTool from "./StaticTool";
import HeatPumpTool from "./HeatPumpTool";
import GasTool from "./GasTool";
import EvacuationTool from "./EvacuationTool";
import RefrigerantLogTool from "./RefrigerantLogTool";
import CompressorTool from "./CompressorTool";
import AirsideTool from "./AirsideTool";
import MaintenanceTool from "./MaintenanceTool";

type ToolComponent = ComponentType<{ ctx: ToolContext }>;

const REGISTRY: Partial<Record<ToolId, ToolComponent>> = {
  electrical: ElectricalTool,
  charge: ChargeTool,
  furnace: FurnaceTool,
  static: StaticTool,
  airflow: AirflowTool,
  duct: DuctTool,
  load: LoadScreeningTool,
  insulation: InsulationTool,
  nameplate: NameplateTool,
  photos: PhotosTool,
  notes: NotesTool,
  explain: ExplainTool,
  heatpump: HeatPumpTool,
  gas: GasTool,
  evacuation: EvacuationTool,
  refrigerantLog: RefrigerantLogTool,
  compressor: CompressorTool,
  airside: AirsideTool,
  maintenance: MaintenanceTool,
};

export function ToolHost({ ctx }: { ctx: ToolContext }) {
  const Component = REGISTRY[ctx.toolId];
  if (!Component) return <p className="hint">This tool is not available yet.</p>;
  return <VoiceEntry><Component ctx={ctx} /></VoiceEntry>;
}

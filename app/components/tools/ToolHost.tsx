"use client";

import type { ComponentType } from "react";
import type { ToolId } from "../../lib/job/registry";
import type { ToolContext } from "./context";
import AirflowTool from "./AirflowTool";
import DuctTool from "./DuctTool";
import LoadScreeningTool from "./LoadScreeningTool";
import ChargeTool from "./ChargeTool";
import ElectricalTool from "./ElectricalTool";
import FurnaceTool from "./FurnaceTool";
import StaticTool from "./StaticTool";

type ToolComponent = ComponentType<{ ctx: ToolContext }>;

const REGISTRY: Partial<Record<ToolId, ToolComponent>> = {
  electrical: ElectricalTool,
  charge: ChargeTool,
  furnace: FurnaceTool,
  static: StaticTool,
  airflow: AirflowTool,
  duct: DuctTool,
  load: LoadScreeningTool,
};

export function ToolHost({ ctx }: { ctx: ToolContext }) {
  const Component = REGISTRY[ctx.toolId];
  if (!Component) return <p className="hint">This tool is not available yet.</p>;
  return <Component ctx={ctx} />;
}

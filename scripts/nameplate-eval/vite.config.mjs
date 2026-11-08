import { fileURLToPath } from "node:url";
const here = fileURLToPath(new URL(".", import.meta.url));
const config = {
  root: here,
  logLevel: "error",
  build: { outDir: `${here}dist`, emptyOutDir: true, lib: { entry: `${here}entry.ts`, name: "nameplateEval", formats: ["iife"], fileName: () => "eval.js" } },
};
export default config;

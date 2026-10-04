import OpenAI from "openai";

export class AiConfigurationError extends Error {}

export type AiProviderConfig = {
  provider: "openrouter" | "openai" | "template";
  model: string;
  client?: OpenAI;
};

export function getAiProviderConfig(): AiProviderConfig {
  const readiness = getAiProviderReadiness();
  if (!readiness.ready) throw new AiConfigurationError(readiness.error);
  const requested = readiness.provider;
  const model = readiness.model!;
  if (requested === "openrouter") {
    return {
      provider: "openrouter",
      model,
      client: new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY!.trim(),
        timeout: 20_000,
        maxRetries: 0,
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://localhost",
          "X-Title": process.env.NEXT_PUBLIC_BRAND_PRODUCT_NAME || "Field Copilot",
        },
      }),
    };
  }

  if (requested === "openai") {
    return {
      provider: "openai",
      model,
      client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY!.trim(), timeout: 20_000, maxRetries: 0 }),
    };
  }

  return { provider: "template", model: "template" };
}

export function getAiProviderReadiness() {
  const provider = (process.env.AI_PROVIDER || "template").trim().toLowerCase();
  const model = provider === "openrouter" ? process.env.OPENROUTER_MODEL?.trim() || "openai/gpt-4o-mini" : provider === "openai" ? process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini" : "template";
  const configured = {
    AI_PROVIDER: Boolean(process.env.AI_PROVIDER?.trim()),
    OPENROUTER_API_KEY: Boolean(process.env.OPENROUTER_API_KEY?.trim()),
    OPENROUTER_MODEL: Boolean(process.env.OPENROUTER_MODEL?.trim()),
    OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY?.trim()),
    OPENAI_MODEL: Boolean(process.env.OPENAI_MODEL?.trim()),
  };
  let error: string | undefined;
  if (!["template", "openrouter", "openai"].includes(provider)) error = "AI_PROVIDER must be template, openrouter, or openai.";
  else if (provider === "openrouter" && !configured.OPENROUTER_API_KEY) error = "AI_PROVIDER=openrouter requires OPENROUTER_API_KEY.";
  else if (provider === "openai" && !configured.OPENAI_API_KEY) error = "AI_PROVIDER=openai requires OPENAI_API_KEY.";
  const supported = ["template", "openrouter", "openai"].includes(provider);
  return { provider: supported ? provider : "unsupported", model: supported ? model : null, ready: !error, configured, ...(error ? { error } : {}) };
}

export function parseJsonModelOutput<T>(raw: string, fallback: T): T {
  let cleaned = (raw || "").trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

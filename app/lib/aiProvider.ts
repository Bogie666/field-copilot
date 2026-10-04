import OpenAI from "openai";

export type AiProviderConfig = {
  provider: "openrouter" | "openai" | "template";
  model: string;
  client?: OpenAI;
};

export function getAiProviderConfig(): AiProviderConfig {
  const requested = (process.env.AI_PROVIDER || "template").trim().toLowerCase();
  if (requested === "openrouter" && process.env.OPENROUTER_API_KEY) {
    return {
      provider: "openrouter",
      model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
      client: new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://localhost",
          "X-Title": process.env.NEXT_PUBLIC_BRAND_PRODUCT_NAME || "Field Copilot",
        },
      }),
    };
  }

  if (requested === "openai" && process.env.OPENAI_API_KEY) {
    return {
      provider: "openai",
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
    };
  }

  return { provider: "template", model: "template" };
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

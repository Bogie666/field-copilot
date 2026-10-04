import { describe, expect, it, vi, afterEach } from "vitest";
import { getAiProviderConfig, parseJsonModelOutput } from "./aiProvider";

describe("AI provider selection", () => {
  const originalEnv = process.env;
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllEnvs();
  });

  it("uses OpenRouter only when it is explicitly selected and configured", () => {
    vi.stubEnv("AI_PROVIDER", "openrouter");
    vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key");
    vi.stubEnv("OPENROUTER_MODEL", "anthropic/claude-3.5-sonnet");
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");

    const config = getAiProviderConfig();

    expect(config.provider).toBe("openrouter");
    expect(config.model).toBe("anthropic/claude-3.5-sonnet");
  });

  it("uses OpenAI when it is explicitly selected and configured", () => {
    vi.stubEnv("AI_PROVIDER", "openai");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");

    const config = getAiProviderConfig();

    expect(config.provider).toBe("openai");
  });

  it("keeps template mode when API keys are present but AI is disabled", () => {
    vi.stubEnv("AI_PROVIDER", "template");
    vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key");
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");

    expect(getAiProviderConfig().provider).toBe("template");
  });

  it("strips markdown JSON fences from model output", () => {
    const parsed = parseJsonModelOutput<{ ok: boolean }>("```json\n{\"ok\":true}\n```", { ok: false });
    expect(parsed.ok).toBe(true);
  });
});

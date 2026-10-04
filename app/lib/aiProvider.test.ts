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

  it("rejects a selected provider without a usable key instead of silently using templates", () => {
    vi.stubEnv("AI_PROVIDER", "openrouter");
    vi.stubEnv("OPENROUTER_API_KEY", "   ");
    expect(() => getAiProviderConfig()).toThrow("OPENROUTER_API_KEY");
    vi.stubEnv("AI_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(() => getAiProviderConfig()).toThrow("OPENAI_API_KEY");
    vi.stubEnv("AI_PROVIDER", "unsupported-secret-value");
    expect(() => getAiProviderConfig()).toThrow("AI_PROVIDER");
  });

  it("trims configuration and bounds SDK retries and timeouts", () => {
    vi.stubEnv("AI_PROVIDER", " OPENROUTER ");
    vi.stubEnv("OPENROUTER_API_KEY", " test-key ");
    vi.stubEnv("OPENROUTER_MODEL", "  ");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.test");
    vi.stubEnv("NEXT_PUBLIC_BRAND_PRODUCT_NAME", "Test Copilot");
    const config = getAiProviderConfig();
    expect(config.model).toBe("openai/gpt-4o-mini");
    expect(config.client).toMatchObject({ apiKey: "test-key", baseURL: "https://openrouter.ai/api/v1", timeout: 20000, maxRetries: 0 });
    // Inspect headers without sending a request.
    expect((config.client as unknown as { _options: { defaultHeaders: unknown } })._options.defaultHeaders).toEqual({ "HTTP-Referer": "https://example.test", "X-Title": "Test Copilot" });
    vi.stubEnv("AI_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", " test-openai ");
    vi.stubEnv("OPENAI_MODEL", " custom-model ");
    expect(getAiProviderConfig()).toMatchObject({ model: "custom-model", client: { apiKey: "test-openai", timeout: 20000, maxRetries: 0 } });
  });

  it("strips markdown JSON fences from model output", () => {
    const parsed = parseJsonModelOutput<{ ok: boolean }>("```json\n{\"ok\":true}\n```", { ok: false });
    expect(parsed.ok).toBe(true);
  });
});

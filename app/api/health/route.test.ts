import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
const { constructor } = vi.hoisted(() => ({ constructor: vi.fn() }));
vi.mock("openai", () => ({ default: class { constructor(options: unknown) { constructor(options); } } }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("health AI readiness", () => {
  it("reports 503 and configuration names for missing selected credentials without exposing values", async () => {
    for (const [provider, key] of [["openrouter", "OPENROUTER_API_KEY"], ["openai", "OPENAI_API_KEY"]]) {
      vi.stubEnv("AI_PROVIDER", provider);
      vi.stubEnv(key, "  ");
      const response = GET();
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body).toMatchObject({ ok: false, ai: { provider, ready: false, configured: { [key]: false } } });
      expect(body.ai.error).toContain(key);
      expect(Object.values(body.ai.configured).every(value => typeof value === "boolean")).toBe(true);
    }
    vi.stubEnv("AI_PROVIDER", "unsupported-sensitive-value");
    const response = GET();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.ai).toMatchObject({ provider: "unsupported", model: null, ready: false });
    expect(body.ai.error).toContain("AI_PROVIDER");
    expect(JSON.stringify(body)).not.toContain("unsupported-sensitive-value");
    expect(constructor).not.toHaveBeenCalled();
  });
  it("reports template mode as ready without a key or paid calls", async () => {
    vi.stubEnv("AI_PROVIDER", "template");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(await GET().json()).toMatchObject({ ok: true, ai: { provider: "template", model: "template", ready: true } });
    expect(constructor).not.toHaveBeenCalled();
  });
  it("reports configured OpenRouter readiness without clients or secrets", async () => {
    vi.stubEnv("AI_PROVIDER", "openrouter");
    vi.stubEnv("OPENROUTER_API_KEY", "fake-sensitive-token");
    vi.stubEnv("OPENROUTER_MODEL", "");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "test-commit");
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, commitSha: "test-commit", ai: { provider: "openrouter", model: "openai/gpt-4o-mini", ready: true, configured: { AI_PROVIDER: true, OPENROUTER_API_KEY: true } } });
    expect(JSON.stringify(body)).not.toContain("fake-sensitive-token");
    expect(constructor).not.toHaveBeenCalled();
  });
});

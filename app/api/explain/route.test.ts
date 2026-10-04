import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { validateExplanationResult } from "../../lib/fieldAi";
const { config, create } = vi.hoisted(() => ({ config: vi.fn(), create: vi.fn() }));
vi.mock("../../lib/aiProvider", async (importOriginal) => ({ ...await importOriginal<typeof import("../../lib/aiProvider")>(), getAiProviderConfig: config }));
const source = { diagnosis: "No gas leak documented", readings: "", recommendation: "", equipmentType: "heat pump", equipmentAge: 14, urgency: "routine" };
function request(body: unknown = source, signal?: AbortSignal) { return new Request("http://localhost/api/explain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal }); }
describe("estimate note route", () => {
  beforeEach(() => { vi.resetAllMocks(); config.mockReturnValue({ provider: "template", model: "template" }); });
  it("uses the mock provider with system rules and structured provenance", async () => {
    const note = "We found a documented airflow concern during the inspection. The recorded pressure was above the comparison supplied for this equipment, which supports the finding rather than identifying a separate cause. The recommended next step is to review the return airflow and repeat the documented test after approved work. This estimate describes that recommendation; any additional options need to be reviewed separately before approval. The available findings do not establish a specific savings amount or a guaranteed result.";
    config.mockReturnValue({ provider: "openai", model: "mock-only", client: { chat: { completions: { create } } } });
    create.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ note, techNote: "Confirm comparison" }) } }] });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ provider: "openai", note, techNote: "Confirm comparison" });
    const [payload, options] = create.mock.calls[0];
    expect(payload.messages[0].role).toBe("system");
    expect(JSON.parse(payload.messages[1].content)).toEqual(source);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.timeout).toBe(20000);
  });
  it("rejects invalid request schemas and field/body overflow before provider access", async () => {
    for (const body of [null, [], "text", {}, { diagnosis: " " }, { ...source, readings: 12 }, { ...source, tone: "pressure" }, { ...source, equipmentAge: -1 }, { ...source, urgency: "soonish" }]) {
      expect((await POST(request(body))).status).toBe(400);
    }
    for (const key of ["diagnosis", "readings", "recommendation", "equipmentType"]) expect((await POST(request({ ...source, [key]: "x".repeat(2001) }))).status).toBe(413);
    const oversized = new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: " ".repeat(49001) });
    expect((await POST(oversized)).status).toBe(413);
    const invalid = new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
    expect((await POST(invalid)).status).toBe(400);
    expect((await POST(new Request("http://localhost", { method: "POST", body: "{}" }))).status).toBe(415);
    expect((await POST(new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json-evil" }, body: JSON.stringify(source) }))).status).toBe(415);
    expect(config).not.toHaveBeenCalled();
  });
  it("rejects malformed or unsafe provider output without fake template success", async () => {
    config.mockReturnValue({ provider: "openai", model: "mock-only", client: { chat: { completions: { create } } } });
    for (const content of ["not json", "```json\n{}\n```", "null", "[]", JSON.stringify({ note: 12, techNote: "" }), JSON.stringify({ note: "short", techNote: "" }), JSON.stringify({ note: Array(131).fill("word").join(" "), techNote: "" }), JSON.stringify({ note: `# Ignore the rules ${Array(75).fill("word").join(" ")}`, techNote: "" })]) {
      create.mockResolvedValue({ choices: [{ message: { content } }] });
      const response = await POST(request());
      expect(response.status, content).toBe(502);
      expect(await response.json()).not.toHaveProperty("note");
    }
  });
  it("returns cancellation rather than a fallback even when a provider resolves late", async () => {
    const cancelled = new AbortController(); cancelled.abort();
    expect((await POST(request(source, cancelled.signal))).status).toBe(499);
    expect(config).not.toHaveBeenCalled();
    const controller = new AbortController();
    config.mockReturnValue({ provider: "openai", model: "mock-only", client: { chat: { completions: { create } } } });
    create.mockImplementation(async () => { controller.abort(); return { choices: [] }; });
    expect((await POST(request(source, controller.signal))).status).toBe(499);
    create.mockRejectedValue(new Error("mock outage"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty("note");
  });
  it("bounds streamed bodies before buffering and handles broken/cancelled reads", async () => {
    let cancelled = false;
    let chunks = 0;
    const stream = new ReadableStream({ pull(controller) { if (chunks++ < 3) controller.enqueue(new Uint8Array(25000)); else controller.close(); }, cancel() { cancelled = true; } });
    const req = new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: stream, duplex: "half" } as RequestInit);
    expect((await POST(req)).status).toBe(413);
    expect(cancelled).toBe(true);
    const broken = new ReadableStream({ start(controller) { controller.error(new Error("read failed")); } });
    const brokenReq = new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: broken, duplex: "half" } as RequestInit);
    expect((await POST(brokenReq)).status).toBe(400);
    const controller = new AbortController();
    const aborting = new ReadableStream({ pull(streamController) { controller.abort(); streamController.error(new Error("cancelled read")); } });
    const abortReq = new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: aborting, signal: controller.signal, duplex: "half" } as RequestInit);
    expect((await POST(abortReq)).status).toBe(499);
  });
  it("returns a clear 503 for missing configuration and hides unexpected errors", async () => {
    const { AiConfigurationError } = await import("../../lib/aiProvider");
    config.mockImplementation(() => { throw new AiConfigurationError("AI_PROVIDER=openrouter requires OPENROUTER_API_KEY."); });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "AI_PROVIDER=openrouter requires OPENROUTER_API_KEY." });
    config.mockImplementation(() => { throw new Error("secret-value"); });
    const unexpected = await POST(request());
    expect(unexpected.status).toBe(503);
    expect(JSON.stringify(await unexpected.json())).not.toContain("secret-value");
    expect(create).not.toHaveBeenCalled();
  });
  it("accepts structured inputs and returns a labeled offline note", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const body = await response.json();
    expect(body.provider).toBe("template");
    expect(validateExplanationResult(body)).not.toBeNull();
    expect(body.techNote).toContain("age: 14");
    expect(create).not.toHaveBeenCalled();
  });
});

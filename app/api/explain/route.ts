import { NextResponse } from "next/server";
import { getAiProviderConfig } from "../../lib/aiProvider";
import { explanationFallback, explanationMessages, MAX_EXPLANATION_BODY_BYTES, validateExplanationInput, validateExplanationResult } from "../../lib/fieldAi";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store, max-age=0" };
function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: noStore }); }
export async function POST(req: Request) {
  if (req.signal.aborted) return json({ error: "Generation cancelled." }, 499);
  if ((req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase() !== "application/json") return json({ error: "Content-Type must be application/json." }, 415);
  if (Number(req.headers.get("content-length") || 0) > MAX_EXPLANATION_BODY_BYTES) return json({ error: "Request is too large." }, 413);
  let raw = "";
  const reader = req.body?.getReader();
  if (reader) {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let bytes = 0;
    const onAbort = () => { void reader.cancel().catch(() => undefined); };
    req.signal.addEventListener("abort", onAbort, { once: true });
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (req.signal.aborted) return json({ error: "Generation cancelled." }, 499);
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_EXPLANATION_BODY_BYTES) { await reader.cancel(); return json({ error: "Request is too large." }, 413); }
        raw += decoder.decode(value, { stream: true });
      }
      raw += decoder.decode();
    } catch {
      return json({ error: req.signal.aborted ? "Generation cancelled." : "Unable to read JSON request." }, req.signal.aborted ? 499 : 400);
    } finally { req.signal.removeEventListener("abort", onAbort); reader.releaseLock(); }
  }
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON request." }, 400); }
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const record = body as Record<string, unknown>;
    for (const key of ["diagnosis", "readings", "recommendation", "equipmentType"]) {
      if (typeof record[key] === "string" && record[key].length > 2_000) return json({ error: `${key} is too long.` }, 413);
    }
  }
  const input = validateExplanationInput(body);
  if (!input) return json({ error: "Enter a diagnosis and valid documented fields. Text is limited to 2000 characters; age must be 0–100 years. Unsupported fields are rejected." }, 400);
  if (req.signal.aborted) return json({ error: "Generation cancelled." }, 499);
  const ai = getAiProviderConfig();
  if (!ai.client) return json({ ok: true, provider: "template", ...explanationFallback(input) });
  try {
    const completion = await ai.client.chat.completions.create({
      model: ai.model, messages: explanationMessages(input),
      response_format: { type: "json_object" }, temperature: 0.2, max_tokens: 800,
    }, { timeout: 20_000, signal: req.signal });
    if (req.signal.aborted) return json({ error: "Generation cancelled." }, 499);
    let parsed: unknown;
    try { parsed = JSON.parse(completion.choices[0]?.message?.content || ""); }
    catch { return json({ error: "AI returned malformed JSON. Please retry; no draft was accepted." }, 502); }
    const valid = validateExplanationResult(parsed);
    if (!valid) return json({ error: "AI returned an invalid customer note. Please retry; no draft was accepted." }, 502);
    return json({ ok: true, provider: ai.provider, ...valid });
  } catch {
    if (req.signal.aborted) return json({ error: "Generation cancelled." }, 499);
    return json({ error: "AI drafting is unavailable. Please retry." }, 503);
  }
}

import { NextResponse } from "next/server";
import { getAiProviderConfig, parseJsonModelOutput } from "../../lib/aiProvider";
import { MAX_TRANSCRIPT_CHARS, notesFallback, validateStructuredNotes } from "../../lib/fieldAi";

export const dynamic = "force-dynamic";
const MAX_BODY_CHARS = MAX_TRANSCRIPT_CHARS + 1_000;
const noStore = { "Cache-Control": "no-store, max-age=0" };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStore });
}

export async function POST(req: Request) {
  if (!(req.headers.get("content-type") || "").includes("application/json")) return json({ error: "Content-Type must be application/json." }, 415);
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_BODY_CHARS) return json({ error: "Request is too large." }, 413);
  const raw = await req.text();
  if (raw.length > MAX_BODY_CHARS) return json({ error: "Request is too large." }, 413);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON request." }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Request must be a JSON object." }, 400);
  const transcriptValue = (body as Record<string, unknown>).transcript;
  if (typeof transcriptValue !== "string") return json({ error: "Transcript must be text." }, 400);
  if (transcriptValue.length > MAX_TRANSCRIPT_CHARS) return json({ error: "Transcript is too long." }, 413);
  const transcript = transcriptValue.trim();
  if (!transcript) return json({ error: "Enter or record a field note first." }, 400);
  const fallback = notesFallback(transcript);
  const ai = getAiProviderConfig();
  if (!ai.client) return json({ ok: true, provider: "template", ...fallback });

  const prompt = `Convert the HVAC technician transcript into structured job notes. Use only documented facts. Do not infer work, readings, diagnosis, recommendations, approval, or declined work. Write "Not documented" where needed. Be concise, professional, and use no em dashes. Return JSON with non-empty string keys: workPerformed, measurementsReadings, diagnosisFindings, recommendations, customerDeclinedWork.\n\nTranscript:\n${transcript}`;
  try {
    const completion = await ai.client.chat.completions.create({
      model: ai.model,
      messages: [
        { role: "system", content: "Structure field notes without adding facts. Return JSON only." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.15,
      max_tokens: 1_200,
    }, { timeout: 20_000, signal: req.signal });
    const parsed = parseJsonModelOutput<unknown>(completion.choices[0]?.message?.content || "", null);
    const valid = validateStructuredNotes(parsed);
    if (!valid) return json({ ok: true, provider: "template", warning: "AI returned an invalid response, so the review-first template was used.", ...fallback });
    return json({ ok: true, provider: ai.provider, ...valid });
  } catch {
    return json({ ok: true, provider: "template", warning: "AI was unavailable, so the review-first template was used.", ...fallback });
  }
}

"use client";

import { explanationWordCount, type ExplanationInput } from "../lib/fieldAi";
import { useExplanationDraft } from "./useExplanationDraft";
import { Callout } from "./ui";

/** Draft, review and copy UI for the customer estimate note. Fed a validated input by the caller. */
export default function ExplanationPanel({ input, issues, safetyPresent }: { input: ExplanationInput | null; issues: string[]; safetyPresent?: boolean }) {
  const draft = useExplanationDraft(input);
  const { result, provider, loading, error, status, stale, reviewed, issue } = draft;

  return (
    <section className="panel" aria-label="Draft the customer note">
      <h2>Customer estimate note</h2>
      <p className="hint">Drafts a plain note from the findings you selected. You review and edit it before copying. It cannot confirm a diagnosis or promise an outcome.</p>
      <Callout title="Privacy">
        <p>The selected facts are sent to the configured AI provider when one is enabled. The job label, photos and notes are never sent. Do not type names, addresses or phone numbers into findings.</p>
      </Callout>
      {issues.length > 0 && (
        <Callout tone="warn" title="Cannot build the note yet">
          <ul>
            {issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </Callout>
      )}
      {input && (
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 650, minHeight: 44, display: "flex", alignItems: "center" }}>What will be sent</summary>
          <pre className="hint" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: 0, fontFamily: "inherit" }}>{JSON.stringify(input, null, 2)}</pre>
        </details>
      )}
      <div className="btnRow" style={{ marginTop: 0 }}>
        <button className="btn primary" type="button" onClick={() => void draft.generate()} disabled={loading || !input}>
          {loading ? "Generating..." : result ? "Regenerate" : "Generate estimate note"}
        </button>
        {loading && (
          <button className="btn" type="button" onClick={draft.cancel}>
            Cancel
          </button>
        )}
      </div>
      <p className="hint" role="status" aria-live="polite">
        <span className="chip" style={{ marginRight: 8 }}>{provider ? `Source: ${provider}` : "Not generated"}</span>
        {status}
      </p>
      {error && (
        <div className="callout" data-tone="warn" role="alert">
          {error}
        </div>
      )}
      <div className="field">
        <label htmlFor="customer-note">Customer estimate note</label>
        <textarea id="customer-note" style={{ minHeight: 180 }} value={result?.note || ""} disabled={!result} placeholder="One plain 70 to 130 word note will appear here." onChange={(e) => draft.edit("note", e.target.value)} />
        <span className="hint" aria-live="polite">
          {explanationWordCount(result?.note || "")} words, 70 to 130 required
        </span>
      </div>
      {result && issue && (
        <div className="callout" data-tone="warn" role="alert">
          {issue}
        </div>
      )}
      <div className="field">
        <label htmlFor="private-tech-note">Note for tech (private, never copied to customer)</label>
        <textarea id="private-tech-note" maxLength={2000} disabled={!result} value={result?.techNote || ""} placeholder="Missing details or contradictions for technician review." onChange={(e) => draft.edit("techNote", e.target.value)} />
      </div>
      {stale && result && (
        <div className="callout" data-tone="warn" role="alert">
          This draft is stale. Regenerate using the current details.
        </div>
      )}
      <label className="check">
        <input type="checkbox" checked={reviewed} disabled={!result || loading || stale || !!issue} onChange={(e) => draft.setReviewed(e.target.checked)} />
        <span>I reviewed this customer note against the documented facts and estimate{safetyPresent ? ", including the safety condition" : ""}</span>
      </label>
      <button className="btn primary block" type="button" disabled={!draft.canCopy} onClick={() => void draft.copy()}>
        Copy customer note
      </button>
    </section>
  );
}

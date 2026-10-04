"use client";

import { useState } from "react";
import { copyText } from "../../lib/clientTools";
import { TOOLS } from "../../lib/job/registry";
import type { Finding, Reading, Severity } from "../../lib/job/types";
import { ActionBar, Callout, ErrorList, SeverityChip, TextField } from "../ui";
import type { ToolContext } from "./context";
import PhotoPicker from "./PhotoPicker";

export type BuiltFinding = {
  severity: Severity;
  title: string;
  diagnosis: string;
  readings: Reading[];
  reference?: string;
  inputs: Record<string, unknown>;
  /** Safety findings from this tool must carry a photo. */
  requiresPhotoForSafety?: boolean;
};

type Props = {
  ctx: ToolContext;
  /** Null when there is no valid result yet. */
  built: BuiltFinding | null;
  /** Hash of the current inputs, to tell saved from unsaved edits. */
  hash: string;
  safetyPrompt?: string;
  /** Offered through a button. Never filled in without the tech pressing it. */
  suggestedRecommendation?: string;
  suggestedSafetyAction?: string;
};

/**
 * Review step shared by every finding tool: optional next step, a required safety action
 * for safety results, then Save. Nothing is written until the tech presses Save.
 */
export default function SaveFinding({ ctx, built, hash, safetyPrompt, suggestedRecommendation, suggestedSafetyAction }: Props) {
  const { api, saved, scope, toolId } = ctx;
  const [recommendation, setRecommendation] = useState(saved?.recommendation ?? "");
  const [safetyAction, setSafetyAction] = useState(saved?.safetyAction ?? "");
  const [photoIds, setPhotoIds] = useState<string[]>(saved?.photoIds ?? []);
  // Outcome of the last Save press. It only applies to the inputs it was pressed for.
  const [outcome, setOutcome] = useState<{ hash: string; message: string; errors: string[] } | null>(null);
  const current = outcome && outcome.hash === hash ? outcome : null;
  const errors = current?.errors ?? [];
  const message = current?.message ?? "";

  const tool = TOOLS[toolId];
  const isSafety = built?.severity === "safety";

  if (!built) {
    return (
      <p className="hint" role="status">
        Enter your readings to see a result you can save.
      </p>
    );
  }

  if (!api || !scope || !tool.findingKey) {
    const text = [built.title, built.diagnosis, built.reference ? `Reference: ${built.reference}` : ""].filter(Boolean).join("\n");
    return (
      <div className="btnRow">
        <button
          className="btn"
          type="button"
          onClick={() => {
            copyText(text).then(
              () => setOutcome({ hash, message: "Result copied.", errors: [] }),
              (e: unknown) => setOutcome({ hash, message: e instanceof Error ? e.message : "Copy failed. Select the result and copy it manually.", errors: [] }),
            );
          }}
        >
          Copy result
        </button>
        <p className="hint" role="status" style={{ flex: "1 1 100%" }}>
          {message || "Start a job to save this result and use it in a customer note."}
        </p>
      </div>
    );
  }

  const unchanged = !!saved && saved.inputsHash === hash && (saved.recommendation ?? "") === recommendation.trim() && (saved.safetyAction ?? "") === safetyAction.trim() && (saved.photoIds ?? []).join() === photoIds.join();
  const missingSafety = isSafety && !safetyAction.trim();
  const missingPhoto = isSafety && !!built.requiresPhotoForSafety && photoIds.length === 0;
  const blocked = missingSafety || missingPhoto;

  function save() {
    if (!api || !scope || !tool.findingKey || !built) return;
    const finding: Omit<Finding, "confirmedAt"> = {
      key: tool.findingKey,
      toolId,
      scope,
      severity: built.severity,
      title: built.title,
      diagnosis: built.diagnosis,
      readings: built.readings,
      reference: built.reference || undefined,
      recommendation: recommendation.trim() || undefined,
      safetyAction: isSafety ? safetyAction.trim() : undefined,
      photoIds: photoIds.length ? photoIds : undefined,
      requiresPhotoForSafety: built.requiresPhotoForSafety,
      inputs: built.inputs,
      inputsHash: hash,
    };
    const result = api.saveFinding(finding);
    if (result.ok) setOutcome({ hash, message: saved ? "Finding updated." : "Finding saved to this job.", errors: [] });
    else setOutcome({ hash, message: "", errors: result.errors });
  }

  return (
    <>
      <section className="panel" aria-label="Review and save">
        <h3>
          Save to this job <SeverityChip severity={built.severity} />
        </h3>
        {isSafety && (
          <Callout tone="safety" title="Safety finding">
            <p>This finding is pinned first on the summary. It needs a documented safety action{built.requiresPhotoForSafety ? " and a photo" : ""} before you can save it.</p>
          </Callout>
        )}
        {isSafety && <TextField label="Safety action taken" value={safetyAction} onChange={setSafetyAction} multiline hint={safetyPrompt ?? "Describe what you did about the hazard."} />}
        {isSafety && suggestedSafetyAction && !safetyAction.trim() && (
          <button className="btn ghost" type="button" onClick={() => setSafetyAction(suggestedSafetyAction)}>
            Use suggested wording (edit to match what you did)
          </button>
        )}
        {isSafety && ctx.system && <PhotoPicker systemId={ctx.system.id} selected={photoIds} onChange={setPhotoIds} required={built.requiresPhotoForSafety} />}
        <TextField label="Recommended next step (optional)" value={recommendation} onChange={setRecommendation} multiline hint="Only write what you recommend. The customer note never invents a recommendation." />
        {suggestedRecommendation && !recommendation.trim() && (
          <button className="btn ghost" type="button" onClick={() => setRecommendation(suggestedRecommendation)}>
            Use suggested next step
          </button>
        )}
        <ErrorList errors={errors} />
      </section>
      <ActionBar note={message || (unchanged ? "Saved to this job" : saved ? "You have unsaved changes" : blocked ? (missingSafety ? "Add the safety action to save" : "Attach a photo to save") : "Not saved yet")}>
        <button className="btn primary" type="button" onClick={save} disabled={blocked || unchanged}>
          {unchanged ? "Saved" : saved ? "Update finding" : "Save finding"}
        </button>
        {saved && (
          <button className="btn danger" type="button" onClick={() => api.dispatch({ type: "removeFinding", key: saved.key, scope: saved.scope })}>
            Remove
          </button>
        )}
      </ActionBar>
    </>
  );
}

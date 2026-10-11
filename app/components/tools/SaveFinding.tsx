"use client";

import { useRef, useState } from "react";
import { copyText } from "../../lib/clientTools";
import { TOOLS } from "../../lib/job/registry";
import { equipmentForScope, hashInputs, photoMatchesScope, type Finding, type Reading, type Severity } from "../../lib/job/types";
import { ActionBar, Callout, ErrorList, SeverityChip, TextField } from "../ui";
import type { ToolContext } from "./context";
import PhotoPicker from "./PhotoPicker";
import { useFormState } from "./useFormState";

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
  const [review, setReview] = useFormState(ctx, { recommendation: "", safetyAction: "", actionTaken: "", verification: "", photoIds: [] as string[] }, undefined, {
    slot: "review",
    savedInputs: { recommendation: saved?.recommendation ?? "", safetyAction: saved?.safetyAction ?? "", photoIds: saved?.photoIds ?? [], actionTaken: saved?.actionTaken ?? "", verification: saved?.verification ?? "" },
  });
  const { recommendation, safetyAction, actionTaken, verification } = review;
  const photoIds = review.photoIds.filter(id => api?.job?.photos.some(p => p.id === id && scope && photoMatchesScope(p, scope)));
  const setRecommendation = (value: string) => setReview("recommendation", value);
  const setSafetyAction = (value: string) => setReview("safetyAction", value);
  const setPhotoIds = (value: string[]) => setReview("photoIds", value);
  // Outcome of the last Save press. It only applies to the inputs it was pressed for.
  const [outcome, setOutcome] = useState<{ hash: string; message: string; errors: string[] } | null>(null);
  const saveStamp = hashInputs({ hash, review, scope });
  const current = outcome && outcome.hash === saveStamp ? outcome : null;
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const errors = current?.errors ?? [];
  const message = current?.message ?? "";

  const [reviewedStamp, setReviewedStamp] = useState<string | null>(null);
  const reviewStamp = hashInputs({ hash, equipment: ctx.system && scope ? equipmentForScope(ctx.system, scope) : undefined, staleAt: saved?.staleAt });
  const stale = !!saved?.staleAt;
  const staleNotice = stale ? <Callout title="Finding needs reconfirmation"><p>{saved?.staleReason}</p><p>This historical finding is excluded from customer notes until you review the readings and references and explicitly save it again. Old input values are retained, not silently replaced.</p></Callout> : null;
  const tool = TOOLS[toolId];
  const isSafety = built?.severity === "safety";

  if (!built) {
    return (
      <>{staleNotice}<p className="hint" role="status">
        Enter your readings to see a result you can save.
      </p></>
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
              () => setOutcome({ hash: saveStamp, message: "Result copied.", errors: [] }),
              (e: unknown) => setOutcome({ hash: saveStamp, message: e instanceof Error ? e.message : "Copy failed. Select the result and copy it manually.", errors: [] }),
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

  const unchanged = !stale && !!saved && saved.inputsHash === hash && (saved.recommendation ?? "") === recommendation.trim() && (saved.safetyAction ?? "") === safetyAction.trim() && (saved.photoIds ?? []).join() === photoIds.join() && (saved.actionTaken ?? "") === actionTaken.trim() && (saved.verification ?? "") === verification.trim();
  const missingSafety = isSafety && !safetyAction.trim();
  const missingPhoto = isSafety && !!built.requiresPhotoForSafety && photoIds.length === 0;
  const blocked = missingSafety || missingPhoto || (stale && reviewedStamp !== reviewStamp);

  async function save() {
    if (!api || !scope || !tool.findingKey || !built || blocked || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
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
      actionTaken: actionTaken.trim() || undefined,
      verification: verification.trim() || undefined,
      safetyAction: isSafety ? safetyAction.trim() : undefined,
      photoIds: photoIds.length ? photoIds : undefined,
      requiresPhotoForSafety: built.requiresPhotoForSafety,
      inputs: built.inputs,
      inputsHash: hash,
    };
    try {
      const result = await api.saveFinding(finding);
      if (result.ok) setOutcome({ hash: saveStamp, message: result.persistent ? "Finding saved on this device." : "Finding kept for this session only. Closing the session may lose it.", errors: [] });
      else setOutcome({ hash: saveStamp, message: "", errors: result.errors });
    } catch (error) {
      setOutcome({ hash: saveStamp, message: "", errors: [error instanceof Error ? error.message : "The finding could not be saved. Try again."] });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <>
      {staleNotice}
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
        <PhotoPicker scope={scope} selected={photoIds} onChange={setPhotoIds} required={isSafety && built.requiresPhotoForSafety} />
        <TextField label="Action taken (optional)" value={actionTaken} onChange={(value) => setReview("actionTaken", value)} multiline maxLength={2000} hint="Record only work actually performed. Leave blank if no action was taken." />
        <TextField label="Verification after action (optional)" value={verification} onChange={(value) => setReview("verification", value)} multiline maxLength={2000} hint="Record the recheck and its result, or why verification is still pending. Blank means not documented." />
        <TextField label="Recommended next step (optional)" value={recommendation} onChange={setRecommendation} multiline hint="Only write what you recommend. The customer note never invents a recommendation." />
        {suggestedRecommendation && !recommendation.trim() && (
          <button className="btn ghost" type="button" onClick={() => setRecommendation(suggestedRecommendation)}>
            Use suggested next step
          </button>
        )}
        {stale && <label className="check"><input type="checkbox" checked={reviewedStamp === reviewStamp} onChange={(e) => setReviewedStamp(e.target.checked ? reviewStamp : null)} />I reviewed the readings and references against the current nameplate.</label>}
        <ErrorList errors={errors} />
      </section>
      <ActionBar note={saving ? "Saving finding…" : message || (unchanged ? (api.persistent ? "Saved on this device" : "Kept for this session only") : saved ? "You have unsaved changes" : blocked ? (missingSafety ? "Add the safety action to save" : missingPhoto ? "Attach a photo to save" : "Review the current readings and references to reconfirm") : "Not saved yet")}>
        <button className="btn primary" type="button" onClick={() => void save()} disabled={saving || blocked || unchanged}>
          {saving ? "Saving…" : unchanged ? "Saved" : stale ? "Reconfirm finding" : saved ? "Update finding" : "Save finding"}
        </button>
        {saved && (
          <button className="btn danger" type="button" disabled={saving} onClick={async () => {
            if (savingRef.current) return;
            savingRef.current = true;
            setSaving(true);
            try {
              const result = await api.saveAction({ type: "removeFinding", key: saved.key, scope: saved.scope });
              if (!result.ok) setOutcome({ hash: saveStamp, message: "", errors: result.errors });
            } catch (error) {
              setOutcome({ hash: saveStamp, message: "", errors: [error instanceof Error ? error.message : "The finding could not be removed."] });
            } finally { savingRef.current = false; setSaving(false); }
          }}>
            Remove
          </button>
        )}
      </ActionBar>
    </>
  );
}

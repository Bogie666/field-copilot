"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { copyText, fetchJsonWithTimeout } from "../lib/clientTools";
import { customerNoteIssue, formatExplanation, validateExplanationResult, type ExplanationInput, type ExplanationResult } from "../lib/fieldAi";

type ApiResult = ExplanationResult & { provider?: string };

/**
 * Draft state machine for the customer estimate note. Behavior carried over from the original tool:
 * review is required before copy, a changed source makes the draft stale, editing cancels any
 * pending request, and late or cancelled responses can never overwrite what the tech is reading.
 * Staleness and review are derived from the input key, so there is no effect to keep in sync.
 */
export function useExplanationDraft(input: ExplanationInput | null) {
  const [result, setResult] = useState<ExplanationResult | null>(null);
  const [provider, setProvider] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Ready to generate.");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [forceStale, setForceStale] = useState(false);
  const [reviewedFor, setReviewedFor] = useState<{ key: string; version: number } | null>(null);
  const [editVersion, setEditVersion] = useState(0);
  const requestRef = useRef<AbortController | null>(null);
  const inputKey = JSON.stringify(input);

  useEffect(() => () => requestRef.current?.abort(), []);

  // A changed source aborts any request in flight. The generate() finally block resets loading.
  useEffect(() => {
    requestRef.current?.abort();
  }, [inputKey]);

  const cancelPending = useCallback(() => {
    const pending = requestRef.current;
    requestRef.current = null;
    pending?.abort();
    setLoading(false);
  }, []);

  const stale = !!result && (forceStale || generatedKey !== inputKey);
  const reviewed = !!result && !stale && reviewedFor?.key === inputKey && reviewedFor.version === editVersion;

  const setReviewed = useCallback(
    (value: boolean) => {
      setReviewedFor(value ? { key: inputKey, version: editVersion } : null);
    },
    [inputKey, editVersion],
  );

  const cancel = useCallback(() => {
    cancelPending();
    setForceStale(true);
    setError("Generation cancelled.");
    setStatus("Generation cancelled. Regenerate before copying.");
  }, [cancelPending]);

  const generate = useCallback(async () => {
    if (!input) {
      setError("Add the details above first.");
      return;
    }
    const requestKey = inputKey;
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    setLoading(true);
    setForceStale(true);
    setError("");
    setStatus("Generating estimate note...");
    try {
      const body = await fetchJsonWithTimeout<ApiResult>("/api/explain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal: controller.signal });
      if (requestRef.current !== controller || controller.signal.aborted) return;
      const valid = validateExplanationResult(body);
      if (!valid) throw new Error("The service returned an invalid note. No draft was accepted.");
      setResult(valid);
      setProvider(body.provider || "unknown");
      setGeneratedKey(requestKey);
      setForceStale(false);
      setEditVersion((v) => v + 1);
      setStatus(body.provider === "template" ? "Offline template ready. Review and edit before sharing." : "AI draft ready. Review and edit before sharing.");
    } catch (caught) {
      if (requestRef.current !== controller || controller.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : "Generation failed. Please retry.");
      setStatus("No new draft accepted. Regenerate before copying.");
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }, [input, inputKey]);

  const edit = useCallback(
    (key: keyof ExplanationResult, value: string) => {
      cancelPending();
      setResult((current) => (current ? { ...current, [key]: value } : current));
      setEditVersion((v) => v + 1);
    },
    [cancelPending],
  );

  const issue = customerNoteIssue(result?.note || "");
  const canCopy = !!result && !loading && !stale && reviewed && !issue;
  const shownStatus = result && !loading && generatedKey !== inputKey && !forceStale ? "Source details changed. Regenerate before copying." : status;

  const copy = useCallback(async () => {
    if (!canCopy || !result) return;
    try {
      await copyText(formatExplanation(result));
      setError("");
      setStatus("Customer note copied. Private tech note was not included.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Copy failed. Select only the customer note and copy manually.");
    }
  }, [canCopy, result]);

  return { result, provider, loading, error, status: shownStatus, stale, reviewed, setReviewed, issue, canCopy, generate, cancel, edit, copy };
}

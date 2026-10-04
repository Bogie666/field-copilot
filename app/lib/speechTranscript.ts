type SpeechResultLike = {
  isFinal?: boolean;
  0?: { transcript?: string };
};

type SpeechEventLike = {
  resultIndex?: number;
  results: ArrayLike<SpeechResultLike>;
};

export type SpeechTranscriptState = {
  finalTranscript: string;
  interimTranscript: string;
  displayTranscript: string;
};

function cleanSegment(value: string | undefined): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

function joinParts(parts: string[]): string {
  return parts.map(cleanSegment).filter(Boolean).join(" ").trim();
}

export function applySpeechResults(previousFinalTranscript: string, event: SpeechEventLike): SpeechTranscriptState {
  const finalParts = [previousFinalTranscript];
  const interimParts: string[] = [];
  const startIndex = typeof event.resultIndex === "number" ? event.resultIndex : 0;

  for (let index = startIndex; index < event.results.length; index += 1) {
    const result = event.results[index];
    const segment = cleanSegment(result?.[0]?.transcript);
    if (!segment) continue;

    if (result.isFinal) {
      finalParts.push(segment);
    } else {
      interimParts.push(segment);
    }
  }

  const finalTranscript = joinParts(finalParts);
  const interimTranscript = joinParts(interimParts);

  return {
    finalTranscript,
    interimTranscript,
    displayTranscript: joinParts([finalTranscript, interimTranscript]),
  };
}
